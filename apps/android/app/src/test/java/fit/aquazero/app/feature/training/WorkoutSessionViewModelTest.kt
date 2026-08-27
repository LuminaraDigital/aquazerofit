package fit.aquazero.app.feature.training

import androidx.lifecycle.SavedStateHandle
import fit.aquazero.app.core.data.PlansRepository
import fit.aquazero.app.core.model.SessionExerciseDto
import fit.aquazero.app.core.model.TodayWorkoutEnvelopeDto
import fit.aquazero.app.core.model.WorkoutSessionDto
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class WorkoutSessionViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    private val session = WorkoutSessionDto(
        id = SESSION_ID,
        userId = "u1",
        focus = "Upper body",
        localDate = "2026-08-27",
        exercises = listOf(
            SessionExerciseDto(
                exerciseId = "ex_bench",
                name = "Barbell bench press",
                setsPlanned = 2,
                reps = 8,
                restSeconds = 90,
                targetWeightKg = 40.0,
                targetReps = 8,
                targetRir = 2.0,
            ),
            SessionExerciseDto(
                exerciseId = "ex_row",
                name = "Bent-over row",
                setsPlanned = 1,
                reps = 10,
                restSeconds = 60,
                targetWeightKg = 35.0,
            ),
        ),
    )

    private lateinit var dao: FakeTrainingDao
    private lateinit var plansApi: FakePlansApi
    private lateinit var workoutsApi: FakeWorkoutsApi
    private lateinit var repository: PlansRepository

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
        dao = FakeTrainingDao()
        plansApi = FakePlansApi()
        workoutsApi = FakeWorkoutsApi(TodayWorkoutEnvelopeDto(session = session))
        repository = PlansRepository(plansApi, workoutsApi, dao)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun viewModel(handle: SavedStateHandle = SavedStateHandle()) =
        WorkoutSessionViewModel(repository, handle).also { it.clock = { FIXED_NOW } }

    @Test
    fun `resolves targets from the session when the server sends no resolved document`() =
        runTest(dispatcher) {
            val vm = viewModel()
            vm.start(SESSION_ID)
            advanceUntilIdle()

            val state = vm.uiState.value
            assertEquals(2, state.entries.size)
            assertEquals(3, state.totalSets)
            assertEquals(40.0, state.entries.first().weightKg!!, 1e-9)
            assertEquals(
                "2 × 8 @ 40 kg • RiR 2 • 90s rest",
                TrainingFormat.targetLine(state.entries.first()),
            )
        }

    @Test
    fun `starting prefills the actuals from the resolved targets`() = runTest(dispatcher) {
        val vm = viewModel()
        vm.start(SESSION_ID)
        advanceUntilIdle()

        vm.startSession()

        val state = vm.uiState.value
        assertEquals(SessionPhase.WORK, state.phase)
        assertEquals("40", state.actual.weightKg)
        assertEquals("8", state.actual.reps)
        assertEquals("2", state.actual.rir)
    }

    @Test
    fun `completing a set banks it and enters rest`() = runTest(dispatcher) {
        val vm = viewModel()
        vm.start(SESSION_ID)
        advanceUntilIdle()
        vm.startSession()

        vm.completeSet()

        val state = vm.uiState.value
        assertEquals(SessionPhase.REST, state.phase)
        assertEquals(1, state.completedSets)
        assertEquals(90, state.restTotalSeconds)
        assertEquals(1, state.setLogs.first().size)
        assertEquals(8, state.setLogs.first().first().reps)
        assertEquals(40.0, state.setLogs.first().first().weightKg!!, 1e-9)
    }

    @Test
    fun `finishing the last exercise opens the summary`() = runTest(dispatcher) {
        val vm = viewModel()
        vm.start(SESSION_ID)
        advanceUntilIdle()
        vm.startSession()

        vm.completeSet()
        vm.skipRest()
        vm.completeSet() // second (final) set of exercise 1 → advance
        assertEquals(1, vm.uiState.value.exerciseIndex)

        vm.completeSet() // only set of exercise 2 → summary

        val state = vm.uiState.value
        assertEquals(SessionPhase.SUMMARY, state.phase)
        assertEquals(3, state.completedSets)
    }

    @Test
    fun `skipping an exercise marks it skipped without counting sets against the user`() =
        runTest(dispatcher) {
            val vm = viewModel()
            vm.start(SESSION_ID)
            advanceUntilIdle()
            vm.startSession()

            vm.skipExercise()

            val state = vm.uiState.value
            assertTrue(state.skipped.first())
            assertEquals(0, state.setsDone.first())
            assertEquals(1, state.exerciseIndex)
        }

    @Test
    fun `summary steppers stay inside sensible bounds and trim orphaned logs`() =
        runTest(dispatcher) {
            val vm = viewModel()
            vm.start(SESSION_ID)
            advanceUntilIdle()
            vm.startSession()
            vm.completeSet()

            vm.decrementSets(0)
            assertEquals(0, vm.uiState.value.setsDone.first())
            assertTrue(vm.uiState.value.setLogs.first().isEmpty())

            vm.decrementSets(0)
            assertEquals(0, vm.uiState.value.setsDone.first())

            vm.incrementSets(0)
            assertEquals(1, vm.uiState.value.setsDone.first())
        }

    /**
     * The headline upgrade over the web client: a process kill mid-workout
     * must lose nothing. A brand-new ViewModel handed the same
     * [SavedStateHandle] resumes on the same exercise with the same banked
     * sets and actuals.
     */
    @Test
    fun `session state survives process death via SavedStateHandle`() = runTest(dispatcher) {
        val handle = SavedStateHandle()
        val first = viewModel(handle)
        first.start(SESSION_ID)
        advanceUntilIdle()
        first.startSession()
        first.completeSet()
        first.skipRest()
        first.completeSet() // finishes exercise 1, moves to exercise 2
        advanceUntilIdle()

        assertEquals(1, first.uiState.value.exerciseIndex)
        assertEquals(2, first.uiState.value.completedSets)
        assertNotNull(handle.get<String>(WorkoutSessionViewModel.KEY_DRAFT))

        // --- process death: same saved state, brand-new ViewModel ---
        val revived = viewModel(handle)
        revived.start(SESSION_ID)
        advanceUntilIdle()

        val restored = revived.uiState.value
        assertTrue(restored.restoredFromDraft)
        assertEquals(SessionPhase.WORK, restored.phase)
        assertEquals(1, restored.exerciseIndex)
        assertEquals(2, restored.completedSets)
        assertEquals(listOf(2, 0), restored.setsDone)
        assertEquals(2, restored.setLogs.first().size)
        assertNotNull(restored.announcement)
    }

    /**
     * Colder failure mode: the task itself was reaped, so SavedStateHandle is
     * empty. The Room session draft written on every transition still brings
     * the session back.
     */
    @Test
    fun `session state survives a cold start via the Room draft`() = runTest(dispatcher) {
        val first = viewModel()
        first.start(SESSION_ID)
        advanceUntilIdle()
        first.startSession()
        first.completeSet()
        advanceUntilIdle()

        assertNotNull(dao.sessions[SESSION_ID]?.draftSetLogsJson)

        val revived = viewModel(SavedStateHandle())
        revived.start(SESSION_ID)
        advanceUntilIdle()

        val restored = revived.uiState.value
        assertTrue(restored.restoredFromDraft)
        assertEquals(1, restored.completedSets)
        assertEquals(0, restored.exerciseIndex)
    }

    @Test
    fun `an untouched overview is not treated as a resumable draft`() = runTest(dispatcher) {
        val handle = SavedStateHandle()
        val first = viewModel(handle)
        first.start(SESSION_ID)
        advanceUntilIdle()

        val revived = viewModel(handle)
        revived.start(SESSION_ID)
        advanceUntilIdle()

        assertFalse(revived.uiState.value.restoredFromDraft)
        assertEquals(SessionPhase.OVERVIEW, revived.uiState.value.phase)
    }

    @Test
    fun `completion submits per-exercise actuals and clears the saved draft`() =
        runTest(dispatcher) {
            val handle = SavedStateHandle()
            val vm = viewModel(handle)
            vm.start(SESSION_ID)
            advanceUntilIdle()
            vm.startSession()
            vm.completeSet()
            vm.skipRest()
            vm.completeSet()
            vm.completeSet()
            advanceUntilIdle()

            vm.completeWorkout()
            advanceUntilIdle()

            val request = workoutsApi.lastCompleteRequest
            assertNotNull(request)
            assertEquals(2, request!!.exercises.size)
            assertEquals(2, request.exercises[0].setsCompleted)
            assertEquals(2, request.exercises[0].setLogs?.size)
            assertEquals(40.0, request.exercises[0].weightKg!!, 1e-9)
            assertEquals(1, request.exercises[1].setsCompleted)
            assertEquals(null, handle.get<String>(WorkoutSessionViewModel.KEY_DRAFT))
        }

    @Test
    fun `an offline completion keeps the session intact`() = runTest(dispatcher) {
        val handle = SavedStateHandle()
        workoutsApi.completeFailsOffline = true
        val vm = viewModel(handle)
        vm.start(SESSION_ID)
        advanceUntilIdle()
        vm.startSession()
        vm.completeSet()
        advanceUntilIdle()

        vm.completeWorkout()
        advanceUntilIdle()

        assertFalse(vm.uiState.value.completing)
        assertEquals(1, vm.uiState.value.completedSets)
        assertNotNull(handle.get<String>(WorkoutSessionViewModel.KEY_DRAFT))
    }

    private companion object {
        const val SESSION_ID = "session-1"
        const val FIXED_NOW = 1_756_000_000_000L
    }
}
