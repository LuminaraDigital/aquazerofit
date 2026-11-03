package fit.aquazero.app.core.designsystem

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp

/**
 * XP level progress. "Banked" framing only: shows what is earned, never
 * "you need N more" (product invariant §5.2 — XP never decreases and the
 * scoreboard never punishes).
 */
@Composable
fun LevelBar(
    level: Int,
    rankName: String,
    levelProgress: Float,
    earnedToday: Int,
    modifier: Modifier = Modifier,
) {
    val reducedMotion = rememberReducedMotion()
    // See MacroBar: a `State<Float>` read in the draw lambda, not a `by`
    // delegate feeding `fillMaxWidth(animated)`. 800ms of recompose, remeasure
    // and relayout per level-up became 800ms of repaint.
    val animated = animateFloatAsState(
        targetValue = levelProgress.coerceIn(0f, 1f),
        animationSpec = if (reducedMotion) tween(0) else tween(800, easing = AzfMotion.RevealEasing),
        label = "levelFill",
    )
    val fill = LocalAzfExtended.current.ctaGradient
    Column(modifier = modifier.fillMaxWidth()) {
        Row(modifier = Modifier.fillMaxWidth()) {
            Text(
                text = "LV $level",
                style = MaterialTheme.typography.headlineSmall,
                color = LocalAzfExtended.current.primaryFixedDim,
            )
            Text(
                text = rankName.uppercase(),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier
                    .weight(1f)
                    .padding(start = 8.dp, top = 6.dp),
            )
            if (earnedToday > 0) {
                Text(
                    text = "+$earnedToday XP",
                    style = DataSmall,
                    color = LocalAzfExtended.current.secondaryFixedDim,
                )
            }
        }
        Box(
            modifier = Modifier
                .padding(top = 8.dp)
                .fillMaxWidth()
                .height(10.dp)
                .clip(AzfShapes.Pill)
                .background(LocalAzfExtended.current.ringTrack)
                // Drawn, not scaled — see MacroBar. Sizing the round rect also
                // keeps the CTA gradient spanning exactly the filled part, the
                // way the old inner Box did; `scaleX` would have stretched the
                // ramp instead of re-fitting it.
                .drawWithCache {
                    val cap = CornerRadius(size.height / 2f)
                    onDrawBehind {
                        drawRoundRect(
                            brush = fill,
                            size = Size(size.width * animated.value, size.height),
                            cornerRadius = cap,
                        )
                    }
                },
        )
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416)
@Composable
private fun LevelBarPreview() {
    AzfTheme {
        LevelBar(
            level = 7,
            rankName = "Prospect",
            levelProgress = 0.45f,
            earnedToday = 85,
            modifier = Modifier.padding(16.dp),
        )
    }
}
