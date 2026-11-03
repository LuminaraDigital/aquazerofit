package fit.aquazero.app

import androidx.navigation3.runtime.NavKey
import fit.aquazero.app.core.designsystem.AzfTab

/**
 * What system Back should do from the authed shell's back stack.
 *
 * A screen pushed above a tab pops first. A non-home tab with nothing under
 * it selects Home, because a tab switch used to replace the stack with that
 * tab alone and Navigation 3 does not handle Back unless a previous entry
 * exists. Home is the start destination, so Back there leaves the app.
 */
internal enum class ShellBack {
    /** Remove the top entry. */
    Pop,

    /** Replace the stack with Home. */
    SelectHome,

    /** Nothing in the app should consume Back. The activity finishes. */
    Leave,
}

/**
 * Entries for a bottom-tab root.
 *
 * Home stands alone. Every other tab sits on Home, so Back from that tab is
 * a real pop onto Home, including the predictive-back preview. Screens pushed
 * later are still above this pair.
 */
internal fun tabRootStack(tab: AzfTab): List<NavKey> {
    val key = tab.toNavKey()
    return if (key is DashboardKey) listOf(key) else listOf(DashboardKey, key)
}

internal fun shellBack(stack: List<NavKey>): ShellBack {
    val top = stack.lastOrNull()
    // A non-home tab with nothing under it used to be the whole stack: a tab
    // switch replaced it, and Navigation 3 will not handle Back in that case.
    // Home under the tab (see [tabRootStack]) pops. A restored lone tab selects
    // Home instead of leaving the app.
    val loneNonHomeTab = top is TabKey && top !is DashboardKey && stack.size == 1
    return when {
        loneNonHomeTab -> ShellBack.SelectHome
        stack.size <= 1 -> ShellBack.Leave
        else -> ShellBack.Pop
    }
}

private fun AzfTab.toNavKey(): NavKey =
    when (this) {
        AzfTab.Home -> DashboardKey
        AzfTab.Nutrition -> NutritionKey
        AzfTab.Workouts -> WorkoutLibraryKey
        AzfTab.Progress -> ProgressKey
        AzfTab.Coach -> CoachKey
    }
