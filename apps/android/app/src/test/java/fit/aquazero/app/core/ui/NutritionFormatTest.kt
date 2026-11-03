package fit.aquazero.app.core.ui

import fit.aquazero.app.core.model.FoodDto
import fit.aquazero.app.core.model.FoodNutrientsDto
import fit.aquazero.app.core.model.MealType
import org.junit.Assert.assertEquals
import org.junit.Test
import java.util.Locale

/**
 * The per-100 g → grams arithmetic is the one thing on these screens that
 * must never be guessed, so it is pinned here rather than only exercised
 * through the ViewModel.
 */
class NutritionFormatTest {

    private val oats = FoodDto(
        id = "f1",
        name = "Porridge oats",
        per100g = FoodNutrientsDto(
            kcal = 375.0,
            proteinG = 13.0,
            carbsG = 60.0,
            fatG = 7.0,
            fiberG = 10.0,
            sodiumMg = 8.0,
        ),
    )

    @Test
    fun `an item is computed from per-100g values and carries micronutrients`() {
        val item = NutritionFormat.itemFromFood(oats, grams = 80)

        assertEquals("f1", item.foodId)
        assertEquals(80.0, item.grams, 0.0)
        assertEquals(300.0, item.kcal, 0.0)
        assertEquals(10.4, item.proteinG, 0.001)
        assertEquals(48.0, item.carbsG, 0.001)
        assertEquals(5.6, item.fatG, 0.001)
        assertEquals(8.0, item.fiberG!!, 0.001)
        assertEquals(6.4, item.sodiumMg!!, 0.001)
    }

    @Test
    fun `kcal rounds to a whole number and macros to one decimal`() {
        val item = NutritionFormat.itemFromFood(oats, grams = 33)

        assertEquals(124.0, item.kcal, 0.0)
        assertEquals(4.3, item.proteinG, 0.001)
    }

    @Test
    fun `rescaling stays anchored to the original so repeats never compound`() {
        val original = NutritionFormat.itemFromFood(oats, grams = 100)

        val doubled = NutritionFormat.rescaleItem(original, 200)
        val backToOriginal = NutritionFormat.rescaleItem(original, 100)
        val halved = NutritionFormat.rescaleItem(original, 50)

        assertEquals(750.0, doubled.kcal, 0.0)
        assertEquals(375.0, backToOriginal.kcal, 0.0)
        assertEquals(188.0, halved.kcal, 0.0)
        // The anchor itself is never mutated.
        assertEquals(100.0, original.grams, 0.0)
    }

    @Test
    fun `rescaling a zero-gram item degrades to zero rather than dividing by zero`() {
        val zero = NutritionFormat.itemFromFood(oats, grams = 100).copy(grams = 0.0)

        val rescaled = NutritionFormat.rescaleItem(zero, 100)

        assertEquals(0.0, rescaled.kcal, 0.0)
    }

    @Test
    fun `progress fractions and percentages clamp at both ends`() {
        assertEquals(0f, NutritionFormat.clampFraction(500.0, 0.0), 0f)
        assertEquals(1f, NutritionFormat.clampFraction(3000.0, 2000.0), 0f)
        assertEquals(0.5f, NutritionFormat.clampFraction(1000.0, 2000.0), 0.0001f)
        assertEquals(0, NutritionFormat.clampPct(500.0, 0.0))
        assertEquals(100, NutritionFormat.clampPct(3000.0, 2000.0))
    }

    @Test
    fun `droplet segments never overflow the row`() {
        assertEquals(0, NutritionFormat.dropletsFilled(0, 2000))
        assertEquals(4, NutritionFormat.dropletsFilled(1000, 2000))
        assertEquals(8, NutritionFormat.dropletsFilled(2000, 2000))
        assertEquals(8, NutritionFormat.dropletsFilled(4000, 2000))
        assertEquals(0, NutritionFormat.dropletsFilled(500, 0))
    }

    @Test
    fun `meal type follows the time of day`() {
        assertEquals(MealType.BREAKFAST, NutritionFormat.mealTypeForNow(hour = 7))
        assertEquals(MealType.LUNCH, NutritionFormat.mealTypeForNow(hour = 12))
        assertEquals(MealType.SNACK, NutritionFormat.mealTypeForNow(hour = 16))
        assertEquals(MealType.DINNER, NutritionFormat.mealTypeForNow(hour = 20))
    }

    @Test
    fun `stored meal type names round-trip, unknown names fall back to snack`() {
        assertEquals(MealType.BREAKFAST, NutritionFormat.mealTypeOf("breakfast"))
        assertEquals(MealType.DINNER, NutritionFormat.mealTypeOf("DINNER"))
        assertEquals(MealType.SNACK, NutritionFormat.mealTypeOf("brunch"))
    }

    @Test
    fun `numbers format with tabular-friendly grouping and one decimal`() {
        assertEquals("2,400", NutritionFormat.fmtInt(2400.4, Locale.US))
        assertEquals("81.2", NutritionFormat.fmt1(81.24, Locale.US))
        assertEquals("1.3L", NutritionFormat.fmtLitres(1250, Locale.US))
    }

    @Test
    fun `an unparseable date degrades to the raw string instead of throwing`() {
        assertEquals("not-a-date", NutritionFormat.formatLocalDate("not-a-date"))
        assertEquals("", NutritionFormat.narrowWeekday("not-a-date"))
        assertEquals(0, NutritionFormat.dayOfMonth("not-a-date"))
    }
}
