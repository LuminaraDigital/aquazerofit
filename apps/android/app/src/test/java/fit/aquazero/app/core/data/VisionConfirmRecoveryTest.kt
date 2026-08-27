package fit.aquazero.app.core.data

import fit.aquazero.app.core.model.AzfJson
import fit.aquazero.app.core.model.MealDayDto
import fit.aquazero.app.core.model.MealLogDto
import fit.aquazero.app.core.model.MealLogSource
import fit.aquazero.app.core.model.MealType
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Recovery from a replayed `POST /meal-photos/:jobId/confirm`.
 *
 * A client that lost the 201 and retried must land on the meal log the first
 * attempt created — never dead-end, and never create a second one. A CONFLICT
 * that means something else ("this job is still queued") must stay a failure.
 */
class VisionConfirmRecoveryTest {

    private fun details(vararg pairs: Pair<String, String>): JsonObject =
        JsonObject(pairs.associate { (k, v) -> k to JsonPrimitive(v) })

    private fun mealLog(id: String, jobId: String?) = MealLogDto(
        id = id,
        userId = "u-1",
        mealType = MealType.LUNCH,
        source = MealLogSource.PHOTO,
        visionJobId = jobId,
        loggedAt = "2026-08-27T12:00:00.000Z",
        localDate = "2026-08-27",
    )

    @Test
    fun `the server's mealLogId is used when it is present`() {
        val payload = details("mealLogId" to "ml-42", "status" to "confirmed")

        assertEquals("ml-42", VisionConfirmRecovery.mealLogIdFromConflict(payload))
        assertTrue(VisionConfirmRecovery.isReplayedConfirm(payload))
    }

    @Test
    fun `a confirmed status alone still counts as a replay`() {
        val payload = details("status" to "confirmed")

        assertNull(VisionConfirmRecovery.mealLogIdFromConflict(payload))
        assertTrue(VisionConfirmRecovery.isReplayedConfirm(payload))
    }

    @Test
    fun `a conflict for any other reason is not a replay`() {
        assertFalse(VisionConfirmRecovery.isReplayedConfirm(details("status" to "queued")))
        assertFalse(VisionConfirmRecovery.isReplayedConfirm(details("status" to "processing")))
        assertFalse(VisionConfirmRecovery.isReplayedConfirm(details("status" to "failed")))
        assertFalse(VisionConfirmRecovery.isReplayedConfirm(null))
        assertFalse(VisionConfirmRecovery.isReplayedConfirm(JsonObject(emptyMap())))
    }

    @Test
    fun `a blank or non-string mealLogId is ignored`() {
        assertNull(VisionConfirmRecovery.mealLogIdFromConflict(details("mealLogId" to "")))
        assertNull(
            VisionConfirmRecovery.mealLogIdFromConflict(
                JsonObject(mapOf("mealLogId" to JsonPrimitive(42))),
            ),
        )
    }

    @Test
    fun `an older server without the field falls back to the day's logs`() {
        val payload = details("status" to "confirmed")
        assertNull(VisionConfirmRecovery.mealLogIdFromConflict(payload))

        val day = MealDayDto(
            date = "2026-08-27",
            meals = mapOf(
                MealType.BREAKFAST to listOf(mealLog("ml-1", null)),
                MealType.LUNCH to listOf(mealLog("ml-2", "vj-target")),
            ),
        )

        assertEquals("ml-2", VisionConfirmRecovery.matchMealLogId(day, "vj-target"))
    }

    @Test
    fun `no match returns null rather than a wrong meal log`() {
        val day = MealDayDto(
            date = "2026-08-27",
            meals = mapOf(MealType.LUNCH to listOf(mealLog("ml-2", "vj-other"))),
        )

        assertNull(VisionConfirmRecovery.matchMealLogId(day, "vj-target"))
        assertNull(VisionConfirmRecovery.matchMealLogId(MealDayDto(date = "2026-08-27"), "vj-1"))
    }

    @Test
    fun `the real error envelope shape decodes into the recovery path`() {
        // Shape of the API's `{code, message, details}` conflict body.
        val body = """
            {"code":"CONFLICT","message":"Already confirmed.","details":{"status":"confirmed","mealLogId":"ml-77"}}
        """.trimIndent()
        val envelope = AzfJson.decodeFromString(
            fit.aquazero.app.core.model.ApiErrorEnvelope.serializer(),
            body,
        )

        assertTrue(VisionConfirmRecovery.isReplayedConfirm(envelope.details))
        assertEquals("ml-77", VisionConfirmRecovery.mealLogIdFromConflict(envelope.details))
    }
}
