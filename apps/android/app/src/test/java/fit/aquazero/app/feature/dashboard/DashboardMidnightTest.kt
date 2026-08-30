package fit.aquazero.app.feature.dashboard

import fit.aquazero.app.core.common.LocalDailyNutrition
import fit.aquazero.app.core.database.UserEntity
import fit.aquazero.app.core.model.ApiResult
import fit.aquazero.app.core.model.DailyNutritionDto
import fit.aquazero.app.core.model.MealLogDto
import fit.aquazero.app.core.model.MealRecommendationDto
import fit.aquazero.app.core.model.MealType
import fit.aquazero.app.core.model.ProgressSummaryDto
import fit.aquazero.app.core.model.TodayWorkoutEnvelopeDto
import fit.aquazero.app.feature.MutableClock
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import java.io.IOException
import java.time.Duration
import java.time.Instant
import java.time.ZoneId

/** The day the dashboard is opened on. */
private const val OPENED_DAY = "2026-08-27"

/** The day it is still open on ten minutes later. */
private const val NEXT_DAY = "2026-08-28"

/**
 * The dashboard across midnight.
 *
 * A dashboard survives backgrounding on the nav back stack, so the day it was
 * constructed on is not the day the user comes back to. These tests hold one
 * instance across the boundary and assert that both halves of the old bug are
 * gone: the write carries the new date, and the screen moves onto it.
 */
class DashboardMidnightTest {

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
    fun `water tapped after midnight is filed against the new day`() = runTest(dispatcher) {
        val clock = tenToMidnight()
        val data = DayKeyedDashboardData()
        val viewModel = DashboardViewModel(data, clock)
        advanceUntilIdle()
        assertEquals(OPENED_DAY, viewModel.uiState.value.today)

        clock.advance(Duration.ofMinutes(15))
        viewModel.logWater()
        advanceUntilIdle()

        assertEquals(
            listOf(DashboardViewModel.WATER_INCREMENT_ML to NEXT_DAY),
            data.loggedWater,
        )
        assertEquals(NEXT_DAY, viewModel.uiState.value.today)
    }

    @Test
    fun `a resume after midnight re-observes and refetches the new day`() = runTest(dispatcher) {
        val clock = tenToMidnight()
        val data = DayKeyedDashboardData()
        val viewModel = DashboardViewModel(data, clock)
        advanceUntilIdle()
        assertEquals(listOf(OPENED_DAY), data.observedDays)
        assertEquals(listOf(OPENED_DAY), data.refreshedDays)

        clock.advance(Duration.ofMinutes(15))
        viewModel.onResumed()
        advanceUntilIdle()

        assertEquals(listOf(OPENED_DAY, NEXT_DAY), data.observedDays)
        assertEquals(listOf(OPENED_DAY, NEXT_DAY), data.refreshedDays)
        assertEquals(NEXT_DAY, viewModel.uiState.value.today)
    }

    @Test
    fun `a resume inside the same day costs nothing`() = runTest(dispatcher) {
        val clock = tenToMidnight()
        val data = DayKeyedDashboardData()
        val viewModel = DashboardViewModel(data, clock)
        advanceUntilIdle()

        clock.advance(Duration.ofMinutes(1))
        viewModel.onResumed()
        advanceUntilIdle()

        assertEquals(listOf(OPENED_DAY), data.refreshedDays)
        assertEquals(OPENED_DAY, viewModel.uiState.value.today)
    }

    /** Ten minutes before the boundary, so a quarter of an hour crosses it. */
    private fun tenToMidnight() = MutableClock(
        Instant.parse("${OPENED_DAY}T23:50:00Z"),
        ZoneId.of("UTC"),
    )
}

/**
 * A [DashboardData] double that records the day each Room read and each fetch
 * was keyed on — the two things a rollover has to move. The house fake keeps
 * one flow for every day, which is exactly what these tests need to tell
 * apart.
 */
private class DayKeyedDashboardData : DashboardData {

    val observedDays = mutableListOf<String>()
    val refreshedDays = mutableListOf<String>()
    val loggedWater = mutableListOf<Pair<Int, String>>()

    private val nutritionFlow = MutableStateFlow(FakeDashboardData.EMPTY_DAY)

    override fun dailyNutrition(localDate: String): Flow<LocalDailyNutrition> {
        observedDays += localDate
        return nutritionFlow
    }

    override fun user(): Flow<UserEntity?> = MutableStateFlow(null)

    override fun progressSummary(): Flow<ProgressSummaryDto?> = MutableStateFlow(null)

    override fun weightSeries(): Flow<List<Double>> = MutableStateFlow(emptyList())

    override suspend fun refreshDay(localDate: String): ApiResult<DailyNutritionDto> {
        refreshedDays += localDate
        return ApiResult.Success(DailyNutritionDto(date = localDate))
    }

    override suspend fun refreshProfile() = Unit

    override suspend fun refreshProgress(): ApiResult<ProgressSummaryDto> =
        ApiResult.Success(ProgressSummaryDto())

    override suspend fun todayWorkout(): ApiResult<TodayWorkoutEnvelopeDto> =
        ApiResult.Success(TodayWorkoutEnvelopeDto(rest = true))

    override suspend fun logWater(amountMl: Int, localDate: String) {
        loggedWater += amountMl to localDate
    }

    override suspend fun suggestMeal(mealType: MealType): ApiResult<MealRecommendationDto> =
        ApiResult.Failure.Network(IOException("offline"))

    override suspend fun logRecommendation(recommendationId: String): ApiResult<MealLogDto> =
        ApiResult.Failure.Network(IOException("offline"))
}
