package fit.aquazero.app.feature.nutrition

import fit.aquazero.app.core.network.dto.Allergen
import fit.aquazero.app.core.network.dto.FoodDto
import fit.aquazero.app.core.network.dto.FoodNutrientsDto
import fit.aquazero.app.core.network.dto.MealLogItemDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class NutritionMathTest {

    @Test
    fun `micronutrients sum across items and treat absent values as zero`() {
        val micros = NutritionMath.micronutrients(
            listOf(
                item(fiberG = 6.2, sugarG = 4.0, sodiumMg = 120.0, ironMg = 1.4),
                item(fiberG = 3.1, sugarG = null, sodiumMg = 80.4, potassiumMg = 300.0),
                item(),
            ),
        )

        assertEquals(9.3, micros.fiberG, 0.001)
        assertEquals(4.0, micros.sugarG, 0.001)
        assertEquals(200, micros.sodiumMg)
        assertEquals(300, micros.potassiumMg)
        assertEquals(0, micros.calciumMg)
        assertEquals(1.4, micros.ironMg, 0.001)
    }

    @Test
    fun `a day with no micronutrient data reports itself as empty`() {
        assertTrue(NutritionMath.micronutrients(listOf(item(), item())).isEmpty)
        assertTrue(!NutritionMath.micronutrients(listOf(item(fiberG = 0.1))).isEmpty)
    }

    @Test
    fun `declared allergens are surfaced verbatim and in canonical order`() {
        val food = food(Allergen.SESAME, Allergen.MILK, Allergen.PEANUTS)

        assertEquals(
            listOf(Allergen.PEANUTS, Allergen.MILK, Allergen.SESAME),
            NutritionMath.allergensOf(food),
        )
    }

    @Test
    fun `a food with no declared allergens surfaces nothing`() {
        assertTrue(NutritionMath.allergensOf(food()).isEmpty())
    }

    @Test
    fun `every allergen in the shared union has a label - no silent omissions`() {
        val all = food(*Allergen.entries.toTypedArray())

        assertEquals(Allergen.entries.size, NutritionMath.allergensOf(all).size)
        assertEquals(Allergen.entries.size, NutritionMath.allergenLabels(all).size)
    }

    @Test
    fun `kcal bars keep a visible floor so an empty day still reads`() {
        assertEquals(NutritionMath.MIN_BAR_FRACTION, NutritionMath.barFraction(0.0, 2400.0), 0f)
        assertEquals(NutritionMath.MIN_BAR_FRACTION, NutritionMath.barFraction(1000.0, 0.0), 0f)
        assertEquals(0.5f, NutritionMath.barFraction(1200.0, 2400.0), 0.0001f)
        assertEquals(1f, NutritionMath.barFraction(3000.0, 2400.0), 0f)
    }

    private fun item(
        fiberG: Double? = null,
        sugarG: Double? = null,
        sodiumMg: Double? = null,
        potassiumMg: Double? = null,
        calciumMg: Double? = null,
        ironMg: Double? = null,
    ) = MealLogItemDto(
        name = "Item",
        grams = 100.0,
        kcal = 100.0,
        proteinG = 1.0,
        carbsG = 1.0,
        fatG = 1.0,
        fiberG = fiberG,
        sugarG = sugarG,
        sodiumMg = sodiumMg,
        potassiumMg = potassiumMg,
        calciumMg = calciumMg,
        ironMg = ironMg,
    )

    private fun food(vararg allergens: Allergen) = FoodDto(
        id = "f1",
        name = "Test food",
        per100g = FoodNutrientsDto(kcal = 100.0, proteinG = 1.0, carbsG = 1.0, fatG = 1.0),
        allergens = allergens.toList(),
    )
}
