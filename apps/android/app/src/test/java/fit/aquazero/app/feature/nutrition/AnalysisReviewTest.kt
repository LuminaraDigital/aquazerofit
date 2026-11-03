package fit.aquazero.app.feature.nutrition

import fit.aquazero.app.core.model.FoodDto
import fit.aquazero.app.core.model.FoodNutrientsDto
import fit.aquazero.app.core.model.FoodServingDto
import fit.aquazero.app.core.model.VisionPredictionDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The arithmetic and the seeding rule behind the confirmation gate.
 *
 * These are the two things a bug here would break silently: a portion edit
 * that reports macros the user never agreed to, and a re-seed that discards
 * their edits.
 */
class AnalysisReviewTest {

    private fun prediction(
        name: String = "Grilled chicken",
        grams: Double = 200.0,
        kcal: Double = 330.0,
        protein: Double = 62.0,
        carbs: Double = 0.0,
        fat: Double = 7.2,
        confidence: Double = 0.82,
        foodId: String? = "food-chicken",
    ) = VisionPredictionDto(
        name = name,
        foodId = foodId,
        estimatedGrams = grams,
        confidence = confidence,
        kcal = kcal,
        proteinG = protein,
        carbsG = carbs,
        fatG = fat,
    )

    @Test
    fun `per-gram ratios come from the seeded prediction`() {
        val items = AnalysisReview.seed(listOf(prediction()))
        val perGram = items.single().perGram

        assertEquals(330.0 / 200.0, perGram.kcal, 1e-9)
        assertEquals(62.0 / 200.0, perGram.proteinG, 1e-9)
        assertEquals(0.0, perGram.carbsG, 1e-9)
        assertEquals(7.2 / 200.0, perGram.fatG, 1e-9)
    }

    @Test
    fun `a zero-gram prediction never produces NaN`() {
        val items = AnalysisReview.seed(listOf(prediction(grams = 0.0, kcal = 120.0)))
        val computed = AnalysisReview.toMealLogItem(items.single())

        assertEquals(0.0, computed.kcal, 0.0)
        assertEquals(0.0, computed.proteinG, 0.0)
    }

    @Test
    fun `halving the portion halves the macros deterministically`() {
        val seeded = AnalysisReview.seed(listOf(prediction())).single()
        val halved = seeded.copy(grams = 100)

        val full = AnalysisReview.toMealLogItem(seeded)
        val half = AnalysisReview.toMealLogItem(halved)

        assertEquals(330.0, full.kcal, 0.0)
        assertEquals(165.0, half.kcal, 0.0)
        assertEquals(31.0, half.proteinG, 0.0)
        assertEquals(3.6, half.fatG, 0.0)
    }

    @Test
    fun `repeated gram edits never compound rounding`() {
        val seeded = AnalysisReview.seed(listOf(prediction())).single()

        // 200 -> 137 -> 200 must land exactly back on the seeded numbers,
        // because every value is recomputed from the ratios, not from the
        // previous displayed value.
        val wobbled = seeded.copy(grams = 137).copy(grams = 200)

        assertEquals(
            AnalysisReview.toMealLogItem(seeded),
            AnalysisReview.toMealLogItem(wobbled),
        )
    }

    @Test
    fun `seeded grams are clamped to the stepper range`() {
        val tiny = AnalysisReview.seed(listOf(prediction(grams = 1.0))).single()
        val huge = AnalysisReview.seed(listOf(prediction(grams = 9_000.0))).single()

        assertEquals(AnalysisReview.MIN_GRAMS, tiny.grams)
        assertEquals(AnalysisReview.MAX_GRAMS, huge.grams)
    }

    @Test
    fun `confidence bands follow the 75 and 50 percent thresholds`() {
        assertEquals(ConfidenceTier.High, AnalysisReview.tierOf(0.75))
        assertEquals(ConfidenceTier.High, AnalysisReview.tierOf(0.99))
        assertEquals(ConfidenceTier.Medium, AnalysisReview.tierOf(0.5))
        assertEquals(ConfidenceTier.Medium, AnalysisReview.tierOf(0.7499))
        assertEquals(ConfidenceTier.Low, AnalysisReview.tierOf(0.4999))
        assertEquals(ConfidenceTier.Low, AnalysisReview.tierOf(0.0))
        assertEquals(86, AnalysisReview.percent(0.8551))
    }

    @Test
    fun `totals sum the displayed values`() {
        val items = AnalysisReview.seed(
            listOf(
                prediction(grams = 200.0, kcal = 330.0, protein = 62.0, carbs = 0.0, fat = 7.2),
                prediction(
                    name = "Rice",
                    grams = 150.0,
                    kcal = 195.0,
                    protein = 4.5,
                    carbs = 41.0,
                    fat = 1.5,
                ),
            ),
        )
        val totals = AnalysisReview.totals(items)

        assertEquals(525.0, totals.kcal, 0.0)
        assertEquals(66.5, totals.proteinG, 1e-9)
        assertEquals(41.0, totals.carbsG, 1e-9)
        assertEquals(8.7, totals.fatG, 1e-9)
    }

    @Test
    fun `a food added by hand carries its per-100g ratios`() {
        val food = FoodDto(
            id = "food-oats",
            name = "Rolled oats",
            per100g = FoodNutrientsDto(kcal = 379.0, proteinG = 13.2, carbsG = 67.7, fatG = 6.5),
            commonServings = listOf(FoodServingDto("bowl", 60.0)),
        )
        val item = AnalysisReview.fromFood(food, grams = 50, key = "manual-1")
        val computed = AnalysisReview.toMealLogItem(item)

        assertEquals("food-oats", item.foodId)
        assertNull(item.confidence)
        assertEquals(190.0, computed.kcal, 0.0)
        assertEquals(6.6, computed.proteinG, 1e-9)
        assertEquals(33.9, computed.carbsG, 1e-9)
        assertEquals(3.3, computed.fatG, 1e-9)
    }

    @Test
    fun `seeding is capped at the API's item limit`() {
        val many = List(40) { prediction(name = "item-$it") }
        assertEquals(AnalysisReview.MAX_ITEMS, AnalysisReview.seed(many).size)
    }

    @Test
    fun `a prediction without a confidence renders no chip`() {
        val item = AnalysisReview.seed(listOf(prediction(confidence = 0.0))).single()
        assertNull(item.confidence)
    }

    // ----- the seed-once rule, expressed on the state object -----

    @Test
    fun `the gate stays shut with no items and after a confirm`() {
        val seeded = AnalysisUiState(
            jobId = "vj-1",
            phase = AnalysisPhase.Review,
            items = AnalysisReview.seed(listOf(prediction())),
            seeded = true,
        )

        assertTrue(seeded.canConfirm)
        assertTrue(!seeded.copy(items = emptyList()).canConfirm)
        assertTrue(!seeded.copy(confirmed = true).canConfirm)
        assertTrue(!seeded.copy(confirming = true).canConfirm)
        assertTrue(!seeded.copy(phase = AnalysisPhase.Scanning).canConfirm)
    }

    @Test
    fun `unlinked items are counted so the screen can warn about them`() {
        val state = AnalysisUiState(
            items = AnalysisReview.seed(
                listOf(prediction(), prediction(name = "Unknown side", foodId = null)),
            ),
        )
        assertEquals(1, state.unlinkedItemCount)
        assertNotNull(state.items.first().foodId)
    }
}
