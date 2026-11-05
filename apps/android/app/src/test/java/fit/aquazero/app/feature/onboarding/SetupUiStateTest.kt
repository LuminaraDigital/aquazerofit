package fit.aquazero.app.feature.onboarding

import org.junit.Assert.assertFalse
import org.junit.Test

/**
 * Consent is opt-in. The first-setup form used to start with AI
 * personalisation, analytics and reminders already ticked; a pre-ticked box
 * is not consent, and it disagreed with the API's DEFAULT_CONSENTS (all off)
 * and with the web form. Only a box the person ticks may turn a purpose on.
 */
class SetupUiStateTest {

    @Test
    fun `every consent starts unticked`() {
        val state = SetupUiState()

        assertFalse(state.consentWellness)
        assertFalse(state.consentAi)
        assertFalse(state.consentAnalytics)
        assertFalse(state.consentReminders)
    }
}
