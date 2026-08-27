package fit.aquazero.app.feature.nutrition

import fit.aquazero.app.core.common.LocalDates
import fit.aquazero.app.core.database.MealLogEntity
import fit.aquazero.app.core.database.SyncState
import fit.aquazero.app.core.model.ApiResult
import fit.aquazero.app.core.model.ConsumedTargetDto
import fit.aquazero.app.core.model.DailyNutritionDto
import fit.aquazero.app.core.model.FoodDto
import fit.aquazero.app.core.model.FoodNutrientsDto
import fit.aquazero.app.core.model.FoodServingDto
import fit.aquazero.app.core.model.MealLogItemDto
import fit.aquazero.app.core.model.MealType
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
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class NutritionViewModelTest {

    private val dispatcher = StandardTestDispatcher()
    private val today = LocalDates.today()
    private val yesterday = LocalDates.shift(today, -1)
    private val tomorrow = LocalDates.shift(today, 1)

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `logs are grouped by meal type and micronutrients are summed`() = runTest(dispatcher) {
        val data = FakeNutritionData().apply {
            mealsByDate.value = mapOf(
                today to listOf(
                    mealLog(
                        localId = "1",
                        mealType = "breakfast",
                        items = listOf(
                            item("Porridge", grams = 80.0, kcal = 300.0, fiberG = 6.0, sodiumMg = 12.0),
                        ),
                    ),
                    mealLog(
                        localId = "2",
                        mealType = "lunch",
                        items = listOf(
                            item("Chicken", grams = 150.0, kcal = 240.0, fiberG = 0.0, sodiumMg = 98.0),
                        ),
                    ),
                ),
            )
        }
        val viewModel = NutritionViewModel(data)
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals(1, state.meals[MealType.BREAKFAST]?.size)
        assertEquals(1, state.meals[MealType.LUNCH]?.size)
        assertEquals(2, state.loggedCount)
        assertEquals(6.0, state.micronutrients.fiberG, 0.001)
        assertEquals(110, state.micronutrients.sodiumMg)
    }

    @Test
    fun `the day switcher never runs past today`() = runTest(dispatcher) {
        val viewModel = NutritionViewModel(FakeNutritionData())
        advanceUntilIdle()

        viewModel.shiftDay(1)
        advanceUntilIdle()
        assertEquals(today, viewModel.uiState.value.selectedDate)

        viewModel.selectDate(tomorrow)
        advanceUntilIdle()
        assertEquals(today, viewModel.uiState.value.selectedDate)

        viewModel.shiftDay(-1)
        advanceUntilIdle()
        assertEquals(yesterday, viewModel.uiState.value.selectedDate)
        assertTrue(!viewModel.uiState.value.isToday)
    }

    @Test
    fun `changing day refreshes that day from the server`() = runTest(dispatcher) {
        val data = FakeNutritionData()
        val viewModel = NutritionViewModel(data)
        advanceUntilIdle()

        viewModel.selectDate(yesterday)
        advanceUntilIdle()

        assertEquals(listOf(today, yesterday), data.refreshedDays)
    }

    @Test
    fun `a failed refresh keeps cached content instead of erroring`() = runTest(dispatcher) {
        val data = FakeNutritionData().apply {
            mealsByDate.value = mapOf(
                today to listOf(mealLog(localId = "1", mealType = "dinner", items = emptyList())),
            )
        }
        val viewModel = NutritionViewModel(data)
        advanceUntilIdle()

        assertEquals(NutritionPhase.Ready, viewModel.uiState.value.phase)
    }

    @Test
    fun `a failed refresh on an untouched day shows the error state`() = runTest(dispatcher) {
        val viewModel = NutritionViewModel(FakeNutritionData())
        advanceUntilIdle()

        assertEquals(NutritionPhase.Error, viewModel.uiState.value.phase)
    }

    @Test
    fun `the server water total is merged, never added, to the local total`() = runTest(dispatcher) {
        val data = FakeNutritionData().apply {
            nutritionByDate.value = mapOf(
                today to FakeNutritionData.EMPTY_DAY.copy(waterConsumedMl = 500, kcalTarget = 2000.0),
            )
            dayResult = ApiResult.Success(
                DailyNutritionDto(
                    date = "2026-08-27",
                    waterMl = ConsumedTargetDto(consumed = 1250.0, target = 2000.0),
                ),
            )
        }
        val viewModel = NutritionViewModel(data)
        advanceUntilIdle()

        assertEquals(1250, viewModel.uiState.value.waterConsumedMl)
    }

    @Test
    fun `the food search debounces and only fires from two characters`() = runTest(dispatcher) {
        val data = FakeNutritionData().apply { searchResults = listOf(chicken) }
        val viewModel = NutritionViewModel(data)
        advanceUntilIdle()

        viewModel.openFoodSearch(MealType.LUNCH)
        viewModel.onSearchTermChange("c")
        advanceUntilIdle()
        assertTrue(data.searchedTerms.isEmpty())

        viewModel.onSearchTermChange("chick")
        advanceUntilIdle()
        assertEquals(listOf("chick"), data.searchedTerms)
        assertEquals(listOf(chicken), viewModel.uiState.value.foodSearch?.results)
    }

    @Test
    fun `portion maths are computed from per-100g values, not estimated`() = runTest(dispatcher) {
        val viewModel = NutritionViewModel(FakeNutritionData())
        advanceUntilIdle()

        viewModel.openFoodSearch(MealType.LUNCH)
        viewModel.selectFood(chicken)
        advanceUntilIdle()

        // Seeds from the first common serving.
        assertEquals(150, viewModel.uiState.value.foodSearch?.grams)
        val preview = viewModel.uiState.value.foodSearch?.preview
        assertNotNull(preview)
        assertEquals(180.0, preview!!.kcal, 0.0)
        assertEquals(33.8, preview.proteinG, 0.001)
        assertEquals(3.9, preview.fatG, 0.001)

        viewModel.setGrams(200)
        advanceUntilIdle()
        assertEquals(240.0, viewModel.uiState.value.foodSearch!!.preview!!.kcal, 0.0)
    }

    @Test
    fun `nothing is logged until the add tap, which then closes the sheet`() = runTest(dispatcher) {
        val data = FakeNutritionData()
        val viewModel = NutritionViewModel(data)
        advanceUntilIdle()

        viewModel.openFoodSearch(MealType.DINNER)
        viewModel.selectFood(chicken)
        advanceUntilIdle()
        assertTrue(data.loggedMeals.isEmpty())

        viewModel.confirmAddFood()
        advanceUntilIdle()

        assertEquals(1, data.loggedMeals.size)
        val (mealType, items, date) = data.loggedMeals.single()
        assertEquals(MealType.DINNER, mealType)
        assertEquals(today, date)
        assertEquals(180.0, items.single().kcal, 0.0)
        assertEquals(listOf("f-chicken"), data.touchedFoods)
        assertNull(viewModel.uiState.value.foodSearch)
    }

    @Test
    fun `editing rescales from the original values and never compounds`() = runTest(dispatcher) {
        val original = item("Porridge", grams = 80.0, kcal = 300.0)
        val data = FakeNutritionData().apply {
            mealsByDate.value = mapOf(
                today to listOf(mealLog(localId = "m1", mealType = "breakfast", items = listOf(original))),
            )
        }
        val viewModel = NutritionViewModel(data)
        advanceUntilIdle()

        viewModel.startEditing("m1")
        advanceUntilIdle()

        viewModel.setEditRowGrams(0, 160)
        viewModel.setEditRowGrams(0, 40)
        advanceUntilIdle()

        val row = viewModel.uiState.value.editing!!.rows.single()
        // Anchored to the original 80g/300kcal, so 40g is exactly half.
        assertEquals(80.0, row.original.grams, 0.0)
        assertEquals(150.0, row.current.kcal, 0.0)
    }

    @Test
    fun `the last row of an edited meal cannot be removed`() = runTest(dispatcher) {
        val data = FakeNutritionData().apply {
            mealsByDate.value = mapOf(
                today to listOf(
                    mealLog(
                        localId = "m1",
                        mealType = "lunch",
                        items = listOf(
                            item("Rice", grams = 100.0, kcal = 130.0),
                            item("Beans", grams = 100.0, kcal = 90.0),
                        ),
                    ),
                ),
            )
        }
        val viewModel = NutritionViewModel(data)
        advanceUntilIdle()

        viewModel.startEditing("m1")
        viewModel.removeEditRow(0)
        advanceUntilIdle()
        assertEquals(1, viewModel.uiState.value.editing?.rows?.size)

        viewModel.removeEditRow(0)
        advanceUntilIdle()
        assertEquals(1, viewModel.uiState.value.editing?.rows?.size)
    }

    @Test
    fun `saving an edit sends the current rows through the repository`() = runTest(dispatcher) {
        val data = FakeNutritionData().apply {
            mealsByDate.value = mapOf(
                today to listOf(
                    mealLog(
                        localId = "m1",
                        mealType = "lunch",
                        items = listOf(item("Rice", grams = 100.0, kcal = 130.0)),
                    ),
                ),
            )
        }
        val viewModel = NutritionViewModel(data)
        advanceUntilIdle()

        viewModel.startEditing("m1")
        viewModel.setEditRowGrams(0, 200)
        viewModel.saveEdit()
        advanceUntilIdle()

        val (localId, items) = data.updatedMeals.single()
        assertEquals("m1", localId)
        assertEquals(260.0, items.single().kcal, 0.0)
        assertNull(viewModel.uiState.value.editing)
    }

    @Test
    fun `a failed edit keeps the sheet open so the work is not lost`() = runTest(dispatcher) {
        val data = FakeNutritionData().apply {
            updateThrows = true
            mealsByDate.value = mapOf(
                today to listOf(
                    mealLog(
                        localId = "m1",
                        mealType = "lunch",
                        items = listOf(item("Rice", grams = 100.0, kcal = 130.0)),
                    ),
                ),
            )
        }
        val viewModel = NutritionViewModel(data)
        advanceUntilIdle()

        viewModel.startEditing("m1")
        viewModel.saveEdit()
        advanceUntilIdle()

        assertNotNull(viewModel.uiState.value.editing)
        assertTrue(viewModel.uiState.value.editing?.saving == false)
    }

    @Test
    fun `delete goes through the repository and is acknowledged`() = runTest(dispatcher) {
        val data = FakeNutritionData()
        val viewModel = NutritionViewModel(data)
        advanceUntilIdle()
        val events = viewModel.collectEvents(this)
        advanceUntilIdle()

        viewModel.deleteMeal("m1")
        advanceUntilIdle()

        assertEquals(listOf("m1"), data.deletedMeals)
        assertEquals(1, events.size)
    }

    @Test
    fun `copy-previous copies yesterday into the selected day`() = runTest(dispatcher) {
        val data = FakeNutritionData().apply { copyCount = 3 }
        val viewModel = NutritionViewModel(data)
        advanceUntilIdle()
        val events = viewModel.collectEvents(this)
        advanceUntilIdle()

        viewModel.copyPreviousDay()
        advanceUntilIdle()

        assertEquals(listOf(yesterday to today), data.copiedDays)
        assertTrue(!viewModel.uiState.value.copying)
        assertEquals(1, events.size)
    }

    @Test
    fun `copy-previous with nothing to copy says so plainly`() = runTest(dispatcher) {
        val data = FakeNutritionData().apply { copyCount = 0 }
        val viewModel = NutritionViewModel(data)
        advanceUntilIdle()
        val events = viewModel.collectEvents(this)
        advanceUntilIdle()

        viewModel.copyPreviousDay()
        advanceUntilIdle()

        assertEquals(1, events.size)
        assertTrue(!viewModel.uiState.value.copying)
    }

    @Test
    fun `water logs against the selected day, not always today`() = runTest(dispatcher) {
        val data = FakeNutritionData()
        val viewModel = NutritionViewModel(data)
        advanceUntilIdle()

        viewModel.selectDate(yesterday)
        advanceUntilIdle()
        viewModel.logWater()
        advanceUntilIdle()

        assertEquals(listOf(NutritionViewModel.WATER_INCREMENT_ML to yesterday), data.loggedWater)
    }

    @Test
    fun `a pending row is badged, never silently shown as synced`() = runTest(dispatcher) {
        val data = FakeNutritionData().apply {
            mealsByDate.value = mapOf(
                today to listOf(
                    mealLog(
                        localId = "m1",
                        mealType = "snack",
                        items = listOf(item("Apple", grams = 120.0, kcal = 62.0)),
                        syncState = SyncState.FAILED,
                    ),
                ),
            )
        }
        val viewModel = NutritionViewModel(data)
        advanceUntilIdle()

        assertEquals(
            MealSyncBadge.Failed,
            viewModel.uiState.value.meals[MealType.SNACK]?.single()?.badge,
        )
    }

    // ----- fixtures -----

    private fun mealLog(
        localId: String,
        mealType: String,
        items: List<MealLogItemDto>,
        syncState: SyncState = SyncState.SYNCED,
    ) = MealLogEntity(
        localId = localId,
        mealType = mealType,
        items = items,
        totalKcal = items.sumOf { it.kcal },
        totalProteinG = items.sumOf { it.proteinG },
        totalCarbsG = items.sumOf { it.carbsG },
        totalFatG = items.sumOf { it.fatG },
        source = "manual",
        loggedAt = "2026-08-27T08:00:00Z",
        localDate = today,
        syncState = syncState,
        idempotencyKey = "k-$localId",
    )

    private fun item(
        name: String,
        grams: Double,
        kcal: Double,
        proteinG: Double = 0.0,
        carbsG: Double = 0.0,
        fatG: Double = 0.0,
        fiberG: Double? = null,
        sodiumMg: Double? = null,
    ) = MealLogItemDto(
        name = name,
        grams = grams,
        kcal = kcal,
        proteinG = proteinG,
        carbsG = carbsG,
        fatG = fatG,
        fiberG = fiberG,
        sodiumMg = sodiumMg,
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

/**
 * Subscribe before acting: the event flow has no replay, by design, so the
 * collector is started undispatched to guarantee it is registered first.
 */
private fun NutritionViewModel.collectEvents(scope: TestScope): List<NutritionEvent> {
    val received = mutableListOf<NutritionEvent>()
    scope.backgroundScope.launch(UnconfinedTestDispatcher(scope.testScheduler)) {
        events.collect { received += it }
    }
    return received
}
