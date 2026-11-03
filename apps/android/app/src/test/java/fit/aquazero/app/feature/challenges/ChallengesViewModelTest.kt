package fit.aquazero.app.feature.challenges

import fit.aquazero.app.R
import fit.aquazero.app.core.data.ChallengesRepository
import fit.aquazero.app.core.model.BuddyChallengeKind
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * Buddy huddles.
 *
 * The ViewModel is driven over a **real** [ChallengesRepository] backed by
 * in-memory fakes, so the code normalisation and the write-through cache are
 * under test here too — those are the parts a user actually feels when they
 * paste an invite code from a chat app.
 */
class ChallengesViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    private lateinit var api: FakeChallengesApi
    private lateinit var dao: FakeChatDao

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
        api = FakeChallengesApi()
        dao = FakeChatDao()
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun viewModel() = ChallengesViewModel(ChallengesRepository(api, dao))

    @Test
    fun `a successful load publishes the roster and caches it for next launch`() =
        runTest(dispatcher) {
            api.roster = listOf(challengeDto(id = "ch-1", code = "AQUA-AAAAAA"))
            val viewModel = viewModel()
            advanceUntilIdle()

            val state = viewModel.uiState.value
            assertFalse(state.loading)
            assertFalse(state.loadFailed)
            assertEquals(listOf("ch-1"), state.challenges.map { it.id })
            // Written through to Room, so a cold offline launch has something.
            assertEquals(listOf("ch-1"), dao.challengeRows.value.map { it.id })
        }

    @Test
    fun `a failed load surfaces the retry state`() = runTest(dispatcher) {
        api.listOutcome = ChallengeOutcome.Offline
        val viewModel = viewModel()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertFalse(state.loading)
        assertTrue(state.loadFailed)
        assertTrue(state.isEmpty)
    }

    @Test
    fun `cached huddles render before the network answers`() = runTest(dispatcher) {
        // Seed Room the way a previous session's write-through would have.
        val repository = ChallengesRepository(api, dao)
        api.roster = listOf(challengeDto(id = "ch-cached", code = "AQUA-BBBBBB"))
        repository.challenges()
        advanceUntilIdle()
        api.roster = emptyList()
        api.listOutcome = ChallengeOutcome.Offline

        val viewModel = ChallengesViewModel(repository)
        advanceUntilIdle()

        // Offline, but the huddle the user belongs to is still on screen.
        assertEquals(listOf("ch-cached"), viewModel.uiState.value.challenges.map { it.id })
    }

    @Test
    fun `a typed code is upper-cased and stripped of the spaces a paste brings`() =
        runTest(dispatcher) {
            val viewModel = viewModel()
            advanceUntilIdle()

            viewModel.onJoinCodeChange("  aqua zz 9911 ")

            assertEquals("AQUAZZ9911", viewModel.uiState.value.joinCode)
            assertTrue(viewModel.uiState.value.canJoin)
        }

    @Test
    fun `a code longer than the server accepts is capped rather than sent`() =
        runTest(dispatcher) {
            val viewModel = viewModel()
            advanceUntilIdle()

            viewModel.onJoinCodeChange("A".repeat(ChallengesRepository.MAX_CODE_LENGTH + 40))

            assertEquals(
                ChallengesRepository.MAX_CODE_LENGTH,
                viewModel.uiState.value.joinCode.length,
            )
        }

    @Test
    fun `a code too short to be plausible never costs a round trip`() = runTest(dispatcher) {
        val viewModel = viewModel()
        advanceUntilIdle()
        viewModel.onJoinCodeChange("AB")

        viewModel.join()
        advanceUntilIdle()

        val event = viewModel.events.first()
        assertTrue(event is ChallengesEvent.Message)
        assertEquals(R.string.challenges_code_too_short, (event as ChallengesEvent.Message).messageRes)
        assertTrue(event.isError)
        assertTrue(api.joinedCodes.isEmpty())
    }

    @Test
    fun `joining clears the field and reaches the wire normalised`() = runTest(dispatcher) {
        val viewModel = viewModel()
        advanceUntilIdle()
        viewModel.onJoinCodeChange("aqua zz9911")

        viewModel.join()
        advanceUntilIdle()

        assertEquals(listOf("AQUAZZ9911"), api.joinedCodes)
        // Cleared so the next paste starts from an empty field, not a stale one.
        assertEquals("", viewModel.uiState.value.joinCode)
        assertFalse(viewModel.uiState.value.joining)
    }

    @Test
    fun `a rejected join keeps the code so it can be corrected, not retyped`() =
        runTest(dispatcher) {
            api.joinOutcome = ChallengeOutcome.Http(status = 404, code = "not_found")
            val viewModel = viewModel()
            advanceUntilIdle()
            viewModel.onJoinCodeChange("AQUAWRONG1")

            viewModel.join()
            advanceUntilIdle()

            val event = viewModel.events.first()
            assertTrue(event is ChallengesEvent.Message)
            assertTrue((event as ChallengesEvent.Message).isError)
            assertEquals("AQUAWRONG1", viewModel.uiState.value.joinCode)
            assertFalse(viewModel.uiState.value.joining)
        }

    @Test
    fun `creating surfaces the issued code straight away, ready to share`() =
        runTest(dispatcher) {
            api.issuedCode = "AQUA-QW4T7P"
            val viewModel = viewModel()
            advanceUntilIdle()
            viewModel.setKind(BuddyChallengeKind.WORKOUTS)

            viewModel.create()
            advanceUntilIdle()

            val event = viewModel.events.first()
            assertTrue(event is ChallengesEvent.MessageWithArg)
            // The code is the whole point of creating one — it has to come back
            // in the confirmation rather than after another round trip.
            assertEquals("AQUA-QW4T7P", (event as ChallengesEvent.MessageWithArg).arg)
            assertEquals(listOf(BuddyChallengeKind.WORKOUTS), api.createdKinds)
            assertFalse(viewModel.uiState.value.creating)
        }

    @Test
    fun `a failed create reports it and leaves no spinner behind`() = runTest(dispatcher) {
        api.createOutcome = ChallengeOutcome.Offline
        val viewModel = viewModel()
        advanceUntilIdle()

        viewModel.create()
        advanceUntilIdle()

        val event = viewModel.events.first()
        assertTrue(event is ChallengesEvent.Message)
        assertTrue((event as ChallengesEvent.Message).isError)
        assertFalse(viewModel.uiState.value.creating)
    }

    @Test
    fun `a deep-linked code arrives pre-filled and normalised`() = runTest(dispatcher) {
        val viewModel = viewModel()
        advanceUntilIdle()

        viewModel.prefillJoinCode("aqua-zz9911")

        assertEquals("AQUA-ZZ9911", viewModel.uiState.value.joinCode)
        assertTrue(viewModel.uiState.value.canJoin)
    }
}
