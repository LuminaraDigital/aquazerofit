package fit.aquazero.app.feature.nutrition

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertWidthIsAtLeast
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import fit.aquazero.app.core.designsystem.AzfTheme
import fit.aquazero.app.core.model.MealType
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

/** Behaviour the nutrition redesign changed: honest error copy, one add control per meal, one confirm. */
class NutritionRedesignTest {

    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun dayErrorIsNeutralAndOffersRetry() {
        var retries = 0
        composeRule.setContent {
            AzfTheme {
                NutritionContent(
                    state = NutritionUiState(
                        today = "2026-11-06",
                        selectedDate = "2026-11-06",
                        phase = NutritionPhase.Error,
                    ),
                    onRetry = { retries++ },
                    onShiftDay = {}, onSelectDate = {}, onOpenCalendar = {}, onCloseCalendar = {},
                    onToggleMicros = {}, onLogWater = {}, onCopyPrevious = {}, onAddFood = {},
                    onCloseFoodSearch = {}, onSearchTermChange = {}, onSelectFood = {},
                    onClearSelectedFood = {}, onGramsChange = {}, onConfirmAddFood = {},
                    onStartEditing = {}, onCancelEditing = {}, onEditRowGrams = { _, _ -> },
                    onRemoveEditRow = {}, onSaveEdit = {}, onDeleteMeal = {}, onCaptureMeal = {},
                    onMealPlan = {}, onScanBarcode = null,
                )
            }
        }

        composeRule.onNodeWithText("WE COULDN'T LOAD THIS DAY").assertIsDisplayed()
        composeRule.onNodeWithText("Try again").performClick()
        assertEquals(1, retries)
    }

    @Test
    fun everyMealHasOneAddControlOfTouchSize() {
        val added = mutableListOf<MealType>()
        composeRule.setContent {
            AzfTheme {
                androidx.compose.foundation.layout.Column {
                    listOf(MealType.BREAKFAST, MealType.LUNCH).forEach { type ->
                        MealSection(
                            mealType = type,
                            logs = emptyList(),
                            onAdd = { added += type },
                            onEdit = {},
                            onDelete = {},
                        )
                    }
                }
            }
        }

        composeRule.onNodeWithContentDescription("Add food to Breakfast")
            .assertWidthIsAtLeast(48.dp)
            .assertHeightIsAtLeast(48.dp)
            .performClick()
        composeRule.onNodeWithContentDescription("Add food to Lunch").performClick()
        assertEquals(listOf(MealType.BREAKFAST, MealType.LUNCH), added)
    }

    @Test
    fun reviewHasASingleConfirmAction() {
        composeRule.setContent {
            AzfTheme {
                AnalysisContent(
                    state = AnalysisUiState(
                        jobId = "j",
                        phase = AnalysisPhase.Review,
                        mealType = MealType.DINNER,
                        seeded = true,
                    ),
                )
            }
        }

        composeRule.onAllNodesWithText("Looks right, log it").assertCountEquals(1)
    }
}
