package fit.aquazero.app.core.gamification

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.EmojiEvents
import androidx.compose.material.icons.outlined.IosShare
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import fit.aquazero.app.R
import fit.aquazero.app.core.designsystem.AzfShapes
import fit.aquazero.app.core.designsystem.AzfTheme
import fit.aquazero.app.core.designsystem.LocalAzfExtended
import fit.aquazero.app.core.designsystem.rememberReducedMotion
import fit.aquazero.app.core.ui.CoachAvatar
import fit.aquazero.app.core.ui.CoachRoster

/**
 * Achievement unlock: a banner, not a takeover.
 *
 * An achievement is smaller news than a level, and the app should say so with
 * its staging rather than with its copy — three full-screen interrupts in a
 * row would teach people to tap past the one that mattered. The trophy fills
 * from empty to solid as the banner lands: an outlined icon is clipped to a
 * rising water line and the filled icon is revealed behind it, which reads as
 * *earning* the mark rather than being handed it, and costs one extra vector.
 *
 * Reduced motion pins the fill at full and drops the slide — the achievement
 * is still announced, still legible, just not in motion.
 */
@Composable
fun AchievementUnlockBanner(
    celebration: Celebration.Achievement,
    visible: Boolean,
    onShown: (Celebration) -> Unit,
    onDismiss: () -> Unit,
    onShare: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    val reducedMotion = rememberReducedMotion()
    val haptics = rememberCelebrationHaptics()
    val persona = remember(celebration.coachId) { CoachRoster.resolve(celebration.coachId) }
    val fill = remember(celebration) { Animatable(if (reducedMotion) 1f else 0f) }
    // AnimatedVisibility does not animate a child that is already visible on
    // first composition, so the entrance is driven off a state that starts
    // false and flips once composed.
    var entered by remember(celebration) { mutableStateOf(false) }

    // Ack only once the banner is genuinely on screen (see CelebrationOverlay).
    LaunchedEffect(celebration, visible) {
        if (!visible) return@LaunchedEffect
        entered = true
        onShown(celebration)
        haptics.achievement()
        if (!reducedMotion) {
            fill.animateTo(
                targetValue = 1f,
                animationSpec = spring(
                    dampingRatio = Spring.DampingRatioLowBouncy,
                    stiffness = Spring.StiffnessLow,
                ),
            )
        }
    }

    val label = stringResource(R.string.celebration_achievement_label)
    val announcement = stringResource(R.string.celebration_cd, label, celebration.reaction)

    AnimatedVisibility(
        visible = visible && entered,
        enter = if (reducedMotion) fadeIn(tween(0)) else fadeIn() + slideInVertically { -it },
        exit = if (reducedMotion) fadeOut(tween(0)) else fadeOut() + slideOutVertically { -it },
        modifier = modifier,
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(AzfShapes.Card)
                .background(MaterialTheme.colorScheme.surfaceContainerHigh)
                .border(
                    BorderStroke(1.dp, LocalAzfExtended.current.secondaryFixedDim.copy(alpha = 0.5f)),
                    AzfShapes.Card,
                )
                .padding(14.dp)
                .semantics {
                    liveRegion = LiveRegionMode.Polite
                    contentDescription = announcement
                },
            verticalAlignment = Alignment.CenterVertically,
        ) {
            FillingTrophy(
                fill = fill.value,
                accent = LocalAzfExtended.current.secondaryFixedDim,
            )
            Column(
                modifier = Modifier
                    .weight(1f)
                    .padding(horizontal = 12.dp),
            ) {
                Text(
                    text = label.uppercase(),
                    style = MaterialTheme.typography.labelSmall,
                    color = LocalAzfExtended.current.secondaryFixedDim,
                )
                Text(
                    text = celebration.reaction,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }
            CoachAvatar(persona = persona, size = 32.dp, contentDescription = null)
            if (onShare != null) {
                IconButton(onClick = onShare) {
                    Icon(
                        imageVector = Icons.Outlined.IosShare,
                        contentDescription = stringResource(R.string.achievement_share_cd),
                        tint = MaterialTheme.colorScheme.primary,
                    )
                }
            }
            IconButton(onClick = onDismiss) {
                Icon(
                    imageVector = Icons.Outlined.Close,
                    contentDescription = stringResource(R.string.achievement_dismiss_cd),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

/**
 * Outline icon underneath, filled icon on top clipped to a rising line. Two
 * stacked vectors and one clip rectangle — no bitmap, no shader, no library.
 */
@Composable
private fun FillingTrophy(fill: Float, accent: Color, modifier: Modifier = Modifier) {
    Box(modifier = modifier.size(36.dp), contentAlignment = Alignment.Center) {
        Icon(
            imageVector = Icons.Outlined.EmojiEvents,
            contentDescription = null,
            tint = accent.copy(alpha = 0.45f),
            modifier = Modifier.fillMaxSize(),
        )
        Icon(
            imageVector = Icons.Filled.EmojiEvents,
            contentDescription = null,
            tint = accent,
            modifier = Modifier
                .fillMaxSize()
                .drawWithContent {
                    val level = fill.coerceIn(0f, 1f)
                    clipRect(
                        top = size.height * (1f - level),
                    ) {
                        this@drawWithContent.drawContent()
                    }
                },
        )
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416, widthDp = 400)
@Composable
private fun AchievementUnlockBannerPreview() {
    AzfTheme {
        Column(Modifier.padding(16.dp)) {
            AchievementUnlockBanner(
                celebration = Celebration.Achievement(
                    coachId = "akin",
                    reaction = "First Full Week — logged and yours. I'm properly pleased about this one.",
                ),
                visible = true,
                onShown = {},
                onDismiss = {},
            )
        }
    }
}
