package fit.aquazero.app.feature.coach

import fit.aquazero.app.core.model.ApiResult
import fit.aquazero.app.core.model.CoachRosterDto
import fit.aquazero.app.core.model.ExperienceStatusDto
import fit.aquazero.app.core.ui.CoachRoster
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
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * Character select.
 *
 * The behaviour under test is a join: a client-side persona list (which ships
 * in the APK and is always available) against server entitlements (which may
 * be absent, stale, or contradict the client's level rule). Every case below
 * is one way that join can go wrong on a real device.
 */
class CoachSelectViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    /** Free at level 0 — see `CoachRoster.personas`. */
    private val freeId = "akin"

    /** Opens at level 5. */
    private val gatedId = "king"

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `a cold offline launch still shows the free coaches as unlocked`() = runTest(dispatcher) {
        val repository = FakeCoachesRepository()
        val viewModel = CoachSelectViewModel(repository)
        advanceUntilIdle()

        val cards = viewModel.uiState.value.cards
        assertEquals(CoachRoster.personas.size, cards.size)
        // No payload arrived, so the client's own level rule has to answer.
        assertTrue(cards.first { it.persona.id == freeId }.unlocked)
        assertFalse(cards.first { it.persona.id == gatedId }.unlocked)
    }

    @Test
    fun `a failed refresh is never an error state, because the roster is client-side`() =
        runTest(dispatcher) {
            val viewModel = CoachSelectViewModel(FakeCoachesRepository())
            advanceUntilIdle()

            // Nothing reached the network and nothing was cached, yet the screen
            // is neither loading nor failed: `buildCards` maps `CoachRoster.personas`,
            // which ships in the APK, so there is always a full grid to render and
            // never anything to apologise for.
            assertFalse(viewModel.uiState.value.loading)
            assertFalse(viewModel.uiState.value.rosterFailed)
            assertEquals(CoachRoster.personas.size, viewModel.uiState.value.cards.size)

            // Worth stating plainly because the screen still carries an
            // `ErrorState` branch guarded by `rosterFailed && cards.isEmpty()`.
            // `cards` cannot be empty, so that branch — and the two strings it
            // renders — is unreachable. It is harmless defence-in-depth rather
            // than a defect, but this test is what will fail if someone later
            // makes the roster server-driven and forgets that the guard was
            // written for a world where an empty grid was possible.
            assertTrue(viewModel.uiState.value.cards.isNotEmpty())
        }

    @Test
    fun `a cached entitlement overrides the client level rule`() = runTest(dispatcher) {
        val repository = FakeCoachesRepository().apply {
            cached.value = listOf(coachEntity(gatedId, unlocked = true, requiredLevel = 5))
        }
        val viewModel = CoachSelectViewModel(repository)
        advanceUntilIdle()

        // The server is the authority on entitlement: a level-5 coach the user
        // has already earned must not re-lock because the level read is stale.
        val card = viewModel.uiState.value.cards.first { it.persona.id == gatedId }
        assertTrue(card.unlocked)
        assertFalse(card.showsRequirement)
    }

    @Test
    fun `tapping a locked coach explains the door and makes no network call`() =
        runTest(dispatcher) {
            val repository = FakeCoachesRepository()
            val viewModel = CoachSelectViewModel(repository)
            advanceUntilIdle()

            val locked = viewModel.uiState.value.cards.first { it.persona.id == gatedId }
            viewModel.select(locked)
            advanceUntilIdle()

            val event = viewModel.events.first()
            assertTrue(event is CoachSelectEvent.StillLocked)
            assertEquals(5, (event as CoachSelectEvent.StillLocked).level)
            assertEquals(locked.persona.name, event.coachName)
            assertTrue(repository.selectCalls.isEmpty())
        }

    @Test
    fun `tapping the active coach opens the chat instead of re-selecting it`() =
        runTest(dispatcher) {
            val repository = FakeCoachesRepository().apply {
                cached.value = listOf(coachEntity(freeId, active = true))
            }
            val viewModel = CoachSelectViewModel(repository)
            advanceUntilIdle()

            val active = viewModel.uiState.value.cards.first { it.persona.id == freeId }
            assertTrue(active.active)
            viewModel.select(active)
            advanceUntilIdle()

            assertTrue(viewModel.events.first() is CoachSelectEvent.OpenChat)
            // Re-selecting the coach you already have is a wasted round trip.
            assertTrue(repository.selectCalls.isEmpty())
        }

    @Test
    fun `a successful switch reports the first name and clears the pending id`() =
        runTest(dispatcher) {
            val repository = FakeCoachesRepository().apply {
                cached.value = listOf(
                    coachEntity(freeId, active = true),
                    coachEntity("sanzo", unlocked = true),
                )
                selectResult = ApiResult.Success(CoachRosterDto(activeCoachId = "sanzo"))
            }
            val viewModel = CoachSelectViewModel(repository)
            advanceUntilIdle()

            val target = viewModel.uiState.value.cards.first { it.persona.id == "sanzo" }
            viewModel.select(target)
            advanceUntilIdle()

            val event = viewModel.events.first()
            assertTrue(event is CoachSelectEvent.Switched)
            assertEquals(target.persona.firstName, (event as CoachSelectEvent.Switched).coachName)
            assertEquals(listOf("sanzo"), repository.selectCalls)
            assertNull(viewModel.uiState.value.switchingCoachId)
        }

    @Test
    fun `a failed switch clears the pending id so the row is not stuck spinning`() =
        runTest(dispatcher) {
            val repository = FakeCoachesRepository().apply {
                cached.value = listOf(coachEntity("sanzo", unlocked = true))
                selectResult = offline()
            }
            val viewModel = CoachSelectViewModel(repository)
            advanceUntilIdle()

            viewModel.select(viewModel.uiState.value.cards.first { it.persona.id == "sanzo" })
            advanceUntilIdle()

            assertTrue(viewModel.events.first() is CoachSelectEvent.SwitchFailed)
            assertNull(viewModel.uiState.value.switchingCoachId)
        }

    @Test
    fun `a stale roster read never walks the level or the total back`() = runTest(dispatcher) {
        val repository = FakeCoachesRepository().apply {
            rosterResult = ApiResult.Success(
                CoachRosterDto(
                    activeCoachId = freeId,
                    experience = ExperienceStatusDto(totalXp = 4_000, level = 9),
                ),
            )
        }
        val viewModel = CoachSelectViewModel(repository)
        advanceUntilIdle()
        val peak = viewModel.uiState.value.experience!!

        // A replica that has not caught up answers the next refresh.
        repository.rosterResult = ApiResult.Success(
            CoachRosterDto(
                activeCoachId = freeId,
                experience = ExperienceStatusDto(totalXp = 100, level = 2),
            ),
        )
        viewModel.refresh()
        advanceUntilIdle()

        // Watching XP fall is the one outcome the progression system forbids.
        val after = viewModel.uiState.value.experience!!
        assertEquals(peak.totalXp, after.totalXp)
        assertTrue(after.level >= peak.level)
        assertEquals(2, repository.refreshCalls)
    }
}
