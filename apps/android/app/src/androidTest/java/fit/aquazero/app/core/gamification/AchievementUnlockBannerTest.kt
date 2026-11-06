package fit.aquazero.app.core.gamification

import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertWidthIsAtLeast
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.unit.dp
import fit.aquazero.app.core.designsystem.AzfTheme
import org.junit.Rule
import org.junit.Test

/** The banner's two controls are icon-only: each needs a spoken name and a 48dp target. */
class AchievementUnlockBannerTest {

    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun shareAndDismissAreNamedAndAtLeast48dp() {
        composeRule.setContent {
            AzfTheme {
                AchievementUnlockBanner(
                    celebration = Celebration.Achievement(coachId = "akin", reaction = "Well earned."),
                    visible = true,
                    onShown = {},
                    onDismiss = {},
                    onShare = {},
                )
            }
        }
        composeRule.waitForIdle()
        listOf("Share achievement", "Dismiss").forEach { name ->
            composeRule.onNodeWithContentDescription(name)
                .assertWidthIsAtLeast(48.dp)
                .assertHeightIsAtLeast(48.dp)
        }
    }
}
