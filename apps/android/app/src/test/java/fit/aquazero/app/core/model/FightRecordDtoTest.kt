package fit.aquazero.app.core.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * `GET /fight-record`, decoded through the app's one [AzfJson]. The payloads
 * are the shapes `apps/api/src/modules/fightRecord/router.ts` sends; the
 * point of the last two cases is that a server ahead of this build degrades a
 * row, never the whole surface.
 */
class FightRecordDtoTest {

    @Test
    fun `a full payload decodes every field the screens read`() {
        val envelope = decode(
            """
            {"fightRecord": {
              "current": {
                "season": {"id": "season-3", "number": 3, "name": "Second Wind",
                           "startsOn": "2027-03-01", "endsOn": "2027-04-25"},
                "activeDays": 14, "daysLeft": 23, "tier": "blue",
                "next": {"tier": "purple", "activeDays": 24}
              },
              "ladder": [
                {"tier": "white", "activeDays": 3}, {"tier": "blue", "activeDays": 12},
                {"tier": "purple", "activeDays": 24}, {"tier": "brown", "activeDays": 36},
                {"tier": "black", "activeDays": 48}
              ],
              "belts": [{"id": "belt-s3-blue", "seasonNumber": 3, "seasonName": "Second Wind",
                         "tier": "blue", "awardedAt": "2027-03-19T02:10:00.000Z"}],
              "celebrate": null,
              "adult": true,
              "emojiStatus": {"available": true, "enabled": false}
            }}
            """,
        )

        val record = envelope.fightRecord!!
        assertEquals(3, record.current.season.number)
        assertEquals("Second Wind", record.current.season.name)
        assertEquals("2027-04-25", record.current.season.endsOn)
        assertEquals(14, record.current.activeDays)
        assertEquals(23, record.current.daysLeft)
        assertEquals(BeltTier.BLUE, record.current.tier)
        assertEquals(BeltRungDto(BeltTier.PURPLE, 24), record.current.next)
        assertEquals(BeltTier.entries - BeltTier.UNKNOWN, record.ladder.map { it.tier })
        assertEquals(listOf(3, 12, 24, 36, 48), record.ladder.map { it.activeDays })
        assertEquals(BeltTier.BLUE, record.belts.single().tier)
        assertNull(record.celebrate)
        assertTrue(record.adult)
        assertTrue(record.emojiStatus.available)
    }

    @Test
    fun `a null envelope is the feature switched off, not an error`() {
        assertNull(decode("""{"fightRecord": null}""").fightRecord)
    }

    @Test
    fun `before the first rung and at the top of the ladder both decode as null`() {
        val record = decode(
            """
            {"fightRecord": {"current": {
              "season": {"id": "season-1", "number": 1, "name": "Fight Camp",
                         "startsOn": "2026-10-19", "endsOn": "2026-12-13"},
              "activeDays": 0, "daysLeft": 56, "tier": null,
              "next": null
            }}}
            """,
        ).fightRecord!!

        assertNull(record.current.tier)
        assertNull(record.current.next)
        assertTrue(record.belts.isEmpty())
        assertFalse(record.emojiStatus.enabled)
    }

    @Test
    fun `unknown fields anywhere are ignored`() {
        val record = decode(
            """
            {"fightRecord": {"current": {
              "season": {"id": "season-2", "number": 2, "name": "Ground Game",
                         "startsOn": "2026-12-14", "endsOn": "2027-02-07", "theme": "winter"},
              "activeDays": 5, "daysLeft": 40, "tier": "white",
              "next": {"tier": "blue", "activeDays": 12, "hint": "x"}, "multiplier": 2
            }, "squad": {"members": []}}, "serverTime": "2027-01-01T00:00:00Z"}
            """,
        ).fightRecord!!

        assertEquals(BeltTier.WHITE, record.current.tier)
        assertEquals(12, record.current.next!!.activeDays)
    }

    @Test
    fun `a tier this build has never heard of decodes as unknown instead of failing`() {
        val record = decode(
            """
            {"fightRecord": {"current": {
              "season": {"id": "season-9", "number": 9, "name": "Title Run",
                         "startsOn": "2028-01-01", "endsOn": "2028-02-25"},
              "activeDays": 52, "daysLeft": 3, "tier": "red",
              "next": {"tier": "coral", "activeDays": 60}
            },
            "ladder": [{"tier": "black", "activeDays": 48}, {"tier": "red", "activeDays": 52}],
            "belts": [
              {"id": "b9", "seasonNumber": 9, "seasonName": "Title Run", "tier": "red"},
              {"id": "b8", "seasonNumber": 8, "seasonName": "Long Game", "tier": "black"}
            ]}}
            """,
        ).fightRecord!!

        // Unknown, not null: the holder of a new belt is not told "No belt yet".
        assertEquals(BeltTier.UNKNOWN, record.current.tier)
        assertEquals(BeltTier.UNKNOWN, record.current.next!!.tier)
        assertEquals(listOf(BeltTier.BLACK, BeltTier.UNKNOWN), record.ladder.map { it.tier })
        assertEquals(listOf(BeltTier.UNKNOWN, BeltTier.BLACK), record.belts.map { it.tier })
    }

    @Test
    fun `the offline cache round trip keeps no belt as null and a new belt as unknown`() {
        val envelope = decode(
            """
            {"fightRecord": {"current": {
              "season": {"id": "season-1", "number": 1, "name": "Fight Camp",
                         "startsOn": "2026-10-19", "endsOn": "2026-12-13"},
              "activeDays": 1, "daysLeft": 50, "tier": null,
              "next": {"tier": "red", "activeDays": 3}
            }}}
            """,
        )

        val cached = AzfJson.encodeToString(FightRecordEnvelopeDto.serializer(), envelope)
        val reread = AzfJson.decodeFromString(FightRecordEnvelopeDto.serializer(), cached).fightRecord!!

        assertNull(reread.current.tier)
        assertEquals(BeltTier.UNKNOWN, reread.current.next!!.tier)
    }

    private fun decode(json: String): FightRecordEnvelopeDto =
        AzfJson.decodeFromString(FightRecordEnvelopeDto.serializer(), json.trimIndent())
}
