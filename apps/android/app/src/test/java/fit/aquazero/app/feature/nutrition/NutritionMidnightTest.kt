package fit.aquazero.app.feature.nutrition

import fit.aquazero.app.core.model.FoodDto
import fit.aquazero.app.core.model.FoodNutrientsDto
import fit.aquazero.app.core.model.FoodServingDto
import fit.aquazero.app.core.model.MealType
import fit.aquazero.app.feature.MutableClock
import kotlinx.coroutines.Dispatchers
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
import java.time.Duration
import java.time.Instant
import java.time.ZoneId

/** Two days before the screen is opened, for the "browsing history" case. */
private const val EARLIER_DAY = "2026-08-25"

/** The day the nutrition screen is opened on. */
private const val OPENED_DAY = "2026-08-27"

/** The day it is still open on ten minutes later. */
private const val NEXT_DAY = "2026-08-28"

/**
 * The nutrition day view across midnight.
 *
 * Two failures used to hide behind one cached string. A log made after the
 * boundary was filed against the day the screen was opened on, and — worse,
 * because the user could not work around it — the forward arrow and the
 * calendar both refused to reach the day that had just started, since they
 * compared against the same stale value. Both are covered here.
 */
class NutritionMidnightTest {

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
    fun `a meal logged after midnight is filed against the new day`() = runTest(dispatcher) {
        val clock = tenToMidnight()
        val data = FakeNutritionData()
        val viewModel = NutritionViewModel(data, clock)
        advanceUntilIdle()

        viewModel.openFoodSearch(MealType.SNACK)
        viewModel.selectFood(chicken)
        advanceUntilIdle()

        clock.advance(Duration.ofMinutes(15))
        viewModel.confirmAddFood()
        advanceUntilIdle()

        assertEquals(NEXT_DAY, data.loggedMeals.single().third)
        assertEquals(NEXT_DAY, viewModel.uiState.value.selectedDate)
    }

    @Test
    fun `water tapped after midnight is filed against the new day`() = runTest(dispatcher) {
        val clock = tenToMidnight()
        val data = FakeNutritionData()
        val viewModel = NutritionViewModel(data, clock)
        advanceUntilIdle()

        clock.advance(Duration.ofMinutes(15))
        viewModel.logWater()
        advanceUntilIdle()

        assertEquals(
            listOf(NutritionViewModel.WATER_INCREMENT_ML to NEXT_DAY),
            data.loggedWater,
        )
    }

    @Test
    fun `after midnight the forward arrow reaches the day that just started`() =
        runTest(dispatcher) {
            val clock = tenToMidnight()
            val viewModel = NutritionViewModel(FakeNutritionData(), clock)
            advanceUntilIdle()
            assertEquals(OPENED_DAY, viewModel.uiState.value.selectedDate)

            clock.advance(Duration.ofMinutes(15))
            viewModel.shiftDay(1)
            advanceUntilIdle()

            assertEquals(NEXT_DAY, viewModel.uiState.value.selectedDate)
            assertEquals(NEXT_DAY, viewModel.uiState.value.today)
            assertTrue(viewModel.uiState.value.isToday)
        }

    @Test
    fun `after midnight the calendar accepts the day that just started`() = runTest(dispatcher) {
        val clock = tenToMidnight()
        val viewModel = NutritionViewModel(FakeNutritionData(), clock)
        advanceUntilIdle()

        clock.advance(Duration.ofMinutes(15))
        viewModel.selectDate(NEXT_DAY)
        advanceUntilIdle()

        assertEquals(NEXT_DAY, viewModel.uiState.value.selectedDate)
        assertTrue(viewModel.uiState.value.isToday)
    }

    @Test
    fun `a resume after midnight carries the day view onto the new day`() = runTest(dispatcher) {
        val clock = tenToMidnight()
        val data = FakeNutritionData()
        val viewModel = NutritionViewModel(data, clock)
        advanceUntilIdle()
        assertEquals(listOf(OPENED_DAY), data.refreshedDays)

        clock.advance(Duration.ofMinutes(15))
        viewModel.onResumed()
        advanceUntilIdle()

        assertEquals(listOf(OPENED_DAY, NEXT_DAY), data.refreshedDays)
        assertEquals(NEXT_DAY, viewModel.uiState.value.selectedDate)
    }

    @Test
    fun `a resume while browsing history leaves the chosen day alone`() = runTest(dispatcher) {
        val clock = tenToMidnight()
        val data = FakeNutritionData()
        val viewModel = NutritionViewModel(data, clock)
        advanceUntilIdle()
        viewModel.selectDate(EARLIER_DAY)
        advanceUntilIdle()

        clock.advance(Duration.ofMinutes(15))
        viewModel.onResumed()
        advanceUntilIdle()

        // The day the user chose is theirs to keep; only the cap moves.
        assertEquals(EARLIER_DAY, viewModel.uiState.value.selectedDate)
        assertEquals(NEXT_DAY, viewModel.uiState.value.today)
        assertFalse(viewModel.uiState.value.isToday)
        assertEquals(listOf(OPENED_DAY, EARLIER_DAY), data.refreshedDays)
    }

    /** Ten minutes before the boundary, so a quarter of an hour crosses it. */
    private fun tenToMidnight() = MutableClock(
        Instant.parse("${OPENED_DAY}T23:50:00Z"),
        ZoneId.of("UTC"),
    )

    private val chicken = FoodDto(
        id = "f-chicken",
        name = "Chicken breast, raw",
        category = "Poultry",
        per100g = FoodNutrientsDto(
            kcal = 120.0,
            proteinG = 22.5,
            carbsG = 0.0,
            fatG = 2.6,
        ),
        commonServings = listOf(FoodServingDto("Fillet", 150.0)),
    )
}
