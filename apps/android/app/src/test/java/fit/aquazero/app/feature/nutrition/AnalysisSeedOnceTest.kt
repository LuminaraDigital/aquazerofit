package fit.aquazero.app.feature.nutrition

import fit.aquazero.app.core.model.MealType
import fit.aquazero.app.core.model.VisionJobDto
import fit.aquazero.app.core.model.VisionJobStatus
import fit.aquazero.app.core.model.VisionPredictionDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The seed-once rule.
 *
 * The editable list is built from the model's predictions exactly once. Every
 * later poll must leave the user's edits alone — anything else would let the
 * screen quietly replace numbers the user had already changed, and they would
 * then confirm something they never chose.
 */
class AnalysisSeedOnceTest {

    private fun job(
        status: VisionJobStatus,
        predictions: List<VisionPredictionDto> = listOf(
            VisionPredictionDto(
                name = "Poached eggs",
                foodId = "food-egg",
                estimatedGrams = 120.0,
                confidence = 0.8,
                kcal = 186.0,
                proteinG = 15.6,
                carbsG = 1.2,
                fatG = 13.2,
            ),
        ),
        error: String? = null,
    ) = VisionJobDto(
        id = "vj-1",
        status = status,
        mealType = MealType.BREAKFAST,
        predictions = predictions,
        error = error,
    )

    @Test
    fun `a queued job stays in the scanning phase and seeds nothing`() {
        val state = AnalysisReview.fold(AnalysisUiState(jobId = "vj-1"), job(VisionJobStatus.QUEUED))

        assertEquals(AnalysisPhase.Scanning, state.phase)
        assertFalse(state.seeded)
        assertTrue(state.items.isEmpty())
    }

    @Test
    fun `success seeds the list once and never commits it`() {
        val state = AnalysisReview.fold(
            AnalysisUiState(jobId = "vj-1"),
            job(VisionJobStatus.SUCCEEDED),
        )

        assertEquals(AnalysisPhase.Review, state.phase)
        assertTrue(state.seeded)
        assertEquals(1, state.items.size)
        assertEquals("Poached eggs", state.items.single().name)
        // Seeding is not logging.
        assertFalse(state.confirmed)
    }

    @Test
    fun `a later poll does not re-seed over the user's edits`() {
        val seeded = AnalysisReview.fold(
            AnalysisUiState(jobId = "vj-1"),
            job(VisionJobStatus.SUCCEEDED),
        )
        val edited = seeded.copy(
            items = listOf(seeded.items.single().copy(name = "Two eggs", grams = 60)),
        )

        val afterRepoll = AnalysisReview.fold(edited, job(VisionJobStatus.SUCCEEDED))

        assertEquals(1, afterRepoll.items.size)
        assertEquals("Two eggs", afterRepoll.items.single().name)
        assertEquals(60, afterRepoll.items.single().grams)
    }

    @Test
    fun `an emptied list is not refilled by a re-poll`() {
        val seeded = AnalysisReview.fold(
            AnalysisUiState(jobId = "vj-1"),
            job(VisionJobStatus.SUCCEEDED),
        )
        val emptied = seeded.copy(items = emptyList())

        val afterRepoll = AnalysisReview.fold(emptied, job(VisionJobStatus.SUCCEEDED))

        assertTrue(afterRepoll.items.isEmpty())
        assertFalse(afterRepoll.canConfirm)
    }

    @Test
    fun `a job already confirmed server-side locks the gate`() {
        val state = AnalysisReview.fold(
            AnalysisUiState(jobId = "vj-1"),
            job(VisionJobStatus.CONFIRMED),
        )

        assertEquals(AnalysisPhase.Review, state.phase)
        assertTrue(state.confirmed)
        assertFalse(state.canConfirm)
    }

    @Test
    fun `a confirmed state is never un-confirmed by a re-poll`() {
        val confirmed = AnalysisReview
            .fold(AnalysisUiState(jobId = "vj-1"), job(VisionJobStatus.SUCCEEDED))
            .copy(confirmed = true)

        val afterRepoll = AnalysisReview.fold(confirmed, job(VisionJobStatus.SUCCEEDED))

        assertTrue(afterRepoll.confirmed)
        assertFalse(afterRepoll.canConfirm)
    }

    @Test
    fun `a failed job carries the server's message and offers no gate`() {
        val state = AnalysisReview.fold(
            AnalysisUiState(jobId = "vj-1"),
            job(VisionJobStatus.FAILED, predictions = emptyList(), error = "Could not analyse"),
        )

        assertEquals(AnalysisPhase.Failed, state.phase)
        assertEquals("Could not analyse", state.jobErrorMessage)
        assertFalse(state.canConfirm)
    }

    @Test
    fun `the meal type comes from the job until the list is seeded`() {
        val queued = AnalysisReview.fold(AnalysisUiState(), job(VisionJobStatus.QUEUED))
        assertEquals(MealType.BREAKFAST, queued.mealType)

        val seeded = AnalysisReview.fold(queued, job(VisionJobStatus.SUCCEEDED))
        assertEquals(MealType.BREAKFAST, seeded.mealType)
    }
}
