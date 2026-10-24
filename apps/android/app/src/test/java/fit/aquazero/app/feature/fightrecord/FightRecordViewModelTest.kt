package fit.aquazero.app.feature.fightrecord

import fit.aquazero.app.core.data.FakeFightRecordApi
import fit.aquazero.app.core.data.FakeProgressDao
import fit.aquazero.app.core.data.FightRecordRepository
import fit.aquazero.app.core.data.fightRecordStatus
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
 * instance over the same fakes is the next launch.
 */
class FightRecordViewModelTest {

    private val dispatcher = StandardTestDispatcher()
    private val api = FakeFightRecordApi()
    private val dao = FakeProgressDao()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun viewModel() = FightRecordViewModel(FightRecordRepository(api, dao))

    @Test
    fun `starts loading`() = runTest(dispatcher) {
        assertEquals(FightRecordUiState.Loading, viewModel().uiState.value)
    }

    @Test
    fun `a populated answer is ready`() = runTest(dispatcher) {
        val viewModel = viewModel()
        advanceUntilIdle()

        assertEquals(BeltTier.BLUE, (viewModel.uiState.value as FightRecordUiState.Ready).record.current.tier)
    }

    @Test
    fun `a null answer is off`() = runTest(dispatcher) {
        api.envelope = FightRecordEnvelopeDto(fightRecord = null)
        val viewModel = viewModel()
        advanceUntilIdle()

        assertEquals(FightRecordUiState.Off, viewModel.uiState.value)
    }

    @Test
    fun `off stays off on the next launch without signal`() = runTest(dispatcher) {
        api.envelope = FightRecordEnvelopeDto(fightRecord = null)
        viewModel()
        advanceUntilIdle()

        api.offline = true
        val relaunched = viewModel()
        advanceUntilIdle()

        assertEquals(FightRecordUiState.Off, relaunched.uiState.value)
    }

    @Test
    fun `offline with nothing cached fails, and a retry recovers`() = runTest(dispatcher) {
        api.offline = true
        val viewModel = viewModel()
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
        viewModel()
        advanceUntilIdle()

        api.offline = true
        val relaunched = viewModel()
        advanceUntilIdle()

        assertEquals(14, (relaunched.uiState.value as FightRecordUiState.Ready).record.current.activeDays)
    }

    @Test
    fun `a fresh answer replaces the snapshot`() = runTest(dispatcher) {
        viewModel()
        advanceUntilIdle()
        api.envelope = FightRecordEnvelopeDto(fightRecordStatus(activeDays = 24, tier = BeltTier.PURPLE))

        val viewModel = viewModel()
        advanceUntilIdle()

        assertEquals(BeltTier.PURPLE, (viewModel.uiState.value as FightRecordUiState.Ready).record.current.tier)
    }

    @Test
    fun `a feature switched off while away is off`() = runTest(dispatcher) {
        viewModel()
        advanceUntilIdle()
        api.envelope = FightRecordEnvelopeDto(fightRecord = null)

        val viewModel = viewModel()
        advanceUntilIdle()

        assertEquals(FightRecordUiState.Off, viewModel.uiState.value)
    }
}
