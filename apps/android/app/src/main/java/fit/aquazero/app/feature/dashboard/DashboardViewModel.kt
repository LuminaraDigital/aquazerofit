package fit.aquazero.app.feature.dashboard

import androidx.annotation.StringRes
import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import fit.aquazero.app.R
import fit.aquazero.app.core.common.LocalDailyNutrition
import fit.aquazero.app.core.common.LocalDates
import fit.aquazero.app.core.designsystem.ToastKind
import fit.aquazero.app.core.model.ApiResult
import fit.aquazero.app.core.model.AzfJson
import fit.aquazero.app.core.model.DerivedTargetsDto
import fit.aquazero.app.core.model.MealRecommendationDto
import fit.aquazero.app.core.model.NutritionEmphasis
import fit.aquazero.app.core.model.ProgressionStatusDto
import fit.aquazero.app.core.model.ReadinessAssessmentDto
import fit.aquazero.app.core.model.WellnessProfileDto
import fit.aquazero.app.core.model.WorkoutSessionStatus
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.Clock
import javax.inject.Inject

private val AMBIENT_REACTION_KINDS = setOf(
    "greeting",
    "steady",
    "returning",
    "restDay",
    "resting",
)

/** Coarse load phase of the day's nutrition (skeleton / content / retry). */
enum class DashboardPhase { Loading, Ready, Error }

/** State of the on-demand meal suggestion lane. */
enum class SuggestionPhase { Idle, Thinking, Unavailable }

/** One achievement tile: locked tiles render at 35% alpha, earned ones filled. */
@Immutable
data class AchievementUi(
    val id: String,
    val name: String,
    val earned: Boolean,
)

/** Today's workout, reduced to what the dashboard card renders. */
@Immutable
data class TodayWorkoutUi(
    val sessionId: String?,
    val focus: String,
    val exerciseCount: Int,
    val durationMinutes: Int,
    val kcalBurned: Double?,
    val completed: Boolean,
    val rest: Boolean,
)

/** The accepted-or-not meal suggestion currently on screen. */
@Immutable
data class SuggestionUi(
    val id: String,
    val name: String,
    val kcal: Double,
    val proteinG: Double,
    val carbsG: Double,
    val fatG: Double,
    val rationale: String,
    val logged: Boolean = false,
    val logging: Boolean = false,
)

/** Immutable dashboard state (one screen, one state object). */
@Immutable
data class DashboardUiState(
    val today: String,
    val phase: DashboardPhase = DashboardPhase.Loading,
    val firstName: String? = null,
    val nutrition: LocalDailyNutrition? = null,
    /**
     * Server-side day total for water. Merged with the local total by `max`
     * for display: locally logged millilitres are already inside the server
     * total once they drain, so this can never double-count.
     */
    val serverWaterMl: Int = 0,
    val kcalBurned: Double = 0.0,
    val waterPending: Boolean = false,
    val weightSeries: List<Double> = emptyList(),
    val currentWeightKg: Double? = null,
    val achievements: List<AchievementUi> = emptyList(),
    val achievementsLoading: Boolean = true,
    val workout: TodayWorkoutUi? = null,
    val workoutLoading: Boolean = true,
    val suggestion: SuggestionUi? = null,
    val suggestionPhase: SuggestionPhase = SuggestionPhase.Idle,
    /** When true, the hero ring prioritises protein over calories. */
    val proteinFirst: Boolean = false,
    /** Server-derived targets for the explain sheet. */
    val targets: DerivedTargetsDto? = null,
    val readiness: fit.aquazero.app.core.model.ReadinessAssessmentDto? = null,
    val readinessLoading: Boolean = true,
    /** Ambient coach line from progression (not celebration kinds). */
    val coachLine: String? = null,
) {
    /** Merges offline session burn with the server day total. */
    val effectiveKcalBurned: Double
        get() = maxOf(nutrition?.kcalBurned ?: 0.0, kcalBurned)

    /** Millilitres to render in the hydration card. */
    val waterConsumedMl: Int
        get() = maxOf(nutrition?.waterConsumedMl ?: 0, serverWaterMl)

    /**
     * True when Room already holds something worth showing. The local
     * recompute always emits (a fresh day is legitimately all zeroes), so
     * "did the fetch fail?" alone is not enough to justify an error surface —
     * a day with targets or logs stays on screen and syncs later.
     */
    val hasContent: Boolean
        get() = nutrition != null &&
            (nutrition.kcalTarget > 0.0 || nutrition.kcalConsumed > 0.0 || nutrition.waterConsumedMl > 0)
}

/** One-shot effects; the screen turns these into toasts. */
sealed interface DashboardEvent {
    /** Show a transient message. */
    data class Message(@param:StringRes val messageRes: Int, val kind: ToastKind) : DashboardEvent
}

/**
 * Dashboard state holder. Reads are Room-backed `Flow`s so the screen is
 * correct offline; every network call is refresh-on-observe and degrades
 * calmly. The water tap is optimistic: the Room write lands immediately and
 * the ring moves with it, and a failure rolls the local state back with a
 * toast — nothing is ever silently lost.
 *
 * The day is never cached. A dashboard left on the back stack outlives
 * midnight, so [clock] is injected and re-read at every use: the string this
 * screen keys Room reads and water writes on is always the current wall-clock
 * day, and [observedDay] carries the Room collection onto the new one when it
 * turns over.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class DashboardViewModel @Inject constructor(
    private val data: DashboardData,
    private val clock: Clock = Clock.systemDefaultZone(),
) : ViewModel() {

    /** Recomputed on every read — see the class KDoc; never store this. */
    private val today: String get() = LocalDates.today(clock)

    /** The day the Room collection and the day fetch are keyed on. */
    private val observedDay = MutableStateFlow(today)

    private val _uiState = MutableStateFlow(DashboardUiState(today = observedDay.value))
    val uiState: StateFlow<DashboardUiState> = _uiState.asStateFlow()

    private val _events = MutableSharedFlow<DashboardEvent>(
        extraBufferCapacity = 4,
        onBufferOverflow = BufferOverflow.DROP_OLDEST,
    )
    val events: SharedFlow<DashboardEvent> = _events

    init {
        observeRoom()
        refresh()
    }

    /**
     * Re-key the screen onto the current wall-clock day, and return it.
     *
     * "Today" is not a value a ViewModel can hold: this one survives
     * backgrounding, so a session opened at 23:50 is still alive at 00:05 and
     * would otherwise file every tap against yesterday. Publishing to
     * [observedDay] restarts the Room collection through `flatMapLatest`, and
     * the server-side day totals are dropped because they belong to the day
     * that just ended.
     */
    private fun syncToToday(): String {
        val current = today
        if (observedDay.value != current) {
            observedDay.value = current
            _uiState.update {
                it.copy(today = current, serverWaterMl = 0, kcalBurned = 0.0)
            }
        }
        return current
    }

    /**
     * Called by the screen every time it resumes. A session that crossed
     * midnight while backgrounded moves onto the new day and refetches it;
     * a resume on the same day costs nothing.
     */
    fun onResumed() {
        if (observedDay.value == today) return
        refresh()
    }

    private fun observeRoom() {
        observeNutrition()
        observeAccount()
        observeProgress()
    }

    /** The day's nutrition roll-up; arriving content also clears a stale fetch error. */
    private fun observeNutrition() {
        viewModelScope.launch {
            observedDay.flatMapLatest { data.dailyNutrition(it) }.collect { nutrition ->
                _uiState.update { state ->
                    val next = state.copy(nutrition = nutrition)
                    // Content arriving from Room clears an earlier fetch error:
                    // there is now something true to show.
                    if (state.phase == DashboardPhase.Error && !next.hasContent) {
                        next
                    } else {
                        next.copy(phase = DashboardPhase.Ready)
                    }
                }
            }
        }
    }

    /** Identity, profile emphasis and derived targets. */
    private fun observeAccount() {
        viewModelScope.launch {
            data.user().collect { user ->
                val firstName = user?.displayName?.trim()
                    ?.substringBefore(' ')
                    ?.takeIf(String::isNotEmpty)
                _uiState.update { it.copy(firstName = firstName) }
            }
        }
        viewModelScope.launch {
            data.profile().collect { entity ->
                val proteinFirst = entity?.docJson?.let { json ->
                    runCatching {
                        AzfJson.decodeFromString(WellnessProfileDto.serializer(), json)
                    }.getOrNull()?.nutritionEmphasis == NutritionEmphasis.PROTEIN_FIRST
                } ?: false
                _uiState.update { it.copy(proteinFirst = proteinFirst) }
            }
        }
        viewModelScope.launch {
            data.targets().collect { entity ->
                val decoded = entity?.docJson?.let { json ->
                    runCatching {
                        AzfJson.decodeFromString(DerivedTargetsDto.serializer(), json)
                    }.getOrNull()
                }
                _uiState.update { it.copy(targets = decoded) }
            }
        }
    }

    /** Progress snapshot: weight, achievements and the weight sparkline window. */
    private fun observeProgress() {
        viewModelScope.launch {
            data.progressSummary().collect { summary ->
                _uiState.update { state ->
                    state.copy(
                        currentWeightKg = summary?.currentWeightKg,
                        achievements = summary?.achievements.orEmpty().take(MAX_ACHIEVEMENTS).map {
                            AchievementUi(
                                id = it.definition.id,
                                name = it.definition.name,
                                earned = it.earnedAt != null,
                            )
                        },
                        achievementsLoading = summary == null && state.achievementsLoading,
                    )
                }
            }
        }
        viewModelScope.launch {
            data.weightSeries().collect { series ->
                _uiState.update { it.copy(weightSeries = series.takeLast(WEIGHT_WINDOW)) }
            }
        }
    }

    /** Refresh-on-observe: pull the day, the account and the progress snapshot. */
    fun refresh() {
        val localDate = syncToToday()
        refreshDay(localDate)
        viewModelScope.launch { data.refreshProfile() }
        refreshReadinessAndCoachLine()
        viewModelScope.launch {
            data.refreshProgress()
            _uiState.update { it.copy(achievementsLoading = false) }
        }
        refreshTodayWorkout()
    }

    /** The day roll-up. A failure only surfaces when Room has nothing to show. */
    private fun refreshDay(localDate: String) {
        viewModelScope.launch {
            when (val day = data.refreshDay(localDate)) {
                is ApiResult.Success -> _uiState.update {
                    it.copy(
                        phase = DashboardPhase.Ready,
                        serverWaterMl = day.data.waterMl.consumed.toInt(),
                        kcalBurned = day.data.kcalBurned,
                    )
                }
                is ApiResult.Failure -> _uiState.update {
                    // Room already has content offline — only a cold, empty
                    // day is a real error worth interrupting the user for.
                    if (it.hasContent) it else it.copy(phase = DashboardPhase.Error)
                }
            }
        }
    }

    /** Readiness score and the ambient coach line; both fail quietly. */
    private fun refreshReadinessAndCoachLine() {
        viewModelScope.launch {
            _uiState.update { it.copy(readinessLoading = true) }
            when (val result = data.readiness()) {
                is ApiResult.Success -> _uiState.update {
                    it.copy(readiness = result.data, readinessLoading = false)
                }
                is ApiResult.Failure -> _uiState.update { it.copy(readinessLoading = false) }
            }
        }
        viewModelScope.launch {
            when (val result = data.progression()) {
                is ApiResult.Success -> _uiState.update {
                    it.copy(coachLine = ambientCoachLine(result.data))
                }
                is ApiResult.Failure -> Unit
            }
        }
    }

    /** Today's session card, including the several ways a day counts as rest. */
    private fun refreshTodayWorkout() {
        viewModelScope.launch {
            when (val envelope = data.todayWorkout()) {
                is ApiResult.Success -> {
                    val session = envelope.data.session
                    _uiState.update {
                        it.copy(
                            workoutLoading = false,
                            workout = TodayWorkoutUi(
                                sessionId = session?.id,
                                focus = session?.focus?.takeIf(String::isNotBlank)
                                    ?: envelope.data.focus,
                                exerciseCount = session?.exercises?.size ?: 0,
                                durationMinutes = session
                                    ?.let(NutritionFormat::estimateDurationMinutes) ?: 0,
                                kcalBurned = session?.kcalBurned,
                                completed = session?.status == WorkoutSessionStatus.COMPLETED,
                                rest = envelope.data.rest ||
                                    session == null ||
                                    session.focus.contains("rest", ignoreCase = true),
                            ),
                        )
                    }
                }
                is ApiResult.Failure -> _uiState.update { it.copy(workoutLoading = false) }
            }
        }
    }

    /**
     * One-tap +250 ml. Optimistic by construction — [DashboardData.logWater]
     * writes Room first and returns before the network is involved — so the
     * only failure we can surface is the local write itself.
     *
     * The day is resolved here rather than at construction, so a tap made
     * after midnight is filed against the day the user is actually in — and
     * the card jumps to that day with it.
     */
    fun logWater(amountMl: Int = WATER_INCREMENT_ML) {
        if (_uiState.value.waterPending) return
        val localDate = syncToToday()
        _uiState.update { it.copy(waterPending = true) }
        viewModelScope.launch {
            val before = _uiState.value.serverWaterMl
            runCatching { data.logWater(amountMl, localDate) }
                .onSuccess {
                    _uiState.update { state -> state.copy(waterPending = false) }
                    emit(DashboardEvent.Message(R.string.water_logged, ToastKind.Success))
                }
                .onFailure {
                    // Roll the optimistic display back and say so plainly.
                    _uiState.update { state ->
                        state.copy(waterPending = false, serverWaterMl = before)
                    }
                    emit(DashboardEvent.Message(R.string.water_log_failed, ToastKind.Error))
                }
        }
    }

    /** Ask for a meal suggestion (online-only lane). */
    fun suggestMeal() {
        if (_uiState.value.suggestionPhase == SuggestionPhase.Thinking) return
        _uiState.update { it.copy(suggestionPhase = SuggestionPhase.Thinking) }
        viewModelScope.launch {
            when (val result = data.suggestMeal(NutritionFormat.mealTypeForNow())) {
                is ApiResult.Success -> _uiState.update {
                    it.copy(suggestionPhase = SuggestionPhase.Idle, suggestion = result.data.toUi())
                }
                is ApiResult.Failure -> {
                    _uiState.update { it.copy(suggestionPhase = SuggestionPhase.Unavailable) }
                    emit(DashboardEvent.Message(R.string.suggestion_unavailable, ToastKind.Info))
                }
            }
        }
    }

    /**
     * Log the suggestion the user just read. Explicit, per product invariant 1
     * — nothing reaches the diary without this tap.
     */
    fun logSuggestion() {
        val current = _uiState.value.suggestion ?: return
        if (current.logged || current.logging) return
        _uiState.update { it.copy(suggestion = current.copy(logging = true)) }
        viewModelScope.launch {
            when (data.logRecommendation(current.id)) {
                is ApiResult.Success -> {
                    _uiState.update {
                        it.copy(suggestion = current.copy(logging = false, logged = true))
                    }
                    emit(DashboardEvent.Message(R.string.suggestion_logged, ToastKind.Success))
                }
                is ApiResult.Failure -> {
                    _uiState.update { it.copy(suggestion = current.copy(logging = false)) }
                    emit(DashboardEvent.Message(R.string.suggestion_log_failed, ToastKind.Error))
                }
            }
        }
    }

    private suspend fun emit(event: DashboardEvent) {
        _events.emit(event)
    }

    private fun MealRecommendationDto.toUi(): SuggestionUi = SuggestionUi(
        id = id,
        name = name,
        kcal = kcal,
        proteinG = proteinG,
        carbsG = carbsG,
        fatG = fatG,
        rationale = rationale,
    )

    companion object {
        /** The web's one-tap hydration increment. */
        const val WATER_INCREMENT_ML = 250

        /** Achievement tiles shown in the strip (matches the web's slice). */
        const val MAX_ACHIEVEMENTS = 4

        /** Sparkline window, in weigh-ins. */
        const val WEIGHT_WINDOW = 14
    }
}

private fun ambientCoachLine(status: ProgressionStatusDto): String? =
    status.reactions.firstOrNull { it.kind in AMBIENT_REACTION_KINDS }?.text
        ?.takeIf { it.isNotBlank() }
