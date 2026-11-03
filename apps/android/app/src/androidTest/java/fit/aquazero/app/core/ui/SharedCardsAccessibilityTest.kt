package fit.aquazero.app.core.ui

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import fit.aquazero.app.core.designsystem.AzfTheme
import org.junit.Rule
import org.junit.Test

/**
 * Screen-reader behaviour of the two composites every nutrition surface
 * reuses.
 *
 * These assert what a TalkBack user actually receives, which is the one thing
 * a `uiState` test cannot see. The negative assertions carry the weight: a
 * `contentDescription` on a container that still exposes its children reads
 * the same number twice, and that regression is invisible to the eye, to
 * `lint`, and to every other suite in this module.
 */
class SharedCardsAccessibilityTest {

    @get:Rule
    val composeRule = createComposeRule()

    /**
     * `MacroRow` supplies the whole sentence ("Protein: 90 of 150 grams"), so
     * the bar's own label and ratio Texts must not also be reachable — else
     * the row is three stops that say the same thing twice over.
     */
    @Test
    fun macroRowSpeaksOnceAndDoesNotLeakItsRawFragments() {
        composeRule.setContent {
            AzfTheme {
                MacroRow(
                    label = "Protein",
                    consumed = 90.0,
                    target = 150.0,
                    color = Color.Green,
                )
            }
        }

        composeRule
            .onNodeWithContentDescription("Protein: 90 of 150 grams")
            .assertIsDisplayed()

        // Asserted against the MERGED tree, deliberately — that is the tree
        // accessibility services read, and the only one where "does TalkBack
        // say this twice" is a meaningful question.
        //
        // `MacroRow` uses `clearAndSetSemantics`, which drops its descendants
        // from the merged tree while leaving them in place in the unmerged
        // one. Passing `useUnmergedTree = true` here therefore asserts that
        // the raw Texts do not exist at all — which is false, and would stay
        // false however the component were written, because the bar really
        // does still draw "PROTEIN" and "90 / 150g" as text. The visible
        // pixels are unchanged; only what a screen reader is offered is.
        composeRule.onAllNodesWithText("90 / 150g").assertCountEquals(0)
        composeRule.onAllNodesWithText("PROTEIN").assertCountEquals(0)
    }

    /**
     * The droplet strip is drawn, not written, so its description is the only
     * way the intake is conveyed at all — and the increment button has to be
     * findable by what it does, not by the glyph on it.
     */
    @Test
    fun hydrationCardExposesIntakeAndItsAction() {
        composeRule.setContent {
            AzfTheme {
                HydrationCard(
                    consumedMl = 1_000,
                    targetMl = 2_000,
                    pending = false,
                    onLogWater = {},
                )
            }
        }

        composeRule
            .onNodeWithContentDescription("Water intake 1000 of 2000 millilitres")
            .assertIsDisplayed()
        composeRule
            .onNodeWithContentDescription("Log 250 millilitres of water")
            .assertIsEnabled()
    }
}
