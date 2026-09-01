package fit.aquazero.app.core.gamification

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import fit.aquazero.app.core.model.ExperienceStatusDto
import fit.aquazero.app.core.ui.CoachRoster

/**
 * Drop-in celebration layer.
 *
 * Place it as the last child of a screen's root `Box` and the whole
 * gamification moment arrives with it: level-ups and rank-ups take the screen,
 * achievements slide in as a banner above the content, and the acknowledgement
 * fires only after something has actually been drawn.
 *
 * ```
 * Box(Modifier.fillMaxSize()) {
 *     MyScreenContent()
 *     CelebrationHost()
 * }
 * ```
 *
 * It owns nothing the host screen needs to know about, which is the point:
 * the dashboard, the coach chat and the progress screen all want the same
 * behaviour and none of them should be the place it lives.
 */
@Composable
fun CelebrationHost(
    modifier: Modifier = Modifier,
    viewModel: CelebrationViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current
    CelebrationLayer(
        state = state,
        onShown = viewModel::onShown,
        onDismiss = viewModel::dismissCurrent,
        onShareAchievement = { celebration ->
            val experience = state.experience ?: ExperienceStatusDto()
            val data = BragCardData(
                userDisplayName = "",
                coach = CoachRoster.resolve(celebration.coachId),
                level = experience.level,
                consistencyDays = 0,
                totalWorkouts = 0,
                recentPr = celebration.reaction,
            )
            context.startActivity(
                BragCardGenerator.createShareIntent(data),
            )
        },
        modifier = modifier,
    )
}

/** Stateless half — previewable, and testable without Hilt. */
@Composable
fun CelebrationLayer(
    state: CelebrationUiState,
    onShown: (Celebration) -> Unit,
    onDismiss: () -> Unit,
    onShareAchievement: ((Celebration.Achievement) -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    val current = state.current ?: return
    val experience = state.experience ?: ExperienceStatusDto()

    Box(modifier = modifier.fillMaxSize()) {
        when (current) {
            is Celebration.LevelUp, is Celebration.RankUp -> CelebrationOverlay(
                celebration = current,
                experience = experience,
                onShown = onShown,
                onDismiss = onDismiss,
            )

            is Celebration.Achievement -> AchievementUnlockBanner(
                celebration = current,
                visible = true,
                onShown = onShown,
                onDismiss = onDismiss,
                onShare = onShareAchievement?.let { share -> { share(current) } },
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .padding(horizontal = 16.dp, vertical = 12.dp),
            )
        }
    }
}
