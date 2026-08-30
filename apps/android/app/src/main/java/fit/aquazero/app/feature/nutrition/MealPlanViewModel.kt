package fit.aquazero.app.feature.nutrition

import androidx.annotation.StringRes
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import fit.aquazero.app.R
import fit.aquazero.app.core.common.LocalDates
import fit.aquazero.app.core.data.CatalogRepository
import fit.aquazero.app.core.data.MealSuggestionRepository
import fit.aquazero.app.core.data.SuggestionFeedback
import fit.aquazero.app.core.database.RecipeEntity
import fit.aquazero.app.core.model.ApiResult
import fit.aquazero.app.core.model.MealRecommendationDto
import fit.aquazero.app.core.model.MealType
import fit.aquazero.app.feature.dashboard.NutritionFormat
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/** One meal position in the plan. */
data class MealPlanSlot(
    val mealType: MealType,
    val loading: Boolean = true,
    val recommendation: MealRecommendationDto? = null,
    /** True when generation failed — a per-slot retry, never a whole-page error. */
    val failed: Boolean = false,
    val logged: Boolean = false,
    val logging: Boolean = false,
    val feedback: SuggestionFeedback? = null,
) {
    /**
     * True when the suggestion came from the server's deterministic path
     * rather than a model — the honest answer when AI personalisation is off,
     * and worth saying rather than passing off as AI.
     */
    val deterministic: Boolean
        get() = recommendation?.ai?.provider == "deterministic"
}

/** Immutable state of the meal-plan screen. */
data class MealPlanUiState(
    val localDate: String = LocalDates.today(),
    val slots: List<MealPlanSlot> = NutritionFormat.MEAL_TYPES.map { MealPlanSlot(it) },
    val kcalTarget: Double? = null,
    val proteinTarget: Double? = null,
    val recipes: List<RecipeEntity> = emptyList(),
    /** No suggestion could be fetched at all — the online-only explanation. */
    val offline: Boolean = false,
) {
    private val ready: List<MealRecommendationDto>
        get() = slots.mapNotNull { it.recommendation }

    val readyCount: Int get() = ready.size

    val plannedKcal: Double get() = ready.sumOf { it.kcal }

    val plannedProteinG: Double get() = ready.sumOf { it.proteinG }
}

/** One-shot effects. */
sealed interface MealPlanEvent {
    data class Message(@param:StringRes val messageRes: Int, val isError: Boolean = false) :
        MealPlanEvent
}

/**
 * The AI meal plan.
 *
 * Online-only, and tolerant of the server's deterministic fallback: with AI
 * personalisation off the API answers with a code-chosen recipe and
 * `ai.provider = "deterministic"`, which is a valid suggestion rather than a
 * degraded one. The screen labels it for what it is instead of implying a model
 * wrote it.
 *
 * Each slot fails on its own. One meal type failing leaves the other three
 * usable, and gives that one a retry rather than replacing the page with an
 * error.
 *
 * Nothing is logged without an explicit tap (product invariant 1) — there is no
 * auto-log, and the button disables itself once used so a double tap cannot
 * create two meals.
 */
@HiltViewModel
class MealPlanViewModel @Inject constructor(
    private val suggestionRepository: MealSuggestionRepository,
    private val catalogRepository: CatalogRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(MealPlanUiState())
    val uiState: StateFlow<MealPlanUiState> = _uiState.asStateFlow()

    private val _events = Channel<MealPlanEvent>(Channel.BUFFERED)
    val events: Flow<MealPlanEvent> = _events.receiveAsFlow()

    init {
        viewModelScope.launch {
            catalogRepository.recipes().collect { recipes ->
                _uiState.value = _uiState.value.copy(recipes = recipes)
            }
        }
        viewModelScope.launch { catalogRepository.refreshRecipes() }
        regenerateAll()
    }

    /** Ask for a fresh suggestion in every slot. */
    fun regenerateAll() {
        NutritionFormat.MEAL_TYPES.forEach { generate(it) }
    }

    /** Ask for a fresh suggestion in one slot. */
    fun generate(mealType: MealType) {
        updateSlot(mealType) {
            it.copy(loading = true, failed = false, recommendation = null, logged = false)
        }
        viewModelScope.launch {
            when (val result = suggestionRepository.suggest(mealType, _uiState.value.localDate)) {
                is ApiResult.Success -> {
                    updateSlot(mealType) {
                        it.copy(
                            loading = false,
                            failed = false,
                            recommendation = result.data.recommendation,
                            feedback = result.data.recommendation.feedback?.let(::parseFeedback),
                        )
                    }
                    _uiState.value = _uiState.value.copy(
                        offline = false,
                        kcalTarget = result.data.remainingKcal?.let { remaining ->
                            // `remaining` is what is LEFT today; adding what the
                            // plan already covers reconstructs the day's target
                            // without a second call.
                            remaining + _uiState.value.plannedKcal
                        } ?: _uiState.value.kcalTarget,
                        proteinTarget = result.data.remainingProteinG?.let { remaining ->
                            remaining + _uiState.value.plannedProteinG
                        } ?: _uiState.value.proteinTarget,
                    )
                }
                is ApiResult.Failure -> {
                    updateSlot(mealType) { it.copy(loading = false, failed = true) }
                    if (result is ApiResult.Failure.Network) {
                        _uiState.value = _uiState.value.copy(offline = true)
                    }
                }
            }
        }
    }

    /** Log a suggestion. Only ever from an explicit tap. */
    fun logSuggestion(mealType: MealType) {
        val slot = slotFor(mealType) ?: return
        val recommendation = slot.recommendation ?: return
        if (slot.logged || slot.logging) return
        updateSlot(mealType) { it.copy(logging = true) }
        viewModelScope.launch {
            val result = suggestionRepository.logSuggestion(
                recommendationId = recommendation.id,
                localDate = _uiState.value.localDate,
            )
            updateSlot(mealType) {
                it.copy(logging = false, logged = result is ApiResult.Success)
            }
            emit(
                if (result is ApiResult.Success) {
                    R.string.meal_plan_logged_toast
                } else {
                    R.string.meal_plan_log_failed
                },
                isError = result is ApiResult.Failure,
            )
        }
    }

    /** Send an up/down signal. Optimistic: the value is a preference, not data. */
    fun sendFeedback(mealType: MealType, feedback: SuggestionFeedback) {
        val recommendation = slotFor(mealType)?.recommendation ?: return
        updateSlot(mealType) { it.copy(feedback = feedback) }
        viewModelScope.launch {
            val result = suggestionRepository.sendFeedback(recommendation.id, feedback)
            if (result is ApiResult.Failure) {
                updateSlot(mealType) { it.copy(feedback = null) }
                emit(R.string.meal_plan_feedback_failed, isError = true)
            }
        }
    }

    private fun slotFor(mealType: MealType): MealPlanSlot? =
        _uiState.value.slots.firstOrNull { it.mealType == mealType }

    private fun updateSlot(mealType: MealType, transform: (MealPlanSlot) -> MealPlanSlot) {
        _uiState.value = _uiState.value.copy(
            slots = _uiState.value.slots.map {
                if (it.mealType == mealType) transform(it) else it
            },
        )
    }

    private fun parseFeedback(raw: String): SuggestionFeedback? =
        SuggestionFeedback.entries.firstOrNull { it.wire == raw }

    private fun emit(@StringRes messageRes: Int, isError: Boolean = false) {
        viewModelScope.launch { _events.send(MealPlanEvent.Message(messageRes, isError)) }
    }
}
