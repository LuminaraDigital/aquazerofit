package fit.aquazero.app.feature.coach

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.platform.app.InstrumentationRegistry
import fit.aquazero.app.R
import fit.aquazero.app.core.designsystem.AzfTheme
import fit.aquazero.app.core.ui.CoachRoster
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

/**
 * The coach picker as a bout sheet: a locked coach says why in words (not only
 * dimmed), a free one says so, and tapping a row selects it.
 */
class CoachBoutSheetTest {

    @get:Rule
    val composeRule = createComposeRule()

    private fun cards(): List<CoachCard> = CoachRoster.personas.mapIndexed { index, persona ->
        CoachCard(
            persona = persona,
            unlocked = persona.isFree,
            active = index == 0,
            requiredLevel = persona.unlockLevel,
            bondXp = 0,
            bondLevel = 1,
        )
    }

    @Test
    fun lockedCoachStatesItsUnlockLevelInWords() {
        composeRule.setContent {
            AzfTheme {
                CoachSelectContent(
                    state = CoachSelectUiState(loading = false, cards = cards()),
                    onBack = {},
                    onSelect = {},
                    onRetry = {},
                )
            }
        }

        composeRule.onAllNodesWithText("REACH LEVEL", substring = true).assertCountAtLeastOne()
    }

    @Test
    fun tappingTheActiveCoachSelectsIt() {
        val selected = mutableListOf<String>()
        val first = cards().first()
        composeRule.setContent {
            AzfTheme {
                CoachSelectContent(
                    state = CoachSelectUiState(loading = false, cards = cards()),
                    onBack = {},
                    onSelect = { selected += it.persona.id },
                    onRetry = {},
                )
            }
        }

        composeRule.onNodeWithText(first.persona.ringName.uppercase()).performClick()

        assertEquals(listOf(first.persona.id), selected)
    }

    /** Compliance copy: the bar shows every word of it, never an ellipsis. */
    @Test
    fun disclaimerShowsTheFullWording() {
        val wording = InstrumentationRegistry.getInstrumentation().targetContext
            .getString(R.string.coach_disclaimer)
        composeRule.setContent { AzfTheme { WellnessDisclaimerBar() } }

        composeRule.onNode(hasText(wording)).assertIsDisplayed()
    }
}

private fun androidx.compose.ui.test.SemanticsNodeInteractionCollection.assertCountAtLeastOne() {
    check(fetchSemanticsNodes().isNotEmpty()) { "expected at least one matching node" }
}
