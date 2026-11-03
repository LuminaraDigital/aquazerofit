package fit.aquazero.app.feature.coach

import fit.aquazero.app.core.model.Allergen
import fit.aquazero.app.core.model.ChatMealDraftDto
import fit.aquazero.app.core.model.ChatMealItemDto
import fit.aquazero.app.core.model.ChatMealItemStatus
import fit.aquazero.app.core.model.ChatMealMatchDto
import fit.aquazero.app.core.model.GramsBasis
import kotlin.math.roundToInt

/**
 * The state behind the meal-confirmation card, kept pure so the rules that
 * make it a *gate* can be tested without a device.
 *
 * The rule the whole card exists to enforce:
 *
 *   **An ambiguous item starts with nothing chosen.**
 *
 * A resolved item has one match and pre-selecting it is just showing the user
 * what they said. An ambiguous item has several, and picking one for them is
 * precisely the failure the confirmation step is here to prevent — it turns
 * "confirm what you ate" into "accept our guess", and the tap that means
 * *yes, that one* becomes indistinguishable from the tap that means *yes,
 * whatever*. So this file drops `suggestedFoodId` on ambiguous lines even when
 * the server sends one, rather than trusting every caller upstream to keep
 * that promise.
 *
 * Calories shown are a linear projection of the server's own figures so the
 * card can respond while a portion is dragged. Nothing here authors nutrition:
 * the numbers written to the log are recomputed server-side from the food
 * record at confirm time.
 */

/** One line's choice. [foodId] `null` means "no food chosen yet". */
data class ItemChoice(
    val foodId: String? = null,
    val included: Boolean = false,
    val grams: Int? = null,
)

/** A selected food that collides with the user's declared allergens. */
data class AllergenConflict(
    val itemId: String,
    val foodName: String,
    val allergens: List<Allergen>,
)

/** What the confirm call will send for one line. */
data class DraftSelection(
    val itemId: String,
    val foodId: String,
    val grams: Int,
)

object MealDraftModel {

    /** Grams bounds mirroring the API's item-gram plausibility check. */
    const val MIN_GRAMS: Int = 5
    const val MAX_GRAMS: Int = 2000

    /**
     * Opening state for every line of [draft].
     *
     * - `resolved` → its single match is pre-selected and included.
     * - `ambiguous` → **included but with no food chosen**, so the row stays
     *   live and visibly incomplete rather than disappearing or auto-deciding.
     * - `unmatched` → excluded; the card routes it to manual logging instead
     *   of quietly dropping it.
     */
    fun initialChoices(draft: ChatMealDraftDto): Map<String, ItemChoice> =
        draft.items.associate { item -> item.id to initialChoice(item) }

    private fun initialChoice(item: ChatMealItemDto): ItemChoice {
        if (item.status == ChatMealItemStatus.AMBIGUOUS) {
            // The invariant, enforced here rather than assumed of the payload.
            return ItemChoice(foodId = null, included = true, grams = null)
        }
        val suggested = item.suggestedFoodId
            ?.let { id -> item.matches.firstOrNull { it.foodId == id } }
            ?: item.matches.singleOrNull().takeIf { item.status == ChatMealItemStatus.RESOLVED }
        return ItemChoice(
            foodId = suggested?.foodId,
            included = item.status != ChatMealItemStatus.UNMATCHED,
            grams = suggested?.grams?.roundToInt(),
        )
    }

    /** The match [foodId] refers to on [item], if it is one this line offered. */
    fun matchOf(item: ChatMealItemDto, foodId: String?): ChatMealMatchDto? {
        if (foodId == null) return null
        return item.matches.firstOrNull { it.foodId == foodId }
    }

    /** Grams currently in force for a line: the user's edit, else the match's. */
    fun gramsOf(item: ChatMealItemDto, choice: ItemChoice): Int? {
        val match = matchOf(item, choice.foodId) ?: return choice.grams
        return choice.grams ?: match.grams.roundToInt()
    }

    /** Lines that will actually be logged. Excluded or unpicked lines drop out. */
    fun selections(
        draft: ChatMealDraftDto,
        choices: Map<String, ItemChoice>,
    ): List<DraftSelection> = draft.items.mapNotNull { item ->
        val choice = choices[item.id] ?: return@mapNotNull null
        if (!choice.included) return@mapNotNull null
        val foodId = choice.foodId ?: return@mapNotNull null
        val match = matchOf(item, foodId) ?: return@mapNotNull null
        DraftSelection(
            itemId = item.id,
            foodId = foodId,
            grams = (choice.grams ?: match.grams.roundToInt()).coerceIn(MIN_GRAMS, MAX_GRAMS),
        )
    }

    /** Allergen collisions among the *currently selected* foods only. */
    fun conflicts(
        draft: ChatMealDraftDto,
        choices: Map<String, ItemChoice>,
    ): List<AllergenConflict> = draft.items.mapNotNull { item ->
        val choice = choices[item.id] ?: return@mapNotNull null
        if (!choice.included) return@mapNotNull null
        val match = matchOf(item, choice.foodId) ?: return@mapNotNull null
        if (match.allergenConflicts.isEmpty()) return@mapNotNull null
        AllergenConflict(item.id, match.name, match.allergenConflicts)
    }

    /**
     * Linear projection of the server's per-item figure. Display only — see
     * the file header.
     */
    fun projectKcal(match: ChatMealMatchDto, grams: Int): Int {
        if (match.grams <= 0.0) return 0
        return (match.kcal * grams / match.grams).roundToInt()
    }

    /** Running total for the card's footer. */
    fun totalKcal(draft: ChatMealDraftDto, choices: Map<String, ItemChoice>): Int =
        draft.items.sumOf { item ->
            val choice = choices[item.id] ?: return@sumOf 0
            if (!choice.included) return@sumOf 0
            val match = matchOf(item, choice.foodId) ?: return@sumOf 0
            projectKcal(match, choice.grams ?: match.grams.roundToInt())
        }

    /**
     * Nothing is logged without an explicit selection, and an allergy on the
     * profile must be acknowledged by its own tap — never by the tap that
     * logs the meal.
     */
    fun canConfirm(
        draft: ChatMealDraftDto,
        choices: Map<String, ItemChoice>,
        acknowledgedAllergens: Boolean,
    ): Boolean {
        if (selections(draft, choices).isEmpty()) return false
        if (conflicts(draft, choices).isNotEmpty() && !acknowledgedAllergens) return false
        return true
    }

    /**
     * Whether a line is included but still waiting on a food choice — the
     * state that keeps confirm disabled and needs saying out loud.
     */
    fun awaitingChoice(draft: ChatMealDraftDto, choices: Map<String, ItemChoice>): Boolean =
        draft.items.any { item ->
            val choice = choices[item.id] ?: return@any false
            item.status == ChatMealItemStatus.AMBIGUOUS && choice.included && choice.foodId == null
        }
}

/** Human phrasing of where a portion came from. */
enum class PortionBasis { AsStated, NamedServing, Assumed }

/** Classify [match]'s gram basis for the card's caption. */
fun ChatMealMatchDto.portionBasis(): PortionBasis = when {
    gramsBasis == GramsBasis.STATED_MASS || gramsBasis == GramsBasis.STATED_VOLUME ->
        PortionBasis.AsStated
    !servingLabel.isNullOrBlank() -> PortionBasis.NamedServing
    else -> PortionBasis.Assumed
}
