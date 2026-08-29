package fit.aquazero.app

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ActivityScenario
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.UiDevice
import dagger.hilt.android.testing.HiltAndroidRule
import dagger.hilt.android.testing.HiltAndroidTest
import fit.aquazero.app.core.auth.RefreshTokenVault
import fit.aquazero.app.di.FakeHttp
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import javax.inject.Inject

/**
 * The signed-out half of the Navigation 3 root: Welcome → Sign in → back.
 *
 * `AzfNavigation` picks a graph from `AuthState`, and `MainShell` is private,
 * so the only honest way to test either is to launch the activity and let the
 * real `RootViewModel` restore a real (empty) session. That makes this the
 * only test in the suite that proves the app *starts*: `MainActivity`,
 * `installSplashScreen`, the Hilt graph, `AzfTheme` and the pre-auth back
 * stack all have to work before a single assertion below can run.
 */
@HiltAndroidTest
class PreAuthNavigationTest {

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
        // No vaulted refresh token is what "signed out" means to SessionManager.
        // Cleared explicitly because the auth DataStore is a real file that
        // outlives a single test.
        runBlocking { vault.clear() }
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
        FakeHttp.reset()
        SystemAnimations.restore()
    }

    @Test
    fun aColdStartWithNoSessionLandsOnWelcome() {
        launchApp()

        awaitText(welcomeTitle())
        composeRule.onNodeWithText(string(R.string.welcome_get_started)).assertIsDisplayed()
        // Nothing behind the pre-auth flow may be reachable: a signed-out user
        // seeing the tab bar would mean the shell rendered without a session.
        composeRule.onAllNodes(hasText(string(R.string.tab_home))).assertCountEquals(0)
    }

    @Test
    fun getStartedOpensRegistrationAndBackReturnsToWelcome() {
        launchApp()
        awaitText(welcomeTitle())

        composeRule.onNodeWithText(string(R.string.welcome_get_started)).performClick()
        awaitText(registerTitle())

        // System back must pop the pre-auth stack rather than leave the app —
        // `WelcomeKey` is the bottom entry and the only thing under it is exit.
        UiDevice.getInstance(InstrumentationRegistry.getInstrumentation()).pressBack()
        awaitText(welcomeTitle())
    }

    @Test
    fun signInOpensTheLoginModeOfTheSameDestination() {
        launchApp()
        awaitText(welcomeTitle())

        composeRule.onNodeWithText(string(R.string.welcome_have_account)).performClick()

        // Same destination, different mode: the register/login switch is a
        // parameter on `SignInKey`, so a regression here shows up as the wrong
        // title rather than as a missing screen.
        awaitText(loginTitle())
        composeRule.onAllNodes(hasText(registerTitle())).assertCountEquals(0)
    }

    private fun launchApp() {
        scenario = ActivityScenario.launch(MainActivity::class.java)
    }

    /**
     * Wait for [text] to be composed.
     *
     * `waitUntil` polls while the clock advances, so it tolerates the splash
     * hand-off and the session restore without assuming how long either takes.
     */
    private fun awaitText(text: String) {
        composeRule.waitUntil(TIMEOUT_MS) {
            composeRule.onAllNodes(hasText(text)).fetchSemanticsNodes().isNotEmpty()
        }
    }

    /**
     * The carousel title and both sign-in headers render through
     * `.uppercase()` (`AzfAppHeader` and the slide `Text`), so the raw string
     * resource never appears in the semantics tree.
     */
    private fun welcomeTitle(): String = string(R.string.welcome_slide1_title).uppercase()

    private fun registerTitle(): String = string(R.string.signin_title_register).uppercase()

    private fun loginTitle(): String = string(R.string.signin_title_login).uppercase()

    private fun string(resId: Int): String =
        InstrumentationRegistry.getInstrumentation().targetContext.getString(resId)

    private companion object {
        const val TIMEOUT_MS = 15_000L
    }
}
