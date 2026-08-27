package fit.aquazero.app.feature.dashboard

import fit.aquazero.app.core.common.LocalDailyNutrition
import fit.aquazero.app.core.database.UserEntity
import fit.aquazero.app.core.designsystem.ToastKind
import fit.aquazero.app.core.network.ApiResult
import fit.aquazero.app.core.network.dto.AchievementDefinitionDto
import fit.aquazero.app.core.network.dto.AchievementStatusDto
import fit.aquazero.app.core.network.dto.ConsumedTargetDto
import fit.aquazero.app.core.network.dto.DailyNutritionDto
import fit.aquazero.app.core.network.dto.MealLogDto
import fit.aquazero.app.core.network.dto.MealRecommendationDto
import fit.aquazero.app.core.network.dto.MealType
import fit.aquazero.app.core.network.dto.ProgressSummaryDto
import fit.aquazero.app.core.network.dto.TodayWorkoutEnvelopeDto
import fit.aquazero.app.core.network.dto.WorkoutSessionDto
import fit.aquazero.app.core.network.dto.WorkoutSessionStatus
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class DashboardViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `successful refresh publishes the day and the server water total`() = runTest(dispatcher) {
        val data = FakeDashboardData().apply {
            nutritionFlow.value = day(consumed = 1800.0, target = 2400.0, waterMl = 500)
            dayResult = ApiResult.Success(
                DailyNutritionDto(
                    date = "2026-08-27",
                    kcalBurned = 320.0,
                    waterMl = ConsumedTargetDto(consumed = 1250.0, target = 2000.0),
                ),
            )
        }
        val viewModel = DashboardViewModel(data)
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals(DashboardPhase.Ready, state.phase)
        assertEquals(1800.0, state.nutrition!!.kcalConsumed, 0.0)
        assertEquals(320.0, state.kcalBurned, 0.0)
        // The server total wins because every local millilitre is inside it.
        assertEquals(1250, state.waterConsumedMl)
    }

    @Test
    fun `a failed refresh with no local content shows the error state`() = runTest(dispatcher) {
        val data = FakeDashboardData()
        val viewModel = DashboardViewModel(data)
        advanceUntilIdle()

        assertEquals(DashboardPhase.Error, viewModel.uiState.value.phase)
    }

    @Test
    fun `a failed refresh keeps offline content on screen`() = runTest(dispatcher) {
        val data = FakeDashboardData().apply {
            nutritionFlow.value = day(consumed = 900.0, target = 2200.0, waterMl = 750)
        }
        val viewModel = DashboardViewModel(data)
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals(DashboardPhase.Ready, state.phase)
        assertTrue(state.hasContent)
    }

    @Test
    fun `water tap logs 250 ml and announces it`() = runTest(dispatcher) {
        val data = FakeDashboardData()
        val viewModel = DashboardViewModel(data)
        advanceUntilIdle()
        val events = viewModel.collectEvents(this)
        advanceUntilIdle()

        viewModel.logWater()
        advanceUntilIdle()

        assertEquals(listOf(DashboardViewModel.WATER_INCREMENT_ML), data.loggedWater.map { it.first })
        assertTrue(events.single() is DashboardEvent.Message)
        assertEquals(ToastKind.Success, (events.single() as DashboardEvent.Message).kind)
        assertTrue(!viewModel.uiState.value.waterPending)
    }

    @Test
    fun `a failed water write rolls the optimistic total back and says so`() = runTest(dispatcher) {
        val data = FakeDashboardData().apply {
            dayResult = ApiResult.Success(
                DailyNutritionDto(
                    date = "2026-08-27",
                    waterMl = ConsumedTargetDto(consumed = 1000.0, target = 2000.0),
                ),
            )
            logWaterThrows = true
        }
        val viewModel = DashboardViewModel(data)
        advanceUntilIdle()
        val events = viewModel.collectEvents(this)
        advanceUntilIdle()

        viewModel.logWater()
        advanceUntilIdle()

        assertEquals(1000, viewModel.uiState.value.serverWaterMl)
        assertTrue(!viewModel.uiState.value.waterPending)
        assertEquals(ToastKind.Error, (events.single() as DashboardEvent.Message).kind)
    }

    @Test
    fun `an offline suggestion degrades instead of erroring the screen`() = runTest(dispatcher) {
        val data = FakeDashboardData()
        val viewModel = DashboardViewModel(data)
        advanceUntilIdle()
        val events = viewModel.collectEvents(this)
        advanceUntilIdle()

        viewModel.suggestMeal()
        advanceUntilIdle()

        assertEquals(SuggestionPhase.Unavailable, viewModel.uiState.value.suggestionPhase)
        assertNull(viewModel.uiState.value.suggestion)
        assertEquals(ToastKind.Info, (events.single() as DashboardEvent.Message).kind)
    }

    @Test
    fun `a suggestion is never logged until the explicit tap`() = runTest(dispatcher) {
        val data = FakeDashboardData().apply {
            suggestResult = ApiResult.Success(
                MealRecommendationDto(
                    id = "r1",
                    name = "Yoghurt bowl",
                    mealType = MealType.SNACK,
                    kcal = 420.0,
                    proteinG = 31.0,
                    carbsG = 38.0,
                    fatG = 16.0,
                    rationale = "Closes the protein gap.",
                ),
            )
            logRecommendationResult = ApiResult.Success(
                MealLogDto(
                    id = "m1",
                    userId = "u1",
                    mealType = MealType.SNACK,
                    loggedAt = "2026-08-27T10:00:00Z",
                    localDate = "2026-08-27",
                ),
            )
        }
        val viewModel = DashboardViewModel(data)
        advanceUntilIdle()

        viewModel.suggestMeal()
        advanceUntilIdle()
        assertEquals("Yoghurt bowl", viewModel.uiState.value.suggestion?.name)
        assertTrue(viewModel.uiState.value.suggestion?.logged == false)

        viewModel.logSuggestion()
        advanceUntilIdle()
        assertTrue(viewModel.uiState.value.suggestion?.logged == true)
    }

    @Test
    fun `a planned session maps into the workout card`() = runTest(dispatcher) {
        val data = FakeDashboardData().apply {
            workoutResult = ApiResult.Success(
                TodayWorkoutEnvelopeDto(
                    rest = false,
                    focus = "Upper body push",
                    session = WorkoutSessionDto(
                        id = "s1",
                        userId = "u1",
                        focus = "Upper body push",
                        status = WorkoutSessionStatus.PENDING,
                        durationMinutes = 42,
                        kcalBurned = 310.0,
                        localDate = "2026-08-27",
                    ),
                ),
            )
        }
        val viewModel = DashboardViewModel(data)
        advanceUntilIdle()

        val workout = viewModel.uiState.value.workout
        assertEquals("s1", workout?.sessionId)
        assertEquals(42, workout?.durationMinutes)
        assertTrue(workout?.rest == false)
        assertTrue(!viewModel.uiState.value.workoutLoading)
    }

    @Test
    fun `a rest day renders as rest, not as a missing workout`() = runTest(dispatcher) {
        val viewModel = DashboardViewModel(FakeDashboardData())
        advanceUntilIdle()

        assertTrue(viewModel.uiState.value.workout?.rest == true)
    }

    @Test
    fun `the achievements strip keeps four tiles and their earned flags`() = runTest(dispatcher) {
        val data = FakeDashboardData()
        val viewModel = DashboardViewModel(data)
        advanceUntilIdle()

        data.summaryFlow.value = ProgressSummaryDto(
            currentWeightKg = 81.2,
            achievements = (1..6).map { index ->
                AchievementStatusDto(
                    definition = AchievementDefinitionDto(id = "a$index", name = "Badge $index"),
                    earnedAt = if (index % 2 == 0) "2026-08-01" else null,
                )
            },
        )
        advanceUntilIdle()

        val achievements = viewModel.uiState.value.achievements
        assertEquals(DashboardViewModel.MAX_ACHIEVEMENTS, achievements.size)
        assertEquals(listOf(false, true, false, true), achievements.map { it.earned })
        assertEquals(81.2, viewModel.uiState.value.currentWeightKg!!, 0.0)
    }

    @Test
    fun `the greeting uses the first name only`() = runTest(dispatcher) {
        val data = FakeDashboardData()
        val viewModel = DashboardViewModel(data)
        advanceUntilIdle()

        data.userFlow.value = UserEntity(
            id = "u1",
            email = "ada@aquazero.fit",
            displayName = "Ada Lovelace",
            role = "user",
            tier = "free",
            emailVerified = true,
            hasProfile = true,
            timezone = "UTC",
            createdAt = "2026-01-01T00:00:00Z",
            updatedAtMs = 0,
        )
        advanceUntilIdle()

        assertEquals("Ada", viewModel.uiState.value.firstName)
    }

    @Test
    fun `the weight sparkline keeps the last fourteen weigh-ins`() = runTest(dispatcher) {
        val data = FakeDashboardData()
        val viewModel = DashboardViewModel(data)
        advanceUntilIdle()

        data.weightFlow.value = (1..20).map { 80.0 + it }
        advanceUntilIdle()

        val series = viewModel.uiState.value.weightSeries
        assertEquals(DashboardViewModel.WEIGHT_WINDOW, series.size)
        assertEquals(100.0, series.last(), 0.0)
    }
}

/**
 * Subscribe before acting: the event flow has no replay, by design, so the
 * collector is started undispatched to guarantee it is registered first.
 */
private fun DashboardViewModel.collectEvents(scope: TestScope): List<DashboardEvent> {
    val received = mutableListOf<DashboardEvent>()
    scope.backgroundScope.launch(UnconfinedTestDispatcher(scope.testScheduler)) {
        events.collect { received += it }
    }
    return received
}

private fun day(consumed: Double, target: Double, waterMl: Int) = LocalDailyNutrition(
    kcalTarget = target,
    kcalConsumed = consumed,
    kcalRemaining = target - consumed,
    proteinConsumed = 60.0,
    proteinTarget = 140.0,
    carbsConsumed = 120.0,
    carbsTarget = 220.0,
    fatConsumed = 30.0,
    fatTarget = 70.0,
    waterConsumedMl = waterMl,
    waterTargetMl = 2000,
)
