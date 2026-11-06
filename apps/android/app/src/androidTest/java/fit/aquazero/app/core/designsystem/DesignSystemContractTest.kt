package fit.aquazero.app.core.designsystem

import androidx.compose.foundation.layout.Box
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertTouchHeightIsEqualTo
import androidx.compose.ui.test.assertTouchWidthIsEqualTo
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

/**
 * The accessibility floor in docs/design.md, asserted on the shared
 * components every screen is built from. A screen that uses these gets the
 * floor for free, so this is where a regression would spread from.
 */
class DesignSystemContractTest {

    @get:Rule
    val composeRule = createComposeRule()

    private val isHeading = SemanticsMatcher.keyIsDefined(SemanticsProperties.Heading)

    /** TalkBack users jump between screens' titles with the headings gesture. */
    @Test
    fun screenTitleIsAHeadingAndBackIsATouchTarget() {
        composeRule.setContent {
            AzfTheme { AzfAppHeader(title = "Nutrition", onBack = {}) }
        }

        composeRule.onNodeWithText("NUTRITION").assert(isHeading)
        // Material draws the icon button at 40dp and extends its touch area to
        // 48dp beyond the drawn bounds, so assert the touch bounds.
        composeRule.onNodeWithContentDescription("Back")
            .assertTouchWidthIsEqualTo(48.dp)
            .assertTouchHeightIsEqualTo(48.dp)
    }

    @Test
    fun sectionLabelIsAHeading() {
        composeRule.setContent {
            AzfTheme { AzfSectionHeading(text = "Reminders") }
        }

        composeRule.onNodeWithText("REMINDERS").assert(isHeading)
    }

    @Test
    fun primaryButtonIsTallEnoughAndRefusesTapsWhileDisabled() {
        var taps = 0
        composeRule.setContent {
            AzfTheme {
                Box {
                    PrimaryButton(
                        text = "Log meal",
                        onClick = { taps++ },
                        enabled = false,
                        modifier = Modifier.testTag("primary"),
                    )
                }
            }
        }

        composeRule.onNodeWithTag("primary")
            .assertHeightIsAtLeast(56.dp)
            .assertIsNotEnabled()
            .performClick()
        assertEquals(0, taps)
    }

    @Test
    fun errorStateOffersARetryThatReachesTheCaller() {
        var retries = 0
        composeRule.setContent {
            AzfTheme {
                ErrorState(
                    title = "Connection lost",
                    message = "Your logs are safe on this device.",
                    retryLabel = "Try again",
                    onRetry = { retries++ },
                )
            }
        }

        composeRule.onNodeWithText("CONNECTION LOST").assertIsDisplayed()
        composeRule.onNodeWithText("Try again")
            .assertHeightIsAtLeast(48.dp)
            .performClick()
        assertEquals(1, retries)
    }

    /** A stat is one stop for TalkBack, with the unit spoken after the figure. */
    @Test
    fun statRowSpeaksLabelValueAndUnitOnce() {
        composeRule.setContent {
            AzfTheme { AzfStatRow(label = "Left today", value = "1,240", unit = "kcal") }
        }

        composeRule.onNodeWithContentDescription("Left today: 1,240 kcal").assertIsDisplayed()
        composeRule.onAllNodesWithText("1,240").assertCountEquals(0)
    }

    /** The frame shows its content whether or not it is lit. */
    @Test
    fun activeFrameKeepsItsContentReachable() {
        composeRule.setContent {
            AzfTheme {
                ActiveFrame(active = true) {
                    SecondaryButton(text = "Snap a meal", onClick = {})
                }
            }
        }

        composeRule.onNodeWithText("Snap a meal").assertIsDisplayed()
    }
}
