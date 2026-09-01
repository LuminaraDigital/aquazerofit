package fit.aquazero.app.feature.nutrition

import androidx.annotation.StringRes
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import fit.aquazero.app.R
import fit.aquazero.app.core.common.LocalDates
import fit.aquazero.app.core.common.MealTrust
import fit.aquazero.app.core.data.CatalogRepository
import fit.aquazero.app.core.data.VisionRepository
import fit.aquazero.app.core.model.ApiResult
import fit.aquazero.app.core.model.FoodDto
import fit.aquazero.app.core.model.MealLogItemDto
import fit.aquazero.app.core.model.MealType
import fit.aquazero.app.core.model.VisionJobDto
import fit.aquazero.app.core.model.VisionJobStatus
import fit.aquazero.app.core.model.VisionPredictionDto
import fit.aquazero.app.core.ui.NutritionFormat
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import javax.inject.Inject
import kotlin.math.roundToInt

/** Per-gram macro ratios, so a portion edit recomputes deterministically. */
data class PerGram(
    val kcal: Double,
    val proteinG: Double,
    val carbsG: Double,
    val fatG: Double,
)

/** One editable row on the confirmation gate. */
data class ReviewItem(
    val key: String,
    val foodId: String?,
    val name: String,
    val grams: Int,
    val perGram: PerGram,
    /** Model confidence 0..1, or null for an item the user added by hand. */
    val confidence: Double?,
)

/** Confidence banding for the per-item chip. */
enum class ConfidenceTier { High, Medium, Low }

/** Rolled-up macros for the summary card. */
data class ReviewTotals(
    val kcal: Double = 0.0,
    val proteinG: Double = 0.0,
    val carbsG: Double = 0.0,
    val fatG: Double = 0.0,
)

/**
 * The arithmetic behind the confirmation gate.
 *
 * Every number the user sees after a gram edit is computed **here, in code**,
 * from the ratios captured when the list was seeded — the model is never asked
 * again, and a second opinion can never contradict the first. Pure, so all of
 * it is covered by JVM unit tests.
 */
object AnalysisReview {

    /** Matches `GramsStepper`'s clamp and the API's item-gram plausibility bounds. */
    const val MIN_GRAMS: Int = 5

    /** Upper gram clamp. */
    const val MAX_GRAMS: Int = 2000

    /** `confirmVisionSchema` accepts 1..30 items. */
    const val MAX_ITEMS: Int = 30

    /** ≥75% reads as High. */
    const val HIGH_CONFIDENCE: Double = 0.75

    /** ≥50% reads as Medium. */
    const val MEDIUM_CONFIDENCE: Double = 0.5

    /** Ratios for one gram. A zero-gram prediction yields zeroes, never NaN. */
    fun perGramOf(
        grams: Double,
        kcal: Double,
        proteinG: Double,
        carbsG: Double,
        fatG: Double,
    ): PerGram = if (grams > 0.0) {
        PerGram(
            kcal = kcal / grams,
            proteinG = proteinG / grams,
            carbsG = carbsG / grams,
            fatG = fatG / grams,
        )
    } else {
        PerGram(0.0, 0.0, 0.0, 0.0)
    }

    /**
     * Seed the editable list from the job's predictions. Called exactly once
     * per job — see [AnalysisUiState.seeded]. Never auto-commits anything.
     */
    fun seed(predictions: List<VisionPredictionDto>): List<ReviewItem> =
        predictions.take(MAX_ITEMS).mapIndexed { index, prediction ->
            ReviewItem(
                key = "pred-$index",
                foodId = prediction.foodId,
                name = prediction.name,
                grams = prediction.estimatedGrams.roundToInt().coerceIn(MIN_GRAMS, MAX_GRAMS),
                perGram = perGramOf(
                    grams = prediction.estimatedGrams,
                    kcal = prediction.kcal,
                    proteinG = prediction.proteinG,
                    carbsG = prediction.carbsG,
                    fatG = prediction.fatG,
                ),
                confidence = prediction.confidence.takeIf { it > 0.0 },
            )
        }

    /** A row for a food the user searched for and added. */
    fun fromFood(food: FoodDto, grams: Int, key: String): ReviewItem {
        val clamped = grams.coerceIn(MIN_GRAMS, MAX_GRAMS)
        return ReviewItem(
            key = key,
            foodId = food.id,
            name = food.name,
            grams = clamped,
            perGram = PerGram(
                kcal = food.per100g.kcal / 100.0,
                proteinG = food.per100g.proteinG / 100.0,
                carbsG = food.per100g.carbsG / 100.0,
                fatG = food.per100g.fatG / 100.0,
            ),
            confidence = null,
        )
    }

    /** User-applied cooking fat from a preset chip (never auto-injected). */
    fun fromCookingFatPreset(preset: MealTrust.CookingFatPreset, key: String): ReviewItem {
        val grams = preset.grams.roundToInt().coerceIn(MIN_GRAMS, MAX_GRAMS)
        val base = preset.grams.coerceAtLeast(1.0)
        return ReviewItem(
            key = key,
            foodId = null,
            name = preset.label,
            grams = grams,
            perGram = PerGram(
                kcal = preset.kcal / base,
                proteinG = 0.0,
                carbsG = 0.0,
                fatG = preset.fatG / base,
            ),
            confidence = null,
        )
    }

    fun shouldShowFatCaution(items: List<ReviewItem>): Boolean {
        val totals = totals(items)
        return MealTrust.shouldShowFatCaution(
            items.map { it.name },
            totals.kcal,
            totals.fatG,
        )
    }

    /** The wire item for one row, recomputed from its ratios. */
    fun toMealLogItem(item: ReviewItem): MealLogItemDto = MealLogItemDto(
        foodId = item.foodId,
        name = item.name,
        grams = item.grams.toDouble(),
        kcal = (item.perGram.kcal * item.grams).roundToInt().toDouble(),
        proteinG = NutritionFormat.round1(item.perGram.proteinG * item.grams),
        carbsG = NutritionFormat.round1(item.perGram.carbsG * item.grams),
        fatG = NutritionFormat.round1(item.perGram.fatG * item.grams),
    )

    /** Totals across the edited list, summed from the displayed values. */
    fun totals(items: List<ReviewItem>): ReviewTotals {
        val computed = items.map(::toMealLogItem)
        return ReviewTotals(
            kcal = computed.sumOf { it.kcal },
            proteinG = NutritionFormat.round1(computed.sumOf { it.proteinG }),
            carbsG = NutritionFormat.round1(computed.sumOf { it.carbsG }),
            fatG = NutritionFormat.round1(computed.sumOf { it.fatG }),
        )
    }

    /**
     * Fold a polled job into screen state.
     *
     * This is where the **seed-once rule** lives: predictions become editable
     * rows exactly once, and every later poll leaves [AnalysisUiState.items]
     * untouched. Without that, a re-poll landing after the user renamed an
     * item or changed a portion would silently throw the edit away — and the
     * user would then confirm numbers they never chose.
     *
     * The returned state is terminal when its phase is no longer
     * [AnalysisPhase.Scanning].
     */
    fun fold(current: AnalysisUiState, job: VisionJobDto): AnalysisUiState = when (job.status) {
        VisionJobStatus.QUEUED, VisionJobStatus.PROCESSING -> current.copy(
            phase = AnalysisPhase.Scanning,
            mealType = job.mealType,
        )

        VisionJobStatus.SUCCEEDED, VisionJobStatus.CONFIRMED -> if (current.seeded) {
            current.copy(
                phase = AnalysisPhase.Review,
                confirmed = current.confirmed || job.status == VisionJobStatus.CONFIRMED,
            )
        } else {
            current.copy(
                phase = AnalysisPhase.Review,
                mealType = job.mealType,
                items = seed(job.predictions),
                seeded = true,
                confirmed = job.status == VisionJobStatus.CONFIRMED,
            )
        }

        VisionJobStatus.FAILED -> current.copy(
            phase = AnalysisPhase.Failed,
            jobErrorMessage = job.error,
        )
    }

    /** ≥75% High, ≥50% Medium, else Low. */
    fun tierOf(confidence: Double): ConfidenceTier = when {
        confidence >= HIGH_CONFIDENCE -> ConfidenceTier.High
        confidence >= MEDIUM_CONFIDENCE -> ConfidenceTier.Medium
        else -> ConfidenceTier.Low
    }

    /** Whole-percent rendering of a 0..1 confidence. */
    fun percent(confidence: Double): Int = (confidence * 100).roundToInt()
}

/** What the screen is doing right now. */
enum class AnalysisPhase {
    /** Polling a queued/processing job. */
    Scanning,

    /** Predictions arrived — the editable list is live and nothing is logged. */
    Review,

    /** The job failed server-side; offer the manual escape. */
    Failed,

    /** The job could not be loaded at all (transport). */
    LoadError,
}

/** Inline message copy: either a bundled string or server-authored text. */
data class AnalysisBanner(
    @param:StringRes val messageRes: Int? = null,
    val message: String? = null,
)

/** Add-an-item search sheet state. */
data class AddItemUi(
    val term: String = "",
    val searching: Boolean = false,
    val results: List<FoodDto> = emptyList(),
    val selected: FoodDto? = null,
    val grams: Int = 100,
    val error: AnalysisBanner? = null,
)

/** Immutable confirmation-gate state. */
data class AnalysisUiState(
    val jobId: String = "",
    val phase: AnalysisPhase = AnalysisPhase.Scanning,
    val mealType: MealType = MealType.LUNCH,
    val items: List<ReviewItem> = emptyList(),
    /**
     * True once the predictions have been turned into editable rows. It never
     * goes back to false, so a late poll can never overwrite the user's edits.
     */
    val seeded: Boolean = false,
    val confirming: Boolean = false,
    val confirmed: Boolean = false,
    val banner: AnalysisBanner? = null,
    val jobErrorMessage: String? = null,
    val addSheet: AddItemUi? = null,
) {
    val totals: ReviewTotals get() = AnalysisReview.totals(items)

    /** The gate opens only with at least one item, and only once. */
    val canConfirm: Boolean
        get() = phase == AnalysisPhase.Review &&
            items.isNotEmpty() &&
            !confirming &&
            !confirmed

    /** Items the server cannot price because they carry no catalog match. */
    val unlinkedItemCount: Int get() = items.count { it.foodId.isNullOrBlank() }
}

/** One-shot signals for the host screen. */
sealed interface AnalysisEvent {
    /**
     * The meal is in the log. [mealLogId] is null only when the server neither
     * returned it nor could it be matched back — the screen still leaves.
     */
    data class Logged(val mealLogId: String?, val alreadyLogged: Boolean) : AnalysisEvent
}

/**
 * The confirmation gate — the most consequential screen in the app.
 *
 * Rules encoded here:
 *  - poll `GET /meal-photos/:jobId` every second while queued/processing;
 *  - seed the editable list exactly ONCE, and never auto-commit;
 *  - recompute macros from stored per-gram ratios on every edit;
 *  - confirm only on the user's explicit tap, exactly once, and treat a
 *    replayed confirm (409) as success rather than dead-ending or duplicating.
 */
@HiltViewModel
class AnalysisResultsViewModel @Inject constructor(
    private val visionRepository: VisionRepository,
    private val catalogRepository: CatalogRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(AnalysisUiState())
    val state: StateFlow<AnalysisUiState> = _state.asStateFlow()

    private val events = Channel<AnalysisEvent>(Channel.BUFFERED)
    val eventFlow: Flow<AnalysisEvent> = events.receiveAsFlow()

    private var pollJob: Job? = null
    private var searchJob: Job? = null

    /** Idempotent: re-entering the screen must not restart a settled job. */
    fun start(jobId: String) {
        if (_state.value.jobId == jobId && pollJob?.isActive == true) return
        if (_state.value.jobId == jobId && _state.value.seeded) return
        _state.value = AnalysisUiState(jobId = jobId)
        poll(jobId)
    }

    fun retry() {
        val jobId = _state.value.jobId
        if (jobId.isBlank()) return
        _state.value = _state.value.copy(phase = AnalysisPhase.Scanning, banner = null)
        poll(jobId)
    }

    private fun poll(jobId: String) {
        pollJob?.cancel()
        pollJob = viewModelScope.launch {
            var consecutiveFailures = 0
            while (isActive) {
                when (val result = visionRepository.getJob(jobId)) {
                    is ApiResult.Success -> {
                        consecutiveFailures = 0
                        if (apply(result.data)) return@launch
                    }

                    is ApiResult.Failure -> {
                        consecutiveFailures++
                        if (consecutiveFailures >= MAX_POLL_FAILURES) {
                            _state.value = _state.value.copy(
                                phase = AnalysisPhase.LoadError,
                                banner = (result as? ApiResult.Failure.Api)?.message
                                    ?.let { AnalysisBanner(message = it) },
                            )
                            return@launch
                        }
                    }
                }
                delay(POLL_INTERVAL_MS)
            }
        }
    }

    /** Fold a polled job into state. Returns true when the job is terminal. */
    private fun apply(job: VisionJobDto): Boolean {
        val next = AnalysisReview.fold(_state.value, job)
        _state.value = next
        return next.phase != AnalysisPhase.Scanning
    }

    // ----- editing -----

    fun renameItem(key: String, name: String) = mutateItem(key) { it.copy(name = name) }

    fun setGrams(key: String, grams: Int) = mutateItem(key) {
        it.copy(grams = grams.coerceIn(AnalysisReview.MIN_GRAMS, AnalysisReview.MAX_GRAMS))
    }

    fun removeItem(key: String) {
        if (_state.value.confirmed) return
        _state.value = _state.value.copy(items = _state.value.items.filterNot { it.key == key })
    }

    private fun mutateItem(key: String, transform: (ReviewItem) -> ReviewItem) {
        if (_state.value.confirmed) return
        _state.value = _state.value.copy(
            items = _state.value.items.map { if (it.key == key) transform(it) else it },
        )
    }

    // ----- add via food search -----

    fun openAddSheet() {
        if (_state.value.items.size >= AnalysisReview.MAX_ITEMS) {
            _state.value = _state.value.copy(
                banner = AnalysisBanner(messageRes = R.string.analysis_too_many_items),
            )
            return
        }
        _state.value = _state.value.copy(addSheet = AddItemUi())
    }

    fun closeAddSheet() {
        searchJob?.cancel()
        _state.value = _state.value.copy(addSheet = null)
    }

    fun setSearchTerm(term: String) {
        val sheet = _state.value.addSheet ?: return
        _state.value = _state.value.copy(addSheet = sheet.copy(term = term, error = null))
        searchJob?.cancel()
        if (term.trim().length < MIN_SEARCH_CHARS) {
            _state.value = _state.value.copy(
                addSheet = _state.value.addSheet?.copy(results = emptyList(), searching = false),
            )
            return
        }
        searchJob = viewModelScope.launch {
            delay(SEARCH_DEBOUNCE_MS)
            _state.value = _state.value.copy(addSheet = _state.value.addSheet?.copy(searching = true))
            val results = runCatching { catalogRepository.searchFoods(term.trim()) }
                .getOrDefault(emptyList())
            _state.value = _state.value.copy(
                addSheet = _state.value.addSheet?.copy(results = results, searching = false),
            )
        }
    }

    fun selectFood(food: FoodDto) {
        val sheet = _state.value.addSheet ?: return
        _state.value = _state.value.copy(
            addSheet = sheet.copy(
                selected = food,
                grams = food.commonServings.firstOrNull()?.grams?.roundToInt()
                    ?.coerceIn(AnalysisReview.MIN_GRAMS, AnalysisReview.MAX_GRAMS)
                    ?: DEFAULT_GRAMS,
            ),
        )
    }

    fun clearSelectedFood() {
        val sheet = _state.value.addSheet ?: return
        _state.value = _state.value.copy(addSheet = sheet.copy(selected = null))
    }

    fun setAddGrams(grams: Int) {
        val sheet = _state.value.addSheet ?: return
        _state.value = _state.value.copy(
            addSheet = sheet.copy(
                grams = grams.coerceIn(AnalysisReview.MIN_GRAMS, AnalysisReview.MAX_GRAMS),
            ),
        )
    }

    /** Append the chosen food to the review list (still nothing logged). */
    fun confirmAddItem() {
        val sheet = _state.value.addSheet ?: return
        val food = sheet.selected ?: return
        val items = _state.value.items
        if (items.size >= AnalysisReview.MAX_ITEMS) {
            _state.value = _state.value.copy(
                addSheet = null,
                banner = AnalysisBanner(messageRes = R.string.analysis_too_many_items),
            )
            return
        }
        val item = AnalysisReview.fromFood(
            food = food,
            grams = sheet.grams,
            key = "manual-${System.currentTimeMillis()}-${items.size}",
        )
        _state.value = _state.value.copy(items = items + item, addSheet = null)
        viewModelScope.launch { runCatching { catalogRepository.touchFood(food.id) } }
    }

    /** Append a cooking-fat preset the user tapped (still nothing logged). */
    fun addCookingFatPreset(preset: MealTrust.CookingFatPreset) {
        val items = _state.value.items
        if (items.size >= AnalysisReview.MAX_ITEMS) {
            _state.value = _state.value.copy(
                banner = AnalysisBanner(messageRes = R.string.analysis_too_many_items),
            )
            return
        }
        val item = AnalysisReview.fromCookingFatPreset(
            preset = preset,
            key = "fat-${preset.id}-${System.currentTimeMillis()}",
        )
        _state.value = _state.value.copy(items = items + item)
    }

    // ----- the gate -----

    /**
     * The one write path on this screen. Guarded so a double tap, or a return
     * to a job that is already confirmed, can never produce a second log.
     */
    fun confirm() {
        val current = _state.value
        if (!current.canConfirm) return
        _state.value = current.copy(confirming = true, banner = null)
        viewModelScope.launch {
            val result = visionRepository.confirm(
                jobId = current.jobId,
                mealType = current.mealType,
                localDate = LocalDates.today(),
                items = current.items.map(AnalysisReview::toMealLogItem),
            )
            when (result) {
                is ApiResult.Success -> {
                    _state.value = _state.value.copy(confirming = false, confirmed = true)
                    events.trySend(
                        AnalysisEvent.Logged(
                            mealLogId = result.data.mealLogId,
                            alreadyLogged = result.data.alreadyConfirmed,
                        ),
                    )
                }

                is ApiResult.Failure.Api -> _state.value = _state.value.copy(
                    confirming = false,
                    banner = AnalysisBanner(message = result.message),
                )

                is ApiResult.Failure.Network -> _state.value = _state.value.copy(
                    confirming = false,
                    banner = AnalysisBanner(messageRes = R.string.analysis_confirm_offline),
                )

                // A reply we could not read. The meal may or may not have been
                // logged, so say so plainly rather than guessing either way.
                is ApiResult.Failure.Malformed -> _state.value = _state.value.copy(
                    confirming = false,
                    banner = AnalysisBanner(messageRes = R.string.analysis_confirm_unreadable),
                )
            }
        }
    }

    fun dismissBanner() {
        _state.value = _state.value.copy(banner = null)
    }

    private companion object {
        const val POLL_INTERVAL_MS = 1_000L
        const val MAX_POLL_FAILURES = 5
        const val SEARCH_DEBOUNCE_MS = 300L
        const val MIN_SEARCH_CHARS = 2
        const val DEFAULT_GRAMS = 100
    }
}
