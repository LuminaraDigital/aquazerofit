package fit.aquazero.app.feature.fightrecord

import fit.aquazero.app.core.data.FakeFightRecordApi
import fit.aquazero.app.core.data.FakeOutboxDao
import fit.aquazero.app.core.data.FakeProgressDao
import fit.aquazero.app.core.data.FightRecordRepository
import fit.aquazero.app.core.data.OutboxRepository
import fit.aquazero.app.core.data.fightRecordStatus
import fit.aquazero.app.core.database.OutboxEntityTypes
import fit.aquazero.app.core.model.BeltRungDto
import fit.aquazero.app.core.model.BeltTier
import fit.aquazero.app.core.model.FightRecordEnvelopeDto
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test

/**
 * The one ViewModel behind the season card and the screen, driven over a
 * **real** [FightRecordRepository] backed by in-memory fakes, so the envelope
 * cache that tells "off" from "never asked" is under test too. A second
 * instance over the same fakes is the next launch, and [open] stands in for
 * the resume effect each surface runs.
 */
class FightRecordViewModelTest {

    private val dispatcher = StandardTestDispatcher()
    private val api = FakeFightRecordApi()
    private val dao = FakeProgressDao()
    private val outbox = OutboxRepository(FakeOutboxDao())

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun viewModel() = FightRecordViewModel(FightRecordRepository(api, dao), outbox)

    /** A surface composing: it constructs the ViewModel and its resume effect refreshes. */
    private fun open() = viewModel().also { it.refresh() }

    @Test
    fun `nothing is fetched until a surface resumes`() = runTest(dispatcher) {
        val viewModel = viewModel()
        advanceUntilIdle()

        assertEquals(0, api.calls)
        assertEquals(FightRecordUiState.Loading, viewModel.uiState.value)
    }

    @Test
    fun `a log that reaches the server refetches, so its active day counts`() = runTest(dispatcher) {
        api.envelope = FightRecordEnvelopeDto(
            fightRecordStatus(activeDays = 11, tier = BeltTier.WHITE, next = BeltRungDto(BeltTier.BLUE, 12)),
        )
        val viewModel = open()
        advanceUntilIdle()

        // Water logged on the dashboard: queued locally, not yet counted.
        api.envelope = FightRecordEnvelopeDto(fightRecordStatus(activeDays = 12, tier = BeltTier.BLUE))
        val op = outbox.enqueueCreate(OutboxEntityTypes.WATER_LOG, "w1", "{}", "k1")
        advanceUntilIdle()
        assertEquals(1, api.calls)

        outbox.markSynced(op)
        advanceUntilIdle()

        assertEquals(2, api.calls)
        assertEquals(BeltTier.BLUE, (viewModel.uiState.value as FightRecordUiState.Ready).record.current.tier)
    }

    @Test
    fun `a log that reaches the server refetches even while an earlier rejected log sits in the outbox`() =
        runTest(dispatcher) {
            api.envelope = FightRecordEnvelopeDto(
                fightRecordStatus(activeDays = 11, tier = BeltTier.WHITE, next = BeltRungDto(BeltTier.BLUE, 12)),
            )
            val viewModel = open()
            advanceUntilIdle()

            // A weigh-in the server rejected stays FAILED in the outbox for the session.
            val rejected = outbox.enqueueCreate(OutboxEntityTypes.WEIGHT_LOG, "wt1", "{}", "k1")
            outbox.markFailed(rejected, errorCode = "VALIDATION_FAILED")
            val water = outbox.enqueueCreate(OutboxEntityTypes.WATER_LOG, "w1", "{}", "k2")
            advanceUntilIdle()

            api.envelope = FightRecordEnvelopeDto(fightRecordStatus(activeDays = 12, tier = BeltTier.BLUE))
            val callsBeforeSync = api.calls
            outbox.markSynced(water)
            advanceUntilIdle()

            assertEquals(callsBeforeSync + 1, api.calls)
            assertEquals(BeltTier.BLUE, (viewModel.uiState.value as FightRecordUiState.Ready).record.current.tier)
        }

    @Test
    fun `a populated answer is ready`() = runTest(dispatcher) {
        val viewModel = open()
        advanceUntilIdle()

        assertEquals(BeltTier.BLUE, (viewModel.uiState.value as FightRecordUiState.Ready).record.current.tier)
    }

    @Test
    fun `a null answer is off`() = runTest(dispatcher) {
        api.envelope = FightRecordEnvelopeDto(fightRecord = null)
        val viewModel = open()
        advanceUntilIdle()

        assertEquals(FightRecordUiState.Off, viewModel.uiState.value)
    }

    @Test
    fun `off stays off on the next launch without signal`() = runTest(dispatcher) {
        api.envelope = FightRecordEnvelopeDto(fightRecord = null)
        open()
        advanceUntilIdle()

        api.offline = true
        val relaunched = open()
        advanceUntilIdle()

        assertEquals(FightRecordUiState.Off, relaunched.uiState.value)
    }

    @Test
    fun `offline with nothing cached fails, and a retry recovers`() = runTest(dispatcher) {
        api.offline = true
        val viewModel = open()
        advanceUntilIdle()
        assertEquals(FightRecordUiState.Failed, viewModel.uiState.value)

        api.offline = false
        viewModel.refresh()
        advanceUntilIdle()

        assertEquals(2, api.calls)
        assertEquals(BeltTier.BLUE, (viewModel.uiState.value as FightRecordUiState.Ready).record.current.tier)
    }

    @Test
    fun `offline with a snapshot keeps showing the last season`() = runTest(dispatcher) {
        open()
        advanceUntilIdle()

        api.offline = true
        val relaunched = open()
        advanceUntilIdle()

        assertEquals(14, (relaunched.uiState.value as FightRecordUiState.Ready).record.current.activeDays)
    }

    @Test
    fun `a fresh answer replaces the snapshot`() = runTest(dispatcher) {
        open()
        advanceUntilIdle()
        api.envelope = FightRecordEnvelopeDto(fightRecordStatus(activeDays = 24, tier = BeltTier.PURPLE))

        val viewModel = open()
        advanceUntilIdle()

        assertEquals(BeltTier.PURPLE, (viewModel.uiState.value as FightRecordUiState.Ready).record.current.tier)
    }

    @Test
    fun `a feature switched off while away is off`() = runTest(dispatcher) {
        open()
        advanceUntilIdle()
        api.envelope = FightRecordEnvelopeDto(fightRecord = null)

        val viewModel = open()
        advanceUntilIdle()

        assertEquals(FightRecordUiState.Off, viewModel.uiState.value)
    }
}
