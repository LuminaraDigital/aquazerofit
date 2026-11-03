package fit.aquazero.app.core.gamification

import org.junit.Assert.assertTrue
import org.junit.Test

class BragCardGeneratorTest {

    @Test
    fun `formats viral brag text with coach details and consistency`() {
        val data = BragCardData(
            userDisplayName = "Alex",
            coach = null,
            level = 14,
            consistencyDays = 21,
            totalWorkouts = 36,
            recentPr = "Squat 140 kg x 5",
        )

        val text = BragCardGenerator.formatShareText(data, "https://aquazero.fit/join/huddle123")

        assertTrue(text.contains("AquaZeroFit Milestone"))
        assertTrue(text.contains("Level 14"))
        assertTrue(text.contains("21 active days"))
        assertTrue(text.contains("Squat 140 kg x 5"))
        assertTrue(text.contains("https://aquazero.fit/join/huddle123"))
    }
}
