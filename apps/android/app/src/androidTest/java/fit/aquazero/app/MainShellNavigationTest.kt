package fit.aquazero.app

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ActivityScenario
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.UiDevice
import androidx.work.Configuration
import androidx.work.WorkManager
import dagger.hilt.android.testing.HiltAndroidRule
import dagger.hilt.android.testing.HiltAndroidTest
import fit.aquazero.app.core.auth.RefreshTokenVault
import fit.aquazero.app.di.CannedResponse
import fit.aquazero.app.di.FakeHttp
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import javax.inject.Inject

/**
 * The authed shell: five tab roots in one back stack, with full-screen
 * destinations pushed *above* them.
 *
 * The rule the shell encodes — and the one that is easy to break — is that the
 * bottom bar is drawn only while the top of the back stack is a `TabKey`. Get
 * it wrong and a full-screen destination keeps a tab bar that navigates out
 * from under it, or a tab root loses the bar entirely. Neither is visible from
 * a unit test, because `MainShell` is private and the decision is made from
 * `backStack.lastOrNull()` at composition time.
 *
 * Reaching this state at all means signing in for real: a token is vaulted and
 * `POST /auth/refresh` answers, so `SessionManager.restore` rotates and the
 * root graph flips to `SignedIn`. Nothing is stubbed above the HTTP layer.
 */
@HiltAndroidTest
class MainShellNavigationTest {

    @get:Rule(order = 0)
    val hiltRule = HiltAndroidRule(this)

    @get:Rule(order = 1)
    val composeRule = createEmptyComposeRule()

    @Inject
    lateinit var vault: RefreshTokenVault

    private var scenario: ActivityScenario<MainActivity>? = null

    @Before
    fun setUp() {
        SystemAnimations.disable()
        hiltRule.inject()
        FakeHttp.reset()
        // Only the rotation answers. Everything else 404s, which is exactly
        // the state of a signed-in device with nothing cached and no server —
        // every screen below therefore renders its offline/empty branch.
        FakeHttp.respondTo(
            "auth/refresh" to CannedResponse(
                status = 200,
                body = """{"accessToken":"access-1","refreshToken":"refresh-2"}""",
            ),
        )
        runBlocking { vault.store("refresh-1") }
        // HiltTestApplication is not a WorkManager Configuration.Provider and
        // the manifest removes the automatic initializer, so any repository
        // that asks for a sync would throw. Initialising here keeps a failure
        // in the code under test from arriving as an unrelated crash.
        runCatching {
            val context = InstrumentationRegistry.getInstrumentation().targetContext
            WorkManager.initialize(context, Configuration.Builder().build())
        }
    }

    @After
    fun tearDown() {
        // Remove the task, not just the activity. A `MainActivity` left in a
        // task record is relaunched by the system when the next instrumentation
        // run starts the process — before `HiltAndroidRule` has built the test
        // component — and the whole run dies with "The component was not
        // created". Closing the scenario alone does not clear the record.
        runCatching { scenario?.onActivity { it.finishAndRemoveTask() } }
        scenario?.close()
        runBlocking { vault.clear() }
        FakeHttp.reset()
        SystemAnimations.restore()
    }

    @Test
    fun aRestoredSessionOpensTheTabShell() {
        launchApp()

        awaitTabBar()
        // All five roots are reachable from the bar; a missing one is a tab
        // the user simply cannot get to.
        listOf(
            R.string.tab_home,
            R.string.tab_nutrition,
            R.string.tab_workouts,
            R.string.tab_progress,
            R.string.tab_coach,
        ).forEach { tab ->
            composeRule.onAllNodes(hasText(string(tab))).onFirst().assertIsDisplayed()
        }
    }

    @Test
    fun switchingTabsReplacesTheRootAndKeepsTheBar() {
        launchApp()
        awaitTabBar()

        composeRule.onAllNodes(hasText(string(R.string.tab_workouts))).onFirst().performClick()

        // The header is the uppercase screen title, which is how it is told
        // apart from the same word in the tab label below it.
        awaitText(string(R.string.screen_workouts).uppercase())
        composeRule.onAllNodes(hasText(string(R.string.tab_home))).assertCountEquals(1)
    }

    @Test
    fun aFullScreenDestinationHidesTheBottomBarAndBackRestoresIt() {
        launchApp()
        awaitTabBar()
        composeRule.onAllNodes(hasText(string(R.string.tab_workouts))).onFirst().performClick()
        awaitText(string(R.string.screen_workouts).uppercase())

        // Settings is drawn by the shell, not by the tab, precisely so it is
        // reachable from any root — a Play compliance requirement.
        composeRule
            .onAllNodesWithContentDescription(string(R.string.shell_open_settings))
            .onFirst()
            .performClick()

        awaitText(string(R.string.settings_title).uppercase())
        // Pushed above the scaffold: no tab bar, exactly as the web renders
        // these outside AppLayout.
        composeRule.onAllNodes(hasText(string(R.string.tab_home))).assertCountEquals(0)

        UiDevice.getInstance(InstrumentationRegistry.getInstrumentation()).pressBack()

        // Back pops one entry, so the tab underneath — Workouts, not Home —
        // comes back with its bar.
        awaitText(string(R.string.tab_home))
        awaitText(string(R.string.screen_workouts).uppercase())
    }

    private fun launchApp() {
        scenario = ActivityScenario.launch(MainActivity::class.java)
    }

    private fun awaitTabBar() = awaitText(string(R.string.tab_home))

    private fun awaitText(text: String) {
        composeRule.waitUntil(TIMEOUT_MS) {
            composeRule.onAllNodes(hasText(text)).fetchSemanticsNodes().isNotEmpty()
        }
    }

    private fun string(resId: Int): String =
        InstrumentationRegistry.getInstrumentation().targetContext.getString(resId)

    private companion object {
        const val TIMEOUT_MS = 20_000L
    }
}
