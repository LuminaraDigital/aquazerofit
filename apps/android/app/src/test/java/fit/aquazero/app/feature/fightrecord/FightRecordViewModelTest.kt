package fit.aquazero.app.feature.fightrecord

import fit.aquazero.app.core.data.FakeFightRecordApi
import fit.aquazero.app.core.data.FakeProgressDao
import fit.aquazero.app.core.data.FightRecordRepository
import fit.aquazero.app.core.data.fightRecordStatus
import fit.aquazero.app.core.model.BeltTier
import fit.aquazero.app.core.model.FightRecordEnvelopeDto
import fit.aquazero.app.core.ui.FightRecordUiState
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

/** The screen asks on open, even over a snapshot, and follows the server's word. */
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
    fun `opening the screen replaces the snapshot with the server's answer`() = runTest(dispatcher) {
        viewModel()
        advanceUntilIdle()
        api.envelope = FightRecordEnvelopeDto(fightRecordStatus(activeDays = 24, tier = BeltTier.PURPLE))

        val viewModel = viewModel()
        advanceUntilIdle()

        val record = (viewModel.uiState.value as FightRecordUiState.Ready).record
        assertEquals(BeltTier.PURPLE, record.current.tier)
        assertEquals(2, api.calls)
    }

    @Test
    fun `a feature switched off while away shows the on-its-way state`() = runTest(dispatcher) {
        viewModel()
        advanceUntilIdle()
        api.envelope = FightRecordEnvelopeDto(fightRecord = null)

        val viewModel = viewModel()
        advanceUntilIdle()

        assertEquals(FightRecordUiState.Off, viewModel.uiState.value)
    }
}
