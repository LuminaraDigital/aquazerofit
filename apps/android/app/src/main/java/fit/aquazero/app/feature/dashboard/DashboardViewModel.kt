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
import fit.aquazero.app.core.network.ApiResult
import fit.aquazero.app.core.network.dto.MealRecommendationDto
import fit.aquazero.app.core.network.dto.WorkoutSessionStatus
import javax.inject.Inject
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

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
) {
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
    data class Message(@StringRes val messageRes: Int, val kind: ToastKind) : DashboardEvent
}

/**
 * Dashboard state holder. Reads are Room-backed `Flow`s so the screen is
 * correct offline; every network call is refresh-on-observe and degrades
 * calmly. The water tap is optimistic: the Room write lands immediately and
 * the ring moves with it, and a failure rolls the local state back with a
 * toast — nothing is ever silently lost.
 */
@HiltViewModel
class DashboardViewModel @Inject constructor(
    private val data: DashboardData,
) : ViewModel() {

    private val today = LocalDates.today()

    private val _uiState = MutableStateFlow(DashboardUiState(today = today))
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

    private fun observeRoom() {
        viewModelScope.launch {
            data.dailyNutrition(today).collect { nutrition ->
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
        viewModelScope.launch {
            data.user().collect { user ->
                _uiState.update { it.copy(firstName = user?.displayName?.trim()?.substringBefore(' ')?.takeIf(String::isNotEmpty)) }
            }
        }
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
        viewModelScope.launch {
            when (val day = data.refreshDay(today)) {
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
        viewModelScope.launch { data.refreshProfile() }
        viewModelScope.launch {
            data.refreshProgress()
            _uiState.update { it.copy(achievementsLoading = false) }
        }
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
                                rest = envelope.data.rest || session == null ||
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
     */
    fun logWater(amountMl: Int = WATER_INCREMENT_ML) {
        if (_uiState.value.waterPending) return
        _uiState.update { it.copy(waterPending = true) }
        viewModelScope.launch {
            val before = _uiState.value.serverWaterMl
            runCatching { data.logWater(amountMl, today) }
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
