package fit.aquazero.app.core.data

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.emptyPreferences
import fit.aquazero.app.core.health.HealthConnectConsentStore
import fit.aquazero.app.core.ui.reminders.ReminderPrefs
import fit.aquazero.app.core.ui.reminders.ReminderPrefsStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

/**
 * Per-user state that lives outside Room. LocalCachePurger wiped every table
 * on logout and account switch, but these survived it: the next account on
 * the handset inherited the last one's reminder schedule and Health Connect
 * opt-in, and a photo staged before logout could upload under the next
 * account. Each piece here must come back empty.
 */
class UserScopedExtrasTest {

    @get:Rule
    val tmp = TemporaryFolder()

    /**
     * In memory: a file-backed DataStore cannot rename its temp file over an
     * existing one on Windows, so the second write fails there and nowhere else.
     */
    private class MemoryDataStore : DataStore<Preferences> {
        private val state = MutableStateFlow(emptyPreferences())
        override val data: Flow<Preferences> = state
        override suspend fun updateData(transform: suspend (Preferences) -> Preferences): Preferences =
            transform(state.value).also { state.value = it }
    }

    private fun store() = MemoryDataStore()

    @Test
    fun clearingReminderPrefsRestoresTheDefaults() = runTest {
        val prefs = ReminderPrefsStore(store())
        prefs.update { it.copy(mealsEnabled = false, weighInEnabled = true) }

        prefs.clear()

        assertEquals(ReminderPrefs(), prefs.current())
    }

    @Test
    fun clearingHealthConnectConsentDisconnects() = runTest {
        val consent = HealthConnectConsentStore(store())
        consent.setConnected(true)

        consent.clear()

        assertFalse(consent.current())
    }

    @Test
    fun discardingStagedPhotosEmptiesOnlyTheStagingDirectory() {
        val cache = tmp.newFolder("cache")
        val staging = File(cache, MEAL_PHOTO_STAGING_DIR).apply { mkdirs() }
        File(staging, "stage-1.jpg").writeText("a")
        File(staging, "job-2.jpg").writeText("b")
        val other = File(cache, "exports").apply { mkdirs() }
        File(other, "keep.csv").writeText("c")

        discardStagedMealPhotos(cache)

        assertTrue(staging.listFiles().orEmpty().isEmpty())
        assertTrue(File(other, "keep.csv").exists())
    }
}
