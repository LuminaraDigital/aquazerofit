package fit.aquazero.app

import fit.aquazero.app.core.designsystem.AzfTab
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * System Back on the authed shell: a root tab returns to Home, and a screen
 * pushed above a tab pops before that happens.
 */
class ShellBackTest {

    @Test
    fun `back from home leaves the app`() {
        assertEquals(ShellBack.Leave, shellBack(tabRootStack(AzfTab.Home)))
        assertEquals(ShellBack.Leave, shellBack(emptyList()))
    }

    @Test
    fun `workouts nutrition coach and progress sit on home so back pops to it`() {
        listOf(
            AzfTab.Workouts to WorkoutLibraryKey,
            AzfTab.Nutrition to NutritionKey,
            AzfTab.Coach to CoachKey,
            AzfTab.Progress to ProgressKey,
        ).forEach { (tab, key) ->
            val stack = tabRootStack(tab)
            assertEquals(listOf(DashboardKey, key), stack)
            assertEquals(ShellBack.Pop, shellBack(stack))
            assertEquals(listOf(DashboardKey), stack.dropLast(1))
        }
    }

    @Test
    fun `a lone non-home tab selects home instead of leaving`() {
        listOf(WorkoutLibraryKey, NutritionKey, CoachKey, ProgressKey).forEach { key ->
            assertEquals(ShellBack.SelectHome, shellBack(listOf(key)))
        }
    }

    @Test
    fun `a screen above a tab pops before home`() {
        val aboveWorkouts = tabRootStack(AzfTab.Workouts) + SettingsKey
        assertEquals(ShellBack.Pop, shellBack(aboveWorkouts))
        val afterPop = aboveWorkouts.dropLast(1)
        assertEquals(WorkoutLibraryKey, afterPop.last())
        assertEquals(ShellBack.Pop, shellBack(afterPop))
        assertEquals(listOf(DashboardKey), afterPop.dropLast(1))

        assertEquals(ShellBack.Pop, shellBack(listOf(CoachKey, CoachSelectKey)))
        assertEquals(
            ShellBack.Pop,
            shellBack(listOf(NutritionKey, MealPlanKey, RecipeDetailKey("recipe-1"))),
        )
    }
}
