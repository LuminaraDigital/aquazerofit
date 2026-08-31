package fit.aquazero.app.core.vision

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SquatFormAnalyzerTest {

    @Test
    fun `calculates 90 degree angle accurately`() {
        val analyzer = SquatFormAnalyzer()
        val hip = LandmarkPoint(0.5f, 0.2f)
        val knee = LandmarkPoint(0.5f, 0.5f)
        val ankle = LandmarkPoint(0.8f, 0.5f)

        val angle = analyzer.calculateAngle(hip, knee, ankle)
        assertEquals(90.0f, angle, 0.1f)
    }

    @Test
    fun `detects complete squat repetition through full range of motion`() {
        val analyzer = SquatFormAnalyzer()
        val hipStanding = LandmarkPoint(0.5f, 0.2f)
        val kneeStanding = LandmarkPoint(0.5f, 0.6f)
        val ankleStanding = LandmarkPoint(0.5f, 0.9f)

        // 1. Standing frame (~180 degrees)
        var result = analyzer.processFrame(hipStanding, kneeStanding, ankleStanding)
        assertEquals(0, result.repsCompleted)
        assertEquals(SquatPhase.STANDING, result.currentPhase)

        // 2. Descending frame (e.g. 110 degrees)
        val hipDesc = LandmarkPoint(0.35f, 0.5f)
        val kneeDesc = LandmarkPoint(0.5f, 0.65f)
        val ankleDesc = LandmarkPoint(0.5f, 0.9f)
        result = analyzer.processFrame(hipDesc, kneeDesc, ankleDesc)
        assertEquals(SquatPhase.DESCENDING, result.currentPhase)

        // 3. Bottom parallel frame (<= 90 degrees)
        val hipBottom = LandmarkPoint(0.3f, 0.65f)
        val kneeBottom = LandmarkPoint(0.5f, 0.65f)
        val ankleBottom = LandmarkPoint(0.5f, 0.9f)
        result = analyzer.processFrame(hipBottom, kneeBottom, ankleBottom)
        assertEquals(SquatPhase.BOTTOM_DEPTH, result.currentPhase)
        assertTrue(result.depthAchieved)

        // 4. Return to standing
        result = analyzer.processFrame(hipStanding, kneeStanding, ankleStanding)
        assertEquals(SquatPhase.STANDING, result.currentPhase)
        assertEquals(1, result.repsCompleted)
    }
}
