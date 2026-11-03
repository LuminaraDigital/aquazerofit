package fit.aquazero.app

import android.content.Context
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.core.content.edit
import androidx.test.platform.app.InstrumentationRegistry
import fit.aquazero.app.core.designsystem.LocalAzfReducedMotion
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test

/**
 * The first-launch intro's contract: it shows once, Skip dismisses it for
 * good, and it never appears for a returning user or under reduced motion.
 *
 * Reduced motion is pinned explicitly rather than read from the device, because
 * the activity tests switch animations off (which the intro reads as reduced
 * motion) and the result would otherwise depend on test order.
 */
class IntroVideoTest {

    @get:Rule
    val composeRule = createComposeRule()

    private val context: Context = InstrumentationRegistry.getInstrumentation().targetContext
    private val prefs = context.getSharedPreferences(INTRO_PREFS, Context.MODE_PRIVATE)
    private val skip = context.getString(R.string.intro_skip)

    @Before
    fun clearSeenFlag() = prefs.edit(commit = true) { clear() }

    private fun showIntro(reducedMotion: Boolean = false) = composeRule.setContent {
        CompositionLocalProvider(LocalAzfReducedMotion provides reducedMotion) { IntroVideo() }
    }

    @Test
    fun firstLaunchShowsItAndSkipDismissesItForGood() {
        showIntro()
        composeRule.onNodeWithText(skip).assertIsDisplayed().performClick()

        composeRule.onAllNodesWithText(skip).assertCountEquals(0)
        assertTrue(prefs.getBoolean(INTRO_KEY_SEEN, false))
    }

    @Test
    fun returningUserNeverSeesIt() {
        prefs.edit(commit = true) { putBoolean(INTRO_KEY_SEEN, true) }
        showIntro()
        composeRule.onAllNodesWithText(skip).assertCountEquals(0)
    }

    @Test
    fun reducedMotionSkipsItEntirely() {
        showIntro(reducedMotion = true)
        composeRule.onAllNodesWithText(skip).assertCountEquals(0)
    }
}
