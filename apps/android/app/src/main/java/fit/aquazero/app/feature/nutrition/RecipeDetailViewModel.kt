package fit.aquazero.app.feature.nutrition

import androidx.annotation.StringRes
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import fit.aquazero.app.R
import fit.aquazero.app.core.data.CatalogRepository
import fit.aquazero.app.core.data.LogsRepository
import fit.aquazero.app.core.data.ProfileRepository
import fit.aquazero.app.core.model.Allergen
import fit.aquazero.app.core.model.MealLogItemDto
import fit.aquazero.app.core.model.RecipeDto
import fit.aquazero.app.feature.dashboard.NutritionFormat
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch
import javax.inject.Inject
import kotlin.math.roundToInt

/** Immutable state of the recipe detail screen. */
data class RecipeDetailUiState(
    val loading: Boolean = true,
    val recipe: RecipeDto? = null,
    val notFound: Boolean = false,
    val servings: Int = 1,
    /** Ingredients the reader has ticked off — device-local, never sent. */
    val checked: Set<Int> = emptySet(),
    /** Declared allergies that this recipe matches; empty is the usual case. */
    val matchedAllergens: List<Allergen> = emptyList(),
    val logging: Boolean = false,
) {
    /** Scaled kcal for the chosen number of servings. */
    val scaledKcal: Double
        get() = (recipe?.perServing?.kcal ?: 0.0) * servings
}

/** One-shot effects. */
sealed interface RecipeDetailEvent {
    data class Message(@StringRes val messageRes: Int, val isError: Boolean = false) :
        RecipeDetailEvent

    /** The meal is in Room and queued for sync; the screen can close. */
    data object Logged : RecipeDetailEvent
}

/**
 * Recipe detail arithmetic, kept pure so the per-serving scaling that ends up
 * in someone's food log is testable without a device.
 */
object RecipeMath {

    /** Servings the stepper allows. */
    const val MIN_SERVINGS = 1
    const val MAX_SERVINGS = 10

    /**
     * Approximate grams in one serving, derived from the ingredient list.
     *
     * Deterministic and computed, never estimated: total ingredient mass over
     * the recipe's own serving count. [FALLBACK_GRAMS] applies only when the
     * ingredients carry no masses at all, in which case the figure is a plate
     * size rather than a measurement — the macros beside it still come from
     * the recipe's own `perServing` values, so nothing logged is invented.
     */
    const val FALLBACK_GRAMS = 350

    fun gramsPerServing(recipe: RecipeDto): Int {
        val total = recipe.ingredients.sumOf { it.grams }
        if (total > 0 && recipe.servings > 0) {
            return (total / recipe.servings).roundToInt()
        }
        return FALLBACK_GRAMS
    }

    /** The single log item a recipe becomes, scaled to [servings]. */
    fun toLogItem(recipe: RecipeDto, servings: Int): MealLogItemDto {
        val factor = servings.toDouble()
        val per = recipe.perServing
        return MealLogItemDto(
            name = recipe.name,
            grams = (gramsPerServing(recipe) * servings).toDouble(),
            kcal = (per.kcal * factor).roundToInt().toDouble(),
            proteinG = NutritionFormat.round1(per.proteinG * factor),
            carbsG = NutritionFormat.round1(per.carbsG * factor),
            fatG = NutritionFormat.round1(per.fatG * factor),
            fiberG = per.fiberG?.let { NutritionFormat.round1(it * factor) },
            sugarG = per.sugarG?.let { NutritionFormat.round1(it * factor) },
            sodiumMg = per.sodiumMg?.let { NutritionFormat.round1(it * factor) },
            potassiumMg = per.potassiumMg?.let { NutritionFormat.round1(it * factor) },
            calciumMg = per.calciumMg?.let { NutritionFormat.round1(it * factor) },
            ironMg = per.ironMg?.let { NutritionFormat.round1(it * factor) },
        )
    }

    /**
     * Declared allergies this recipe matches. Client-mirrored and deterministic
     * (plan §5 invariant 5) — a set intersection, with no fuzzy matching that
     * could produce a false negative.
     */
    fun matchedAllergens(recipe: RecipeDto, declared: List<Allergen>): List<Allergen> =
        recipe.allergens.filter { it in declared }
}

/**
 * One recipe, in full.
 *
 * Reads from the Room catalog first so a recipe stays readable offline, then
 * falls back to the network. Logging goes through the offline-first meal path,
 * and only ever from the explicit button — the recipe is never logged just for
 * being opened (product invariant 1).
 */
@HiltViewModel
class RecipeDetailViewModel @Inject constructor(
    private val catalogRepository: CatalogRepository,
    private val logsRepository: LogsRepository,
    private val profileRepository: ProfileRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(RecipeDetailUiState())
    val uiState: StateFlow<RecipeDetailUiState> = _uiState.asStateFlow()

    private val _events = Channel<RecipeDetailEvent>(Channel.BUFFERED)
    val events: Flow<RecipeDetailEvent> = _events.receiveAsFlow()

    private var loadedId: String? = null

    /** Load [recipeId]; repeated calls for the same id are ignored. */
    fun load(recipeId: String) {
        if (loadedId == recipeId) return
        loadedId = recipeId
        _uiState.value = RecipeDetailUiState(loading = true)
        viewModelScope.launch {
            val recipe = catalogRepository.recipe(recipeId)
            if (recipe == null) {
                _uiState.value = RecipeDetailUiState(loading = false, notFound = true)
                return@launch
            }
            _uiState.value = _uiState.value.copy(
                loading = false,
                recipe = recipe,
                matchedAllergens = RecipeMath.matchedAllergens(recipe, declaredAllergens()),
            )
        }
    }

    /** Allergies from the cached profile; empty when there is no profile yet. */
    private suspend fun declaredAllergens(): List<Allergen> {
        val entity = profileRepository.profile().firstOrNull() ?: return emptyList()
        return entity.allergiesCsv.split(',')
            .mapNotNull { name ->
                Allergen.entries.firstOrNull { it.name == name.trim() }
            }
    }

    fun changeServings(delta: Int) {
        val next = (_uiState.value.servings + delta)
            .coerceIn(RecipeMath.MIN_SERVINGS, RecipeMath.MAX_SERVINGS)
        _uiState.value = _uiState.value.copy(servings = next)
    }

    /** Tick an ingredient off the shopping list. Purely local. */
    fun toggleIngredient(index: Int) {
        val checked = _uiState.value.checked
        _uiState.value = _uiState.value.copy(
            checked = if (index in checked) checked - index else checked + index,
        )
    }

    /**
     * Log the recipe as a meal, offline-first. The meal type is the one that
     * fits the current time of day, matching the rest of the app.
     */
    fun logMeal() {
        val state = _uiState.value
        val recipe = state.recipe ?: return
        if (state.logging) return
        _uiState.value = state.copy(logging = true)
        viewModelScope.launch {
            logsRepository.logMeal(
                mealType = NutritionFormat.mealTypeForNow(),
                items = listOf(RecipeMath.toLogItem(recipe, state.servings)),
                source = "manual",
            )
            _uiState.value = _uiState.value.copy(logging = false)
            _events.send(RecipeDetailEvent.Message(R.string.recipe_logged))
            _events.send(RecipeDetailEvent.Logged)
        }
    }
}
