package fit.aquazero.app.feature.dashboard

import fit.aquazero.app.core.data.FakeFightRecordApi
import fit.aquazero.app.core.data.FakeProgressDao
import fit.aquazero.app.core.data.FightRecordRepository
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

/**
 * The season card, driven over a **real** [FightRecordRepository] backed by
 * in-memory fakes, so the envelope cache that decides "off" versus "never
 * asked" is under test too — that is the difference between a card that stays
 * invisible offline and one that offers a retry for a feature the account
 * does not have.
 */
class SeasonCardViewModelTest {

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

    private fun viewModel() = SeasonCardViewModel(FightRecordRepository(api, dao))

    @Test
    fun `starts on the skeleton`() = runTest(dispatcher) {
        assertEquals(FightRecordUiState.Loading, viewModel().uiState.value)
    }

    @Test
    fun `a populated answer shows the card`() = runTest(dispatcher) {
        val viewModel = viewModel()
        advanceUntilIdle()

        val state = viewModel.uiState.value as FightRecordUiState.Ready
        assertEquals(BeltTier.BLUE, state.record.current.tier)
    }

    @Test
    fun `a null answer hides the card`() = runTest(dispatcher) {
        api.envelope = FightRecordEnvelopeDto(fightRecord = null)
        val viewModel = viewModel()
        advanceUntilIdle()

        assertEquals(FightRecordUiState.Off, viewModel.uiState.value)
    }

    @Test
    fun `off stays hidden on the next launch without signal`() = runTest(dispatcher) {
        api.envelope = FightRecordEnvelopeDto(fightRecord = null)
        viewModel()
        advanceUntilIdle()

        api.offline = true
        val relaunched = viewModel()
        advanceUntilIdle()

        assertEquals(FightRecordUiState.Off, relaunched.uiState.value)
    }

    @Test
    fun `offline with nothing cached offers the retry, and the retry recovers`() = runTest(dispatcher) {
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
}
