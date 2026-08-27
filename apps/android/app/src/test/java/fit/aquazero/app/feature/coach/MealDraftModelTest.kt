package fit.aquazero.app.feature.coach

import fit.aquazero.app.core.model.Allergen
import fit.aquazero.app.core.model.ChatMealDraftDto
import fit.aquazero.app.core.model.ChatMealItemDto
import fit.aquazero.app.core.model.ChatMealItemStatus
import fit.aquazero.app.core.model.ChatMealMatchDto
import fit.aquazero.app.core.model.GramsBasis
import fit.aquazero.app.core.model.MealType
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The confirmation gate.
 *
 * Every assertion here is a product invariant rather than an implementation
 * detail: nothing is logged without an explicit selection, an ambiguous line
 * never arrives pre-decided, and an allergen on the profile cannot be waved
 * through by the same tap that logs the meal.
 */
class MealDraftModelTest {

    private fun match(
        foodId: String,
        name: String = foodId,
        grams: Double = 100.0,
        kcal: Double = 200.0,
        allergens: List<Allergen> = emptyList(),
        basis: GramsBasis = GramsBasis.ASSUMED,
        servingLabel: String? = null,
    ) = ChatMealMatchDto(
        foodId = foodId,
        name = name,
        grams = grams,
        gramsBasis = basis,
        servingLabel = servingLabel,
        kcal = kcal,
        allergenConflicts = allergens,
    )

    private fun draft(vararg items: ChatMealItemDto) = ChatMealDraftDto(
        id = "d1",
        userId = "u1",
        sourceText = "two eggs on toast",
        mealType = MealType.BREAKFAST,
        items = items.toList(),
    )

    private fun resolved(id: String, foodId: String = "f-$id") = ChatMealItemDto(
        id = id,
        phrase = id,
        status = ChatMealItemStatus.RESOLVED,
        suggestedFoodId = foodId,
        matches = listOf(match(foodId)),
    )

    private fun ambiguous(id: String, vararg foodIds: String, suggested: String? = null) =
        ChatMealItemDto(
            id = id,
            phrase = id,
            status = ChatMealItemStatus.AMBIGUOUS,
            suggestedFoodId = suggested,
            matches = foodIds.map { match(it) },
        )

    private fun unmatched(id: String) = ChatMealItemDto(
        id = id,
        phrase = id,
        status = ChatMealItemStatus.UNMATCHED,
    )

    // -----------------------------------------------------------------------

    @Test
    fun `an ambiguous item starts with no food chosen`() {
        val model = draft(ambiguous("toast", "f-white", "f-rye"))
        val choice = MealDraftModel.initialChoices(model).getValue("toast")

        assertNull(choice.foodId)
        // Still included so the row stays live and visibly incomplete.
        assertTrue(choice.included)
        assertNull(choice.grams)
    }

    @Test
    fun `an ambiguous item stays unchosen even when the server suggests one`() {
        // The invariant is enforced client-side rather than trusted upstream:
        // pre-selecting turns "confirm what you ate" into "accept our guess".
        val model = draft(ambiguous("toast", "f-white", "f-rye", suggested = "f-white"))
        val choice = MealDraftModel.initialChoices(model).getValue("toast")

        assertNull(choice.foodId)
    }

    @Test
    fun `an ambiguous item cannot be confirmed until a food is picked`() {
        val model = draft(ambiguous("toast", "f-white", "f-rye"))
        val choices = MealDraftModel.initialChoices(model)

        assertTrue(MealDraftModel.selections(model, choices).isEmpty())
        assertFalse(MealDraftModel.canConfirm(model, choices, acknowledgedAllergens = false))
        assertTrue(MealDraftModel.awaitingChoice(model, choices))
    }

    @Test
    fun `picking a food makes an ambiguous item confirmable`() {
        val model = draft(ambiguous("toast", "f-white", "f-rye"))
        val choices = MealDraftModel.initialChoices(model) +
            ("toast" to ItemChoice(foodId = "f-rye", included = true, grams = 40))

        val selections = MealDraftModel.selections(model, choices)
        assertEquals(1, selections.size)
        assertEquals("f-rye", selections.single().foodId)
        assertEquals(40, selections.single().grams)
        assertFalse(MealDraftModel.awaitingChoice(model, choices))
    }

    @Test
    fun `a resolved item is pre-selected with its match`() {
        val model = draft(resolved("eggs"))
        val choice = MealDraftModel.initialChoices(model).getValue("eggs")

        assertEquals("f-eggs", choice.foodId)
        assertTrue(choice.included)
        assertEquals(100, choice.grams)
    }

    @Test
    fun `an unmatched item is excluded and never reaches the selections`() {
        val model = draft(unmatched("flat white"))
        val choices = MealDraftModel.initialChoices(model)

        assertFalse(choices.getValue("flat white").included)
        assertTrue(MealDraftModel.selections(model, choices).isEmpty())
    }

    @Test
    fun `unticking a line removes it from the selections`() {
        val model = draft(resolved("eggs"))
        val choices = MealDraftModel.initialChoices(model)
            .mapValues { it.value.copy(included = false) }

        assertTrue(MealDraftModel.selections(model, choices).isEmpty())
        assertFalse(MealDraftModel.canConfirm(model, choices, acknowledgedAllergens = true))
    }

    @Test
    fun `a food the line did not offer can never be selected`() {
        val model = draft(resolved("eggs"))
        val choices = mapOf("eggs" to ItemChoice(foodId = "f-smuggled", included = true))

        assertTrue(MealDraftModel.selections(model, choices).isEmpty())
    }

    @Test
    fun `an allergen conflict blocks confirm until acknowledged`() {
        val item = ChatMealItemDto(
            id = "eggs",
            phrase = "two eggs",
            status = ChatMealItemStatus.RESOLVED,
            suggestedFoodId = "f-egg",
            matches = listOf(match("f-egg", allergens = listOf(Allergen.EGGS))),
        )
        val model = draft(item)
        val choices = MealDraftModel.initialChoices(model)

        val conflicts = MealDraftModel.conflicts(model, choices)
        assertEquals(1, conflicts.size)
        assertEquals(listOf(Allergen.EGGS), conflicts.single().allergens)

        assertFalse(MealDraftModel.canConfirm(model, choices, acknowledgedAllergens = false))
        assertTrue(MealDraftModel.canConfirm(model, choices, acknowledgedAllergens = true))
    }

    @Test
    fun `a conflict on a deselected line does not block confirm`() {
        val risky = ChatMealItemDto(
            id = "peanuts",
            phrase = "peanuts",
            status = ChatMealItemStatus.RESOLVED,
            suggestedFoodId = "f-peanut",
            matches = listOf(match("f-peanut", allergens = listOf(Allergen.PEANUTS))),
        )
        val model = draft(resolved("eggs"), risky)
        val choices = MealDraftModel.initialChoices(model) +
            ("peanuts" to ItemChoice(foodId = "f-peanut", included = false, grams = 30))

        assertTrue(MealDraftModel.conflicts(model, choices).isEmpty())
        assertTrue(MealDraftModel.canConfirm(model, choices, acknowledgedAllergens = false))
    }

    @Test
    fun `grams are clamped to the API's plausibility bounds`() {
        val model = draft(resolved("eggs"))
        val tooMuch = MealDraftModel.initialChoices(model) +
            ("eggs" to ItemChoice("f-eggs", included = true, grams = 9_000))
        val tooLittle = MealDraftModel.initialChoices(model) +
            ("eggs" to ItemChoice("f-eggs", included = true, grams = 0))

        assertEquals(
            MealDraftModel.MAX_GRAMS,
            MealDraftModel.selections(model, tooMuch).single().grams,
        )
        assertEquals(
            MealDraftModel.MIN_GRAMS,
            MealDraftModel.selections(model, tooLittle).single().grams,
        )
    }

    @Test
    fun `kcal projection scales linearly and survives a zero-gram match`() {
        val hundred = match("f", grams = 100.0, kcal = 250.0)
        assertEquals(250, MealDraftModel.projectKcal(hundred, 100))
        assertEquals(125, MealDraftModel.projectKcal(hundred, 50))
        assertEquals(0, MealDraftModel.projectKcal(match("f", grams = 0.0), 100))
    }

    @Test
    fun `the total only counts included and chosen lines`() {
        val model = draft(
            resolved("eggs"),
            ambiguous("toast", "f-white"),
        )
        val choices = MealDraftModel.initialChoices(model)

        // Toast is unchosen, so only the eggs count.
        assertEquals(200, MealDraftModel.totalKcal(model, choices))
    }

    @Test
    fun `portion basis captions follow the gram basis`() {
        assertEquals(
            PortionBasis.AsStated,
            match("f", basis = GramsBasis.STATED_MASS).portionBasis(),
        )
        assertEquals(
            PortionBasis.NamedServing,
            match("f", basis = GramsBasis.DEFAULT_SERVING, servingLabel = "1 slice").portionBasis(),
        )
        assertEquals(
            PortionBasis.Assumed,
            match("f", basis = GramsBasis.ASSUMED).portionBasis(),
        )
    }
}
