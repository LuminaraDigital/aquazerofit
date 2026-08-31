package fit.aquazero.app.feature.training

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import fit.aquazero.app.core.common.LocalDates
import fit.aquazero.app.core.data.CatalogRepository
import fit.aquazero.app.core.data.PlansRepository
import fit.aquazero.app.core.database.ExerciseEntity
import fit.aquazero.app.core.database.ExerciseMediaEntity
import fit.aquazero.app.core.database.ExerciseThumbnail
import fit.aquazero.app.core.model.ApiResult
import fit.aquazero.app.core.model.AzfJson
import fit.aquazero.app.core.model.ExerciseDto
import fit.aquazero.app.core.model.PlanDayDto
import fit.aquazero.app.core.model.TrainingPlanDto
import fit.aquazero.app.core.model.WorkoutSessionDto
import fit.aquazero.app.core.model.WorkoutSessionStatus
import fit.aquazero.app.core.network.api.GeneratePlanRequest
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Active filter selection for the exercise library. */
data class LibraryFilters(
    val search: String = "",
    val category: String = "",
    val muscle: String = "",
    val equipment: String = "",
)

/** One row of the exercise library list, projected off the Room cache. */
data class ExerciseCard(
    val id: String,
    val name: String,
    val primaryMuscle: String?,
    val difficulty: String,
    val equipmentNames: List<String>,
    /**
     * CC-BY-SA attribution line for this exercise. Never null, never blank —
     * rendering it on every card is a licence obligation (plan §5.6).
     */
    val licence: String,
    val licenceAuthor: String,
    /**
     * Reviewed, exercise-specific art for this row, or null to draw the
     * equipment glyph. Generic category fallbacks are deliberately excluded
     * here rather than at the call site — see
     * [ExerciseAttribution.isGenericFallback].
     */
    val thumbnail: ExerciseThumbnail? = null,
)

/** Expanded detail behind the bottom sheet, including per-media attribution. */
data class ExerciseDetail(
    val exercise: ExerciseDto,
    val media: List<ExerciseMediaEntity>,
)

/** Immutable state of the workout library screen. */
data class WorkoutLibraryUiState(
    val loadingPlan: Boolean = true,
    val loadingToday: Boolean = true,
    val loadingLibrary: Boolean = true,
    val planError: Boolean = false,
    val todayError: Boolean = false,
    val plan: TrainingPlanDto? = null,
    val todaySession: WorkoutSessionDto? = null,
    val todayEntries: List<ResolvedEntry> = emptyList(),
    val isRestDay: Boolean = false,
    val filters: LibraryFilters = LibraryFilters(),
    /** Exercises visible right now — grows a page at a time. */
    val exercises: List<ExerciseCard> = emptyList(),
    /** Total matching the current filters (the pager denominator). */
    val totalMatches: Int = 0,
    val catalogEmpty: Boolean = false,
    val detail: ExerciseDetail? = null,
    val generateSheetOpen: Boolean = false,
    val generateDaysPerWeek: Int = 4,
    val generateFocus: String = FOCUS_GENERAL,
    val generating: Boolean = false,
) {
    val hasMore: Boolean get() = exercises.size < totalMatches

    /** Training days in the plan week — rest days excluded. */
    val trainingDays: Int get() = plan?.days?.count { !it.isRest } ?: 0

    val planDays: List<PlanDayDto> get() = plan?.days.orEmpty()

    val todayCompleted: Boolean
        get() = todaySession?.status == WorkoutSessionStatus.COMPLETED

    companion object {
        const val FOCUS_GENERAL = "general"
        const val FOCUS_WEIGHT_LOSS = "weightLoss"
        const val FOCUS_STRENGTH = "strength"
    }
}

/** One-shot effects the library screen consumes exactly once. */
sealed interface WorkoutLibraryEvent {
    data object PlanGenerated : WorkoutLibraryEvent
    data object PlanGenerationOffline : WorkoutLibraryEvent
    data class PlanGenerationFailed(val message: String?) : WorkoutLibraryEvent
}

/**
 * Workout library: weekly plan strip, today's hero with resolved targets, and
 * a filtered exercise library.
 *
 * **Paging deviation from the web, deliberate.** The web pages the server
 * (`/exercises?limit=&offset=`) on every keystroke. Here
 * [CatalogRepository.refreshExercises] bulk-caches the whole corpus through
 * that same paged envelope (always limit/offset — the bare route returns a
 * legacy array), and the list then pages out of Room. The library therefore
 * works in full offline, and filter changes cost no round trip. The corpus is
 * small enough for this by design (plan §4.1).
 */
@OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class, kotlinx.coroutines.FlowPreview::class)
@HiltViewModel
class WorkoutLibraryViewModel @Inject constructor(
    private val plansRepository: PlansRepository,
    private val catalogRepository: CatalogRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(WorkoutLibraryUiState())
    val uiState: StateFlow<WorkoutLibraryUiState> = _uiState.asStateFlow()

    private val _events = Channel<WorkoutLibraryEvent>(Channel.BUFFERED)
    val events: Flow<WorkoutLibraryEvent> = _events.receiveAsFlow()

    private val filters = MutableStateFlow(LibraryFilters())
    private val pagesLoaded = MutableStateFlow(1)

    /**
     * The visible slice, straight out of SQL.
     *
     * Every filter — including muscle and equipment, which used to be CSV
     * columns post-filtered in memory — is now a predicate in the query, so
     * this reads exactly the rows the screen draws instead of a fixed 2000-row
     * window of the corpus. Growing the list re-queries with a larger LIMIT
     * rather than slicing a cached list, which is what lets the library survive
     * a corpus bigger than that window.
     */
    private val visibleRows: StateFlow<List<ExerciseEntity>> = combine(
        filters.debounce { if (it.search.isEmpty()) 0L else SEARCH_DEBOUNCE_MS },
        pagesLoaded,
    ) { active, pages -> active to pages }
        .distinctUntilChanged()
        .flatMapLatest { (active, pages) ->
            catalogRepository.exercisesPage(
                query = active.search.trim(),
                category = active.category.ifBlank { null },
                muscle = active.muscle.ifBlank { null },
                equipment = active.equipment.ifBlank { null },
                limit = pages * PAGE_SIZE,
                offset = 0,
            )
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), emptyList())

    /**
     * How many rows match, counted by SQL over the whole table.
     *
     * This used to be `matches.size` over the fetched window, so past 2000 rows
     * the screen under-reported the total and `hasMore` went false while
     * matches were still unread — the list simply stopped, with no way to reach
     * the rest.
     */
    private val matchCount: StateFlow<Int> = filters
        .debounce { if (it.search.isEmpty()) 0L else SEARCH_DEBOUNCE_MS }
        .distinctUntilChanged()
        .flatMapLatest { active ->
            catalogRepository.exercisesMatching(
                query = active.search.trim(),
                category = active.category.ifBlank { null },
                muscle = active.muscle.ifBlank { null },
                equipment = active.equipment.ifBlank { null },
            )
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), 0)

    init {
        viewModelScope.launch {
            combine(filters, visibleRows, matchCount) { active, rows, total ->
                Triple(active, rows, total)
            }.collect { (active, rows, total) ->
                // Bounded by the page LIMIT now, rather than by taking a slice
                // of a corpus-sized list, so this reads media for what is on
                // screen and nothing more.
                val thumbnails = catalogRepository.exerciseThumbnails(rows.map { it.id })
                _uiState.value = _uiState.value.copy(
                    filters = active,
                    exercises = rows.map { it.toCard(thumbnails[it.id]) },
                    totalMatches = total,
                )
            }
        }
        viewModelScope.launch { observeCachedPlan() }
        refresh()
    }

    /** Refresh plan, today's workout and the exercise catalog. */
    fun refresh() {
        viewModelScope.launch { refreshPlan() }
        viewModelScope.launch { refreshToday() }
        viewModelScope.launch { refreshCatalog() }
    }

    fun onSearchChange(value: String) = updateFilters { it.copy(search = value) }

    fun onCategoryChange(value: String) = updateFilters { it.copy(category = value) }

    fun onMuscleChange(value: String) = updateFilters { it.copy(muscle = value) }

    fun onEquipmentChange(value: String) = updateFilters { it.copy(equipment = value) }

    /** Reveal the next page of cached matches. */
    fun loadMore() {
        if (_uiState.value.hasMore) pagesLoaded.value += 1
    }

    /** Open the detail sheet for one exercise (cache-first, media included). */
    fun openDetail(exerciseId: String) {
        viewModelScope.launch {
            val pair = catalogRepository.exerciseWithMedia(exerciseId) ?: return@launch
            val decoded = runCatching {
                AzfJson.decodeFromString(ExerciseDto.serializer(), pair.first.docJson)
            }.getOrNull() ?: return@launch
            _uiState.value = _uiState.value.copy(
                detail = ExerciseDetail(exercise = decoded, media = pair.second),
            )
        }
    }

    fun closeDetail() {
        _uiState.value = _uiState.value.copy(detail = null)
    }

    fun openGenerateSheet() {
        _uiState.value = _uiState.value.copy(generateSheetOpen = true)
    }

    fun closeGenerateSheet() {
        if (_uiState.value.generating) return
        _uiState.value = _uiState.value.copy(generateSheetOpen = false)
    }

    fun setGenerateDaysPerWeek(days: Int) {
        _uiState.value = _uiState.value.copy(generateDaysPerWeek = days)
    }

    fun setGenerateFocus(focus: String) {
        _uiState.value = _uiState.value.copy(generateFocus = focus)
    }

    /**
     * Generate a plan. Online-only (AI lane): a transport failure is reported
     * as "needs a connection", never as data loss — the existing plan is
     * untouched. The server's deterministic fallback returns 200 with a plan
     * whose `generatedBy` says so, and is treated as an ordinary success.
     */
    fun generatePlan() {
        if (_uiState.value.generating) return
        _uiState.value = _uiState.value.copy(generating = true)
        viewModelScope.launch {
            val state = _uiState.value
            val result = plansRepository.generatePlan(
                GeneratePlanRequest(
                    daysPerWeek = state.generateDaysPerWeek,
                    focus = state.generateFocus,
                ),
            )
            _uiState.value = _uiState.value.copy(
                generating = false,
                generateSheetOpen = result !is ApiResult.Success,
            )
            when (result) {
                is ApiResult.Success -> {
                    _events.send(WorkoutLibraryEvent.PlanGenerated)
                    refreshToday()
                }
                is ApiResult.Failure.Network ->
                    _events.send(WorkoutLibraryEvent.PlanGenerationOffline)
                is ApiResult.Failure.Api ->
                    _events.send(WorkoutLibraryEvent.PlanGenerationFailed(result.message))
                is ApiResult.Failure.Malformed ->
                    _events.send(WorkoutLibraryEvent.PlanGenerationFailed(null))
            }
        }
    }

    private fun updateFilters(transform: (LibraryFilters) -> LibraryFilters) {
        pagesLoaded.value = 1
        filters.value = transform(filters.value)
    }

    private suspend fun observeCachedPlan() {
        plansRepository.currentPlan().collect { entity ->
            val decoded = entity?.let {
                runCatching {
                    AzfJson.decodeFromString(TrainingPlanDto.serializer(), it.docJson)
                }.getOrNull()
            }
            _uiState.value = _uiState.value.copy(
                plan = decoded,
                loadingPlan = false,
            )
        }
    }

    private suspend fun refreshPlan() {
        val result = plansRepository.refreshCurrentPlan()
        _uiState.value = _uiState.value.copy(
            loadingPlan = false,
            // A 404 simply means "no plan yet" — the empty state, not an error.
            planError = result is ApiResult.Failure.Api && result.httpStatus != NOT_FOUND,
        )
    }

    private suspend fun refreshToday() {
        when (val result = plansRepository.todayWorkout()) {
            is ApiResult.Success -> {
                val envelope = result.data
                _uiState.value = _uiState.value.copy(
                    loadingToday = false,
                    todayError = false,
                    todaySession = envelope.session,
                    todayEntries = resolveEntries(envelope),
                    isRestDay = envelope.rest || envelope.session == null,
                )
            }
            is ApiResult.Failure -> loadCachedToday(networkFailure = true)
        }
    }

    /** Offline path: render today from the cached session document. */
    private suspend fun loadCachedToday(networkFailure: Boolean) {
        val entity = plansRepository.sessionForDate(LocalDates.today()).first()
        val session = entity?.let {
            runCatching {
                AzfJson.decodeFromString(WorkoutSessionDto.serializer(), it.docJson)
            }.getOrNull()
        }
        _uiState.value = _uiState.value.copy(
            loadingToday = false,
            todayError = networkFailure && session == null,
            todaySession = session,
            todayEntries = session?.let { resolveFromSession(it.exercises) }.orEmpty(),
            isRestDay = session == null,
        )
    }

    private suspend fun refreshCatalog() {
        val result = catalogRepository.refreshExercises(pageSize = CATALOG_PAGE_SIZE)
        _uiState.value = _uiState.value.copy(
            loadingLibrary = false,
            catalogEmpty = result is ApiResult.Failure && visibleRows.value.isEmpty(),
        )
    }

    // `matches()` lived here and applied the muscle and equipment filters in
    // memory, re-splitting both CSV columns for every cached row on every
    // keystroke. Both predicates are in the page and count queries now, so the
    // work happens once per page in SQLite instead of once per row per
    // keystroke, and the corpus no longer has to be resident to be filtered.

    private fun ExerciseEntity.toCard(thumbnail: ExerciseThumbnail?): ExerciseCard = ExerciseCard(
        id = id,
        name = name,
        primaryMuscle = csvValues(primaryMusclesCsv).firstOrNull(),
        difficulty = difficulty,
        equipmentNames = csvValues(equipmentCsv),
        licence = licence,
        licenceAuthor = licenceAuthor,
        thumbnail = thumbnail?.takeUnless { ExerciseAttribution.isGenericFallback(it.url) },
    )

    companion object {
        /** Page size for the library list, matching the web's 24. */
        const val PAGE_SIZE = 24

        // CACHE_WINDOW (2000) is gone. It was the number of rows pulled from
        // Room on every filter change so that muscle and equipment could be
        // filtered in memory, and it was a hard ceiling: past 2000 rows the
        // total under-reported and the tail of the corpus was unreachable.
        // Filtering happens in SQL now, so the query reads a page.

        /** Page size used when bulk-caching the catalog (server cap is 200). */
        const val CATALOG_PAGE_SIZE = 200

        private const val SEARCH_DEBOUNCE_MS = 300L
        private const val STOP_TIMEOUT_MS = 5_000L
        private const val NOT_FOUND = 404
    }
}
