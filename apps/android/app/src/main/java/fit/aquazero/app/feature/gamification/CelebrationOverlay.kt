package fit.aquazero.app.feature.gamification

import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import fit.aquazero.app.R
import fit.aquazero.app.core.designsystem.AkinPose
import fit.aquazero.app.core.designsystem.AkinStage
import fit.aquazero.app.core.designsystem.AzfShapes
import fit.aquazero.app.core.designsystem.AzfTheme
import fit.aquazero.app.core.designsystem.LocalAzfExtended
import fit.aquazero.app.core.designsystem.PrimaryButton
import fit.aquazero.app.core.designsystem.rememberReducedMotion
import fit.aquazero.app.core.model.CoachRankDto
import fit.aquazero.app.core.model.ExperienceStatusDto
import fit.aquazero.app.feature.coach.CoachPersona
import fit.aquazero.app.feature.coach.CoachPortrait
import fit.aquazero.app.feature.coach.CoachRoster

/**
 * The full-screen moment.
 *
 * Choreography, in the order the eye reads it: the scrim drops, the coach's
 * card rises on a spring, the level number scales in behind it, the XP bar
 * fills past its mark and settles back, and confetti falls in brand colours
 * only. AKIN takes the `lift` pose for the duration — the mascot has three
 * static poses and picking the right one is the whole animation budget, which
 * is why there is no Lottie or Rive dependency in this app.
 *
 * Two rules bind this composable:
 *
 *  1. **Ack after composition.** [onShown] fires from a `LaunchedEffect` that
 *     cannot run until the celebration is on screen. Acknowledging earlier —
 *     when the poll returns, say — would burn a level-up the user never saw,
 *     and an unseen celebration does not come back. An *unacknowledged* one
 *     does, which is the failure worth having.
 *  2. **Reduced motion removes the motion, not the moment.** With animations
 *     off there is no confetti, no spring and no rise; the same card, the same
 *     number and the same filled bar are simply already there.
 */
@Composable
fun CelebrationOverlay(
    celebration: Celebration,
    experience: ExperienceStatusDto,
    onShown: (Celebration) -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val reducedMotion = rememberReducedMotion()
    val haptics = rememberCelebrationHaptics()
    val extended = LocalAzfExtended.current

    // Runs only once the overlay has actually composed — see rule 1 above.
    LaunchedEffect(celebration) {
        onShown(celebration)
        haptics.celebrate()
    }

    val rise = remember(celebration) { Animatable(if (reducedMotion) 0f else 1f) }
    val fill = remember(celebration) { Animatable(if (reducedMotion) 1f else 0f) }

    LaunchedEffect(celebration, reducedMotion) {
        if (reducedMotion) {
            rise.snapTo(0f)
            fill.snapTo(1f)
            return@LaunchedEffect
        }
        rise.animateTo(0f, spring(dampingRatio = 0.72f, stiffness = Spring.StiffnessLow))
    }
    LaunchedEffect(celebration, reducedMotion) {
        if (reducedMotion) return@LaunchedEffect
        // Bouncy on purpose: the bar overshoots its mark and settles, which is
        // what makes the number feel earned rather than assigned.
        fill.animateTo(
            targetValue = 1f,
            animationSpec = spring(
                dampingRatio = Spring.DampingRatioMediumBouncy,
                stiffness = Spring.StiffnessVeryLow,
            ),
        )
    }

    val label = celebrationLabel(celebration)
    val announcement = stringResource(R.string.celebration_cd, label, celebration.reaction)
    val riseOffsetPx = with(LocalDensity.current) { 48.dp.toPx() }
    val persona = remember(celebration.coachId) { CoachRoster.resolve(celebration.coachId) }
    val dismissInteraction = remember { MutableInteractionSource() }

    BackHandler(onBack = onDismiss)

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.94f))
            // Tap anywhere to leave. A celebration that traps you is a modal.
            .clickable(
                interactionSource = dismissInteraction,
                indication = null,
                onClick = onDismiss,
            )
            .semantics {
                liveRegion = LiveRegionMode.Assertive
                contentDescription = announcement
            },
        contentAlignment = Alignment.Center,
    ) {
        Confetti(playing = true, seed = celebration.hashCode())

        Column(
            modifier = Modifier
                .widthIn(max = 420.dp)
                .padding(horizontal = 28.dp)
                .graphicsLayer {
                    translationY = rise.value * riseOffsetPx
                    alpha = 1f - rise.value
                },
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            CelebrationMascot(persona.id, persona)

            Spacer(Modifier.height(20.dp))

            Text(
                text = label.uppercase(),
                style = MaterialTheme.typography.labelMedium,
                color = extended.secondaryFixedDim,
                textAlign = TextAlign.Center,
            )
            Text(
                text = celebrationHeadline(celebration),
                style = MaterialTheme.typography.displayLarge,
                color = MaterialTheme.colorScheme.onSurface,
                textAlign = TextAlign.Center,
            )

            Spacer(Modifier.height(18.dp))

            CoachReactionCard(
                persona = persona,
                reaction = celebration.reaction,
                modifier = Modifier.fillMaxWidth(),
            )

            Spacer(Modifier.height(20.dp))

            OvershootLevelBar(
                progress = experience.levelProgress.toFloat(),
                fill = fill.value,
                accent = persona.colour,
            )

            Spacer(Modifier.height(8.dp))

            Text(
                text = stringResource(
                    R.string.xp_banked_progress,
                    experience.bankedIntoLevel.grouped(),
                    experience.level + 1,
                ),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )

            Spacer(Modifier.height(28.dp))

            PrimaryButton(
                text = stringResource(R.string.celebration_dismiss),
                onClick = onDismiss,
            )
        }
    }
}

/**
 * AKIN gets his bespoke stage in the `lift` pose; anyone else greets with
 * their own portrait, degrading to a monogram where art is missing.
 */
@Composable
private fun CelebrationMascot(coachId: String, persona: CoachPersona) {
    if (coachId == CoachRoster.DEFAULT_ID) {
        AkinStage(size = 190.dp, initialPose = AkinPose.Lift)
    } else {
        CoachPortrait(
            persona = persona,
            modifier = Modifier.size(width = 150.dp, height = 190.dp),
            contentDescription = null,
        )
    }
}

/** The authored line, in the coach's colour, attributed by name. */
@Composable
private fun CoachReactionCard(
    persona: CoachPersona,
    reaction: String,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .clip(AzfShapes.Card)
            .background(MaterialTheme.colorScheme.surfaceContainer)
            .border(BorderStroke(1.dp, persona.colour.copy(alpha = 0.5f)), AzfShapes.Card)
            .padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(
            text = persona.firstName.uppercase(),
            style = MaterialTheme.typography.labelMedium,
            color = persona.colour,
        )
        Text(
            text = reaction,
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurface,
        )
    }
}

/**
 * The bar that overshoots. The fill sits at its true width and is scaled from
 * the left edge, so a spring value above 1 reads as the bar punching past its
 * mark instead of throwing on an out-of-range layout fraction.
 */
@Composable
private fun OvershootLevelBar(
    progress: Float,
    fill: Float,
    accent: Color,
    modifier: Modifier = Modifier,
) {
    val extended = LocalAzfExtended.current
    val width = progress.coerceIn(0.04f, 1f)
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(14.dp)
            .clip(AzfShapes.Pill)
            .background(extended.ringTrack),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth(width)
                .fillMaxHeight()
                .graphicsLayer {
                    scaleX = fill
                    transformOrigin = TransformOrigin(0f, 0.5f)
                }
                .clip(AzfShapes.Pill)
                .background(extended.ctaGradient),
        )
        Box(
            modifier = Modifier
                .fillMaxWidth(width)
                .fillMaxHeight()
                .graphicsLayer {
                    scaleX = fill
                    transformOrigin = TransformOrigin(0f, 0.5f)
                    alpha = 0.35f
                }
                .clip(AzfShapes.Pill)
                .background(accent),
        )
    }
}

@Composable
private fun celebrationLabel(celebration: Celebration): String = when (celebration) {
    is Celebration.LevelUp -> stringResource(R.string.celebration_level_up_label)
    is Celebration.RankUp -> stringResource(R.string.celebration_rank_up_label)
    is Celebration.Achievement -> stringResource(R.string.celebration_achievement_label)
}

@Composable
private fun celebrationHeadline(celebration: Celebration): String = when (celebration) {
    is Celebration.LevelUp -> stringResource(R.string.xp_level, celebration.level)
    is Celebration.RankUp -> celebration.rankName
    is Celebration.Achievement -> stringResource(R.string.celebration_achievement_label)
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416, widthDp = 400, heightDp = 860)
@Composable
private fun CelebrationOverlayLevelUpPreview() {
    AzfTheme {
        CelebrationOverlay(
            celebration = Celebration.LevelUp(
                level = 7,
                rankName = "Prospect",
                coachId = "akin",
                reaction = "Level 7. You didn't get that from one big day, you got it from turning up. Again.",
            ),
            experience = ExperienceStatusDto(
                totalXp = 1_800,
                level = 7,
                rank = CoachRankDto("prospect", "Prospect", 5),
                levelStartXp = 1_575,
                nextLevelXp = 2_100,
                levelProgress = 0.43,
                earnedToday = 85,
            ),
            onShown = {},
            onDismiss = {},
        )
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416, widthDp = 400, heightDp = 860)
@Composable
private fun CelebrationOverlayRankUpPreview() {
    AzfTheme {
        CelebrationOverlay(
            celebration = Celebration.RankUp(
                rankId = "heavens",
                rankName = "Heavens Bracket",
                level = 14,
                coachId = "ogun",
                reaction = "Heavens Bracket. Few reach it. Fewer still by the road you took. You have my attention.",
            ),
            experience = ExperienceStatusDto(
                totalXp = 7_000,
                level = 14,
                rank = CoachRankDto("heavens", "Heavens Bracket", 14),
                levelStartXp = 6_825,
                nextLevelXp = 7_875,
                levelProgress = 0.17,
                earnedToday = 120,
            ),
            onShown = {},
            onDismiss = {},
        )
    }
}
