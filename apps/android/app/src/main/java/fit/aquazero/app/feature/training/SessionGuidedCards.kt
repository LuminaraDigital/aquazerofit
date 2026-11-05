package fit.aquazero.app.feature.training

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import fit.aquazero.app.R
import fit.aquazero.app.core.designsystem.AzfHeroSurface
import fit.aquazero.app.core.designsystem.AzfShapes
import fit.aquazero.app.core.designsystem.AzfSpacing
import fit.aquazero.app.core.designsystem.DataLarge
import fit.aquazero.app.core.designsystem.DataSmall
import fit.aquazero.app.core.designsystem.LocalAzfExtended
import fit.aquazero.app.core.designsystem.RingProgress
import fit.aquazero.app.core.designsystem.SecondaryButton
import fit.aquazero.app.core.designsystem.pressScale
import fit.aquazero.app.core.ui.CoachAvatar
import fit.aquazero.app.core.ui.CoachRoster

private const val TAP_TARGET_SIZE = 168
private const val SET_RING_SIZE = 196

/** One segment per exercise, so the whole session's shape is visible at once. */
@Composable
internal fun SessionProgressHeader(state: WorkoutSessionUiState) {
    val extended = LocalAzfExtended.current
    val label = stringResource(R.string.session_progress_label)
    Column(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                text = stringResource(
                    R.string.session_progress_exercise,
                    state.exerciseIndex + 1,
                    state.entries.size,
                ),
                style = DataSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                text = stringResource(
                    R.string.session_progress_sets,
                    state.completedSets,
                    state.totalSets,
                ),
                style = DataSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Spacer(modifier = Modifier.height(6.dp))
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .semantics { contentDescription = label },
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            state.entries.forEachIndexed { index, entry ->
                val done = state.setsDone.getOrElse(index) { 0 }
                val fill = if (entry.sets <= 0) 0f else (done.toFloat() / entry.sets).coerceIn(0f, 1f)
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .height(8.dp)
                        .clip(AzfShapes.Pill)
                        .background(extended.ringTrack),
                ) {
                    if (fill > 0f) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth(fill)
                                .height(8.dp)
                                .clip(AzfShapes.Pill)
                                .background(extended.primaryFixedDim),
                        )
                    }
                }
            }
        }
    }
}

@Composable
internal fun WorkCard(
    state: WorkoutSessionUiState,
    entry: ResolvedEntry,
    onCompleteSet: () -> Unit,
    onSkipExercise: () -> Unit,
    onWeightChange: (String) -> Unit,
    onRepsChange: (String) -> Unit,
    onRirChange: (String) -> Unit,
) {
    val setNumber = state.currentSetsDone + 1
    AzfHeroSurface {
        Text(
            text = stringResource(R.string.session_current_exercise).uppercase(),
            style = MaterialTheme.typography.labelSmall,
            color = LocalAzfExtended.current.primaryFixedDim,
        )
        Spacer(modifier = Modifier.height(6.dp))
        Text(
            text = entry.name.uppercase(),
            style = MaterialTheme.typography.headlineLarge,
            color = MaterialTheme.colorScheme.onSurface,
        )
        Text(
            text = stringResource(R.string.session_target, TrainingFormat.targetLine(entry)),
            style = DataSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        entry.notes?.takeIf { it.isNotBlank() }?.let { notes ->
            Text(
                text = notes,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 6.dp),
            )
        }

        Spacer(modifier = Modifier.height(AzfSpacing.ElementGapMedium))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            ActualField(
                value = state.actual.weightKg,
                onValueChange = onWeightChange,
                label = stringResource(R.string.session_weight_kg),
                description = stringResource(R.string.session_weight_cd, setNumber, entry.name),
                placeholder = stringResource(R.string.session_bodyweight_hint),
                decimal = true,
                modifier = Modifier.weight(1f),
            )
            ActualField(
                value = state.actual.reps,
                onValueChange = onRepsChange,
                label = stringResource(R.string.session_reps),
                description = stringResource(R.string.session_reps_cd, setNumber, entry.name),
                decimal = false,
                modifier = Modifier.weight(1f),
            )
            ActualField(
                value = state.actual.rir,
                onValueChange = onRirChange,
                label = stringResource(R.string.session_rir),
                description = stringResource(R.string.session_rir_cd, setNumber, entry.name),
                decimal = true,
                modifier = Modifier.weight(1f),
            )
        }

        Spacer(modifier = Modifier.height(AzfSpacing.Gutter))
        RingProgress(
            progress = if (entry.sets <= 0) 0f else state.currentSetsDone.toFloat() / entry.sets,
            size = SET_RING_SIZE.dp,
            strokeWidth = 6.dp,
            color = LocalAzfExtended.current.secondaryFixedDim,
            modifier = Modifier.align(Alignment.CenterHorizontally),
        ) {
            TapTarget(
                setNumber = setNumber,
                totalSets = entry.sets,
                exerciseName = entry.name,
                onClick = onCompleteSet,
            )
        }
        Spacer(modifier = Modifier.height(AzfSpacing.ElementGapMedium))
        SecondaryButton(
            text = stringResource(R.string.session_skip_exercise),
            onClick = onSkipExercise,
        )
    }
}

/**
 * The very large primary action of the whole screen: one tap banks a set. The
 * haptic matters more here than anywhere else in the app, because this is
 * pressed mid-effort, often without looking at the phone.
 */
@Composable
private fun TapTarget(
    setNumber: Int,
    totalSets: Int,
    exerciseName: String,
    onClick: () -> Unit,
) {
    val haptics = LocalHapticFeedback.current
    val interaction = remember { MutableInteractionSource() }
    val description = stringResource(
        R.string.session_complete_set_cd,
        setNumber,
        totalSets,
        exerciseName,
    )
    Box(
        modifier = Modifier
            .size(TAP_TARGET_SIZE.dp)
            .pressScale(interaction)
            .clip(AzfShapes.Pill)
            .background(LocalAzfExtended.current.primaryFixedDim)
            .clickable(
                interactionSource = interaction,
                indication = null,
                role = Role.Button,
            ) {
                haptics.performHapticFeedback(HapticFeedbackType.Confirm)
                onClick()
            }
            .semantics { contentDescription = description },
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = stringResource(R.string.session_set_counter, setNumber, totalSets),
                style = DataLarge.copy(fontSize = 40.sp, lineHeight = 44.sp),
                color = MaterialTheme.colorScheme.onPrimary,
            )
            Text(
                text = stringResource(R.string.session_tap_when_done).uppercase(),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onPrimary,
            )
        }
    }
}

@Composable
internal fun RestCard(
    state: WorkoutSessionUiState,
    entry: ResolvedEntry,
    onSkipRest: () -> Unit,
) {
    val remaining = stringResource(R.string.session_rest_remaining_cd, state.restLeftSeconds)
    val persona = CoachRoster.resolve(state.coachId)
    AzfHeroSurface {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            CoachAvatar(
                persona = persona,
                size = 40.dp,
            )
            Text(
                text = stringResource(R.string.session_rest_coach_line, persona.firstName),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(start = AzfSpacing.ElementGapSmall),
            )
        }
        Spacer(modifier = Modifier.height(AzfSpacing.Gutter))
        RingProgress(
            progress = state.restProgress,
            size = 208.dp,
            strokeWidth = 12.dp,
            color = LocalAzfExtended.current.secondaryFixedDim,
            modifier = Modifier
                .align(Alignment.CenterHorizontally)
                // Description only, never a live region: re-announcing the
                // countdown once a second would talk over the user's rest.
                // Cleared, not merely described: the bare seconds Text inside
                // the ring is otherwise a second stop reading just "45".
                .clearAndSetSemantics { contentDescription = remaining },
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    text = state.restLeftSeconds.toString(),
                    style = DataLarge.copy(fontSize = 56.sp, lineHeight = 60.sp),
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    text = stringResource(R.string.session_rest).uppercase(),
                    style = MaterialTheme.typography.labelSmall,
                    color = LocalAzfExtended.current.secondaryFixedDim,
                )
            }
        }
        Spacer(modifier = Modifier.height(AzfSpacing.ElementGapMedium))
        Text(
            text = stringResource(R.string.session_rest_body, entry.name),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.align(Alignment.CenterHorizontally),
        )
        Spacer(modifier = Modifier.height(AzfSpacing.ElementGapMedium))
        SecondaryButton(text = stringResource(R.string.session_skip_rest), onClick = onSkipRest)
    }
}
