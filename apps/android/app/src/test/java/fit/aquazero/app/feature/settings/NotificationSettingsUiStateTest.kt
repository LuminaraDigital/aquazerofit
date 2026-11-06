package fit.aquazero.app.feature.settings

import fit.aquazero.app.core.database.ConsentEntity
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Which of loading, error and content the reminder settings screen shows.
 *
 * The failure this guards: a consent fetch that fails offline before any row
 * is cached used to fall back to the skeleton for good, so the screen never
 * offered its retry.
 */
class NotificationSettingsUiStateTest {

    private val row = ConsentEntity(userId = "me", reminders = true)

    @Test
    fun `waits on the skeleton until the consent row arrives`() {
        val state = NotificationSettingsUiState(loading = false, consents = null)

        assertTrue(state.showSkeleton)
        assertFalse(state.showError)
    }

    @Test
    fun `a failed fetch with nothing cached shows the error instead of the skeleton`() {
        val state = NotificationSettingsUiState(loading = false, consents = null, consentsFailed = true)

        assertTrue(state.showError)
        assertFalse(state.showSkeleton)
    }

    @Test
    fun `a cached row wins over a failed refresh`() {
        val state = NotificationSettingsUiState(loading = false, consents = row, consentsFailed = true)

        assertFalse(state.showError)
        assertFalse(state.showSkeleton)
        assertTrue(state.remindersConsented)
    }
}
