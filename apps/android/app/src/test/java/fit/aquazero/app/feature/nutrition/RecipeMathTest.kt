package fit.aquazero.app.feature.nutrition

import fit.aquazero.app.core.model.Allergen
import fit.aquazero.app.core.model.FoodNutrientsDto
import fit.aquazero.app.core.model.RecipeDto
import fit.aquazero.app.core.model.RecipeIngredientDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Recipe arithmetic ends up in someone's food log, so it is computed rather
 * than estimated and tested rather than eyeballed.
 */
class RecipeMathTest {

    private fun recipe(
        servings: Int = 2,
        ingredients: List<RecipeIngredientDto> = listOf(
            RecipeIngredientDto(name = "Chicken breast", quantity = "300 g", grams = 300.0),
            RecipeIngredientDto(name = "Quinoa", quantity = "160 g", grams = 160.0),
            RecipeIngredientDto(name = "Feta", quantity = "40 g", grams = 40.0),
        ),
        allergens: List<Allergen> = emptyList(),
    ) = RecipeDto(
        id = "r1",
        name = "Mediterranean chicken bowl",
        servings = servings,
        perServing = FoodNutrientsDto(
            kcal = 520.4,
            proteinG = 42.26,
            carbsG = 50.44,
            fatG = 14.11,
            fiberG = 6.0,
        ),
        ingredients = ingredients,
        allergens = allergens,
    )

    @Test
    fun `grams per serving is the ingredient mass divided by the serving count`() {
        // 300 + 160 + 40 = 500 g over 2 servings.
        assertEquals(250, RecipeMath.gramsPerServing(recipe()))
    }

    @Test
    fun `a recipe with no ingredient masses falls back rather than reporting zero`() {
        val massless = recipe(
            ingredients = listOf(RecipeIngredientDto(name = "Olive oil", quantity = "a drizzle")),
        )
        assertEquals(RecipeMath.FALLBACK_GRAMS, RecipeMath.gramsPerServing(massless))
    }

    @Test
    fun `a recipe claiming zero servings falls back rather than dividing by zero`() {
        assertEquals(RecipeMath.FALLBACK_GRAMS, RecipeMath.gramsPerServing(recipe(servings = 0)))
    }

    @Test
    fun `one serving logs the per-serving values, rounded the way the server stores them`() {
        val item = RecipeMath.toLogItem(recipe(), servings = 1)
        assertEquals("Mediterranean chicken bowl", item.name)
        assertEquals(250.0, item.grams, 1e-9)
        assertEquals(520.0, item.kcal, 1e-9)
        assertEquals(42.3, item.proteinG, 1e-9)
        assertEquals(50.4, item.carbsG, 1e-9)
        assertEquals(14.1, item.fatG, 1e-9)
        assertEquals(6.0, item.fiberG!!, 1e-9)
    }

    @Test
    fun `three servings scale mass and every macro together`() {
        val item = RecipeMath.toLogItem(recipe(), servings = 3)
        assertEquals(750.0, item.grams, 1e-9)
        assertEquals(1561.0, item.kcal, 1e-9)
        assertEquals(126.8, item.proteinG, 1e-9)
        assertEquals(151.3, item.carbsG, 1e-9)
        assertEquals(42.3, item.fatG, 1e-9)
    }

    @Test
    fun `micronutrients the recipe does not carry stay absent rather than becoming zero`() {
        val item = RecipeMath.toLogItem(recipe(), servings = 2)
        assertEquals(null, item.sodiumMg)
        assertEquals(null, item.ironMg)
        assertEquals(12.0, item.fiberG!!, 1e-9)
    }

    @Test
    fun `an allergen the reader declared is matched exactly`() {
        val withMilk = recipe(allergens = listOf(Allergen.MILK, Allergen.WHEAT))
        val matched = RecipeMath.matchedAllergens(
            withMilk,
            declared = listOf(Allergen.MILK, Allergen.PEANUTS),
        )
        assertEquals(listOf(Allergen.MILK), matched)
    }

    @Test
    fun `no declared allergies means nothing is flagged`() {
        val withMilk = recipe(allergens = listOf(Allergen.MILK))
        assertTrue(RecipeMath.matchedAllergens(withMilk, declared = emptyList()).isEmpty())
    }

    @Test
    fun `every declared allergen the recipe contains is reported, not just the first`() {
        val loaded = recipe(allergens = listOf(Allergen.MILK, Allergen.WHEAT, Allergen.SOY))
        val matched = RecipeMath.matchedAllergens(
            loaded,
            declared = listOf(Allergen.SOY, Allergen.WHEAT, Allergen.FISH),
        )
        // Order follows the recipe's own list; membership is what matters.
        assertEquals(setOf(Allergen.WHEAT, Allergen.SOY), matched.toSet())
    }
}
