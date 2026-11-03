package fit.aquazero.app.feature.dashboard

import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Chat
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import fit.aquazero.app.R
import fit.aquazero.app.core.common.CoachNudgeKind
import fit.aquazero.app.core.designsystem.AzfCard
import fit.aquazero.app.core.designsystem.AzfChip
import fit.aquazero.app.core.designsystem.AzfSpacing
import fit.aquazero.app.core.designsystem.AzfTheme
import fit.aquazero.app.core.designsystem.LevelBar
import fit.aquazero.app.core.designsystem.LocalAzfExtended
import fit.aquazero.app.core.designsystem.Skeleton
import fit.aquazero.app.core.ui.CoachAvatar
import fit.aquazero.app.core.ui.CoachPersona
import fit.aquazero.app.core.ui.CoachRoster

/**
 * Ambient coach surface for the dashboard (web [CoachCard] parity).
 *
 * Shows who is in your corner, the server's ambient reaction line, XP ladder,
 * and up to three context-aware nudges that open the coach tab with a
 * pre-filled prompt.
 */
@Immutable
data class CoachAmbientUi(
    val persona: CoachPersona,
    val coachLine: String?,
    val bondLevel: Int,
    val bondXp: Int,
    val level: Int,
    val rankName: String,
    val levelProgress: Float,
    val earnedToday: Int,
    val nudges: List<CoachNudgeKind>,
)

@Composable
fun DashboardCoachCard(
    ambient: CoachAmbientUi?,
    loading: Boolean,
    onOpenCoach: (String?) -> Unit,
    modifier: Modifier = Modifier,
) {
    when {
        loading -> Skeleton(
            modifier = modifier
                .fillMaxWidth()
                .height(168.dp),
        )
        ambient == null -> Unit
        else -> DashboardCoachCardContent(
            ambient = ambient,
            onOpenCoach = onOpenCoach,
            modifier = modifier,
        )
    }
}

@Composable
private fun DashboardCoachCardContent(
    ambient: CoachAmbientUi,
    onOpenCoach: (String?) -> Unit,
    modifier: Modifier = Modifier,
) {
    val resources = LocalResources.current
    val persona = ambient.persona
    val openChatLabel = stringResource(R.string.dashboard_coach_open_chat)
    val cardCd = stringResource(R.string.dashboard_coach_card_cd, persona.firstName)

    AzfCard(
        modifier = modifier
            .fillMaxWidth()
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                role = Role.Button,
                onClick = { onOpenCoach(null) },
            )
            .semantics { contentDescription = cardCd },
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.Top,
        ) {
            CoachAvatar(
                persona = persona,
                size = 56.dp,
                contentDescription = stringResource(R.string.coach_portrait_cd, persona.name),
            )
            Column(
                modifier = Modifier
                    .weight(1f)
                    .padding(start = AzfSpacing.ElementGapMedium),
            ) {
                Text(
                    text = stringResource(R.string.dashboard_coach_heading),
                    style = MaterialTheme.typography.labelSmall,
                    color = LocalAzfExtended.current.secondaryFixedDim,
                )
                Text(
                    text = persona.name,
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    text = stringResource(
                        R.string.coach_bond,
                        ambient.bondLevel,
                        ambient.bondXp,
                    ),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Icon(
                imageVector = Icons.AutoMirrored.Outlined.Chat,
                contentDescription = openChatLabel,
                tint = LocalAzfExtended.current.primaryFixedDim,
                modifier = Modifier.size(22.dp),
            )
        }

        ambient.coachLine?.takeIf { it.isNotBlank() }?.let { line ->
            Spacer(Modifier.height(AzfSpacing.ElementGapSmall))
            Text(
                text = line,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.semantics {
                    contentDescription = resources.getString(R.string.coach_safety_cd)
                },
            )
        }

        Spacer(Modifier.height(AzfSpacing.ElementGapMedium))
        LevelBar(
            level = ambient.level,
            rankName = ambient.rankName,
            levelProgress = ambient.levelProgress,
            earnedToday = ambient.earnedToday,
        )

        if (ambient.nudges.isNotEmpty()) {
            Spacer(Modifier.height(AzfSpacing.ElementGapMedium))
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                ambient.nudges.forEach { kind ->
                    val label = nudgeLabel(kind)
                    val prompt = nudgePrompt(kind, ambient)
                    AzfChip(
                        text = label,
                        selected = false,
                        onClick = { onOpenCoach(prompt) },
                    )
                }
            }
        }
    }
}

@Composable
private fun nudgeLabel(kind: CoachNudgeKind): String = when (kind) {
    CoachNudgeKind.ProteinGap -> stringResource(R.string.dashboard_coach_nudge_protein)
    CoachNudgeKind.ReadinessProtect -> stringResource(R.string.dashboard_coach_nudge_recovery)
    CoachNudgeKind.ReadinessProgress -> stringResource(R.string.dashboard_coach_nudge_push)
    CoachNudgeKind.TodaysWorkout -> stringResource(R.string.dashboard_coach_nudge_workout)
    CoachNudgeKind.WeightTrend -> stringResource(R.string.coach_prompt_2)
    CoachNudgeKind.OpenChat -> stringResource(R.string.dashboard_coach_nudge_chat)
}

@Composable
private fun nudgePrompt(kind: CoachNudgeKind, ambient: CoachAmbientUi): String = when (kind) {
    CoachNudgeKind.ProteinGap -> stringResource(R.string.dashboard_coach_prompt_protein)
    CoachNudgeKind.ReadinessProtect -> stringResource(R.string.dashboard_coach_prompt_recovery)
    CoachNudgeKind.ReadinessProgress -> stringResource(R.string.dashboard_coach_prompt_push)
    CoachNudgeKind.TodaysWorkout -> stringResource(
        R.string.dashboard_coach_prompt_workout,
        ambient.persona.firstName,
    )
    CoachNudgeKind.WeightTrend -> stringResource(R.string.coach_prompt_2)
    CoachNudgeKind.OpenChat -> stringResource(R.string.coach_prompt_1)
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416)
@Composable
private fun DashboardCoachCardPreview() {
    AzfTheme {
        DashboardCoachCard(
            ambient = CoachAmbientUi(
                persona = CoachRoster.default(),
                coachLine = "Steady week. Keep logging and the numbers will follow.",
                bondLevel = 6,
                bondXp = 1435,
                level = 12,
                rankName = "Contender",
                levelProgress = 0.42f,
                earnedToday = 85,
                nudges = listOf(
                    CoachNudgeKind.ProteinGap,
                    CoachNudgeKind.TodaysWorkout,
                ),
            ),
            loading = false,
            onOpenCoach = {},
        )
    }
}
