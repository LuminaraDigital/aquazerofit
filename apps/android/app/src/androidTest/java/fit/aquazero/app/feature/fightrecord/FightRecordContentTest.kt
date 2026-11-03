package fit.aquazero.app.feature.fightrecord

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import fit.aquazero.app.core.designsystem.AzfTheme
import fit.aquazero.app.core.model.BeltRungDto
import fit.aquazero.app.core.model.BeltTier
import fit.aquazero.app.core.model.FightRecordSeasonProgressDto
import fit.aquazero.app.core.model.FightRecordStatusDto
import fit.aquazero.app.core.model.SeasonDto
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

/**
 * What the Fight Record screen does that a `uiState` test cannot see: it
 * leaves when the feature is withdrawn, and a screen reader hears which rungs
 * are held rather than an unlabelled tick.
 */
class FightRecordContentTest {

    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun offLeavesTheScreenOnce() {
        var backs = 0
        composeRule.setContent {
            AzfTheme {
                FightRecordContent(
                    state = FightRecordUiState.Off,
                    onBack = { backs++ },
                    onRetry = {},
                    onShare = { _, _ -> },
                )
            }
        }
        composeRule.waitForIdle()

        assertEquals(1, backs)
    }

    @Test
    fun heldRungsSayHeldAndTheRestSayNotYet() {
        composeRule.setContent {
            AzfTheme {
                FightRecordContent(
                    state = FightRecordUiState.Ready(record()),
                    onBack = {},
                    onRetry = {},
                    onShare = { _, _ -> },
                )
            }
        }

        // White and Blue are held at a Blue belt; Purple, Brown and Black are not.
        composeRule.onAllNodes(stateIs("Held")).assertCountEquals(2)
        composeRule.onAllNodes(stateIs("Not yet held")).assertCountEquals(3)
        composeRule.onAllNodesWithText("Share my belt").assertCountEquals(1)
    }

    private fun stateIs(value: String) = SemanticsMatcher.expectValue(SemanticsProperties.StateDescription, value)

    private fun record() = FightRecordStatusDto(
        current = FightRecordSeasonProgressDto(
            season = SeasonDto(number = 3, name = "Second Wind", startsOn = "2027-03-01", endsOn = "2027-04-25"),
            activeDays = 14,
            daysLeft = 23,
            tier = BeltTier.BLUE,
            next = BeltRungDto(BeltTier.PURPLE, 24),
        ),
        ladder = listOf(
            BeltRungDto(BeltTier.WHITE, 3),
            BeltRungDto(BeltTier.BLUE, 12),
            BeltRungDto(BeltTier.PURPLE, 24),
            BeltRungDto(BeltTier.BROWN, 36),
            BeltRungDto(BeltTier.BLACK, 48),
        ),
    )
}
