package fit.aquazero.app.feature.settings

import fit.aquazero.app.core.model.EntitlementsDto
import fit.aquazero.app.core.model.UserTier
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** The read-only plan surface: a balance bar that cannot lie about the balance. */
class PlanUiStateTest {

    private fun state(daily: Int, remaining: Int, tier: UserTier = UserTier.FREE) = PlanUiState(
        loading = false,
        entitlements = EntitlementsDto(
            tier = tier,
            dailyCredits = daily,
            creditsRemaining = remaining,
        ),
    )

    @Test
    fun `a partly spent day fills the bar proportionally`() {
        assertEquals(0.64f, state(daily = 50, remaining = 32).creditFraction, 1e-6f)
    }

    @Test
    fun `a carried-over balance above the daily grant fills the bar without overflowing`() {
        // Credits carry over, so the balance can exceed a day's grant. The bar
        // must saturate rather than run off the end of its track.
        assertEquals(1f, state(daily = 50, remaining = 120).creditFraction, 1e-6f)
    }

    @Test
    fun `an empty balance is an empty bar, never a negative one`() {
        assertEquals(0f, state(daily = 50, remaining = 0).creditFraction, 1e-6f)
        assertEquals(0f, state(daily = 50, remaining = -5).creditFraction, 1e-6f)
    }

    @Test
    fun `a zero daily grant does not divide by zero`() {
        assertEquals(0f, state(daily = 0, remaining = 0).creditFraction, 1e-6f)
        assertEquals(1f, state(daily = 0, remaining = 3).creditFraction, 1e-6f)
    }

    @Test
    fun `with nothing loaded the bar is empty rather than guessed`() {
        assertEquals(0f, PlanUiState().creditFraction, 1e-6f)
    }

    @Test
    fun `the tier flag comes from the server, never from a local toggle`() {
        assertFalse(state(50, 10).premium)
        assertTrue(state(50, 10, tier = UserTier.PREMIUM).premium)
    }

    @Test
    fun `cost rows are stably ordered so the list does not reshuffle between loads`() {
        val a = PlanUiState(
            entitlements = EntitlementsDto(
                tier = UserTier.FREE,
                dailyCredits = 50,
                creditsRemaining = 50,
                costs = mapOf("mealPhoto" to 3, "chatTurn" to 1, "planGeneration" to 5),
            ),
        )
        val b = PlanUiState(
            entitlements = EntitlementsDto(
                tier = UserTier.FREE,
                dailyCredits = 50,
                creditsRemaining = 50,
                costs = mapOf("planGeneration" to 5, "chatTurn" to 1, "mealPhoto" to 3),
            ),
        )
        assertEquals(listOf("chatTurn", "mealPhoto", "planGeneration"), a.costRows.map { it.first })
        assertEquals(a.costRows, b.costRows)
    }
}
