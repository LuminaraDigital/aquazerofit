package fit.aquazero.app.core.data

import fit.aquazero.app.core.database.ProgressSummaryEntity
import fit.aquazero.app.core.model.ApiResult
import fit.aquazero.app.core.model.BeltTier
import fit.aquazero.app.core.model.FightRecordEnvelopeDto
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The offline snapshot (FR-AND-04). What matters is the three states the
 * cache can be in — never asked, off, on — and that a failed refresh never
 * downgrades the one already there.
 */
class FightRecordRepositoryTest {

    private val api = FakeFightRecordApi()
    private val dao = FakeProgressDao()
    private val repository = FightRecordRepository(api, dao)

    @Test
    fun `nothing is cached before the server has answered once`() = runTest {
        assertNull(repository.cached().first())
    }

    @Test
    fun `a successful read is cached under its own key, beside the progress summary`() = runTest {
        val result = repository.refresh()

        assertEquals(BeltTier.BLUE, (result as ApiResult.Success).data!!.current.tier)
        assertEquals(BeltTier.BLUE, repository.cached().first()!!.fightRecord!!.current.tier)
        assertEquals(setOf(ProgressSummaryEntity.FIGHT_RECORD_KEY), dao.rows.value.keys)
        assertNull(dao.summary().first())
    }

    @Test
    fun `feature off is remembered as an answer, so it stays hidden offline`() = runTest {
        repository.refresh()
        api.envelope = FightRecordEnvelopeDto(fightRecord = null)

        val result = repository.refresh()

        assertNull((result as ApiResult.Success).data)
        val cached = repository.cached().first()
        // Not null: "off" must not look like "never asked", or an offline
        // cold start would offer a retry for a feature the account lacks.
        assertNotNull(cached)
        assertNull(cached!!.fightRecord)
    }

    @Test
    fun `a failed refresh leaves the last good snapshot in place`() = runTest {
        repository.refresh()
        api.offline = true

        val result = repository.refresh()

        assertTrue(result is ApiResult.Failure.Network)
        assertEquals(14, repository.cached().first()!!.fightRecord!!.current.activeDays)
    }

    @Test
    fun `a snapshot that no longer decodes reads as never asked`() = runTest {
        dao.upsertSummary(ProgressSummaryEntity(userId = ProgressSummaryEntity.FIGHT_RECORD_KEY, docJson = "{"))

        assertNull(repository.cached().first())
    }
}
