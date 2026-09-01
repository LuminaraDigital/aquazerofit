package fit.aquazero.app.feature.settings

import fit.aquazero.app.core.database.ConsentEntity
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * `PUT /me/consents` replaces the whole consent document, so a body that omits
 * a bit withdraws it. The request succeeds either way, which is precisely why
 * this needs a test: the failure mode is silent.
 */
class ConsentUpdatesTest {

    private val allOn = ConsentEntity(
        userId = "me",
        wellnessDataProcessing = true,
        aiPersonalisation = true,
        anonymisedAnalytics = true,
        reminders = true,
    )

    @Test
    fun `turning one consent off leaves the other three exactly as they were`() {
        val update = ConsentUpdates.with(allOn, ConsentKey.REMINDERS, value = false)
        assertFalse(update.reminders)
        assertTrue(update.wellnessDataProcessing)
        assertTrue(update.aiPersonalisation)
        assertTrue(update.anonymisedAnalytics)
    }

    @Test
    fun `every key addresses its own bit and no other`() {
        val allOff = ConsentEntity(userId = "me")

        val wellness = ConsentUpdates.with(allOff, ConsentKey.WELLNESS, value = true)
        assertEquals(
            listOf(true, false, false, false),
            listOf(
                wellness.wellnessDataProcessing,
                wellness.aiPersonalisation,
                wellness.anonymisedAnalytics,
                wellness.reminders,
            ),
        )

        val ai = ConsentUpdates.with(allOff, ConsentKey.AI_PERSONALISATION, value = true)
        assertEquals(
            listOf(false, true, false, false),
            listOf(
                ai.wellnessDataProcessing,
                ai.aiPersonalisation,
                ai.anonymisedAnalytics,
                ai.reminders,
            ),
        )

        val analytics = ConsentUpdates.with(allOff, ConsentKey.ANALYTICS, value = true)
        assertEquals(
            listOf(false, false, true, false),
            listOf(
                analytics.wellnessDataProcessing,
                analytics.aiPersonalisation,
                analytics.anonymisedAnalytics,
                analytics.reminders,
            ),
        )

        val reminders = ConsentUpdates.with(allOff, ConsentKey.REMINDERS, value = true)
        assertEquals(
            listOf(false, false, false, true),
            listOf(
                reminders.wellnessDataProcessing,
                reminders.aiPersonalisation,
                reminders.anonymisedAnalytics,
                reminders.reminders,
            ),
        )
    }

    @Test
    fun `setting a bit to the value it already holds is a no-op on the whole document`() {
        val update = ConsentUpdates.with(allOn, ConsentKey.ANALYTICS, value = true)
        assertEquals(allOn.wellnessDataProcessing, update.wellnessDataProcessing)
        assertEquals(allOn.aiPersonalisation, update.aiPersonalisation)
        assertEquals(allOn.anonymisedAnalytics, update.anonymisedAnalytics)
        assertEquals(allOn.reminders, update.reminders)
    }
}
