package fit.aquazero.app.core.designsystem

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp

/**
 * Loading placeholder with a slow shimmer sweep. Under reduced motion the
 * shimmer is static (a flat tonal block).
 */
@Composable
fun Skeleton(
    modifier: Modifier = Modifier,
    shape: Shape = AzfShapes.Inner,
) {
    val base = MaterialTheme.colorScheme.surfaceContainerLow
    val highlight = MaterialTheme.colorScheme.surfaceContainerHigh
    val reducedMotion = rememberReducedMotion()

    if (reducedMotion) {
        Box(modifier = modifier.clip(shape).background(base))
        return
    }

    val transition = rememberInfiniteTransition(label = "skeleton")
    // Deliberately not a `by` delegate. Read here, in composition, the sweep
    // would recompose Skeleton every frame and rebuild the colour list, both
    // Offsets, the Brush and its LinearGradient shader with it — across the
    // ~15 skeletons on screen, while the app is doing its first network and
    // Room work. `shift.value` is read in the draw lambda below instead.
    val shift = transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1400, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "skeletonShift",
    )
    val colors = remember(base, highlight) { listOf(base, highlight, base) }
    Box(
        modifier = modifier
            .clip(shape)
            .drawWithCache {
                // One gradient, built once per size: a 600px highlight band
                // ending at the origin. The sweep is a canvas translation, so
                // the shader itself never has to be rebuilt.
                val sweep = Brush.linearGradient(
                    colors = colors,
                    start = Offset(x = -600f, y = 0f),
                    end = Offset(x = 0f, y = 80f),
                )
                onDrawBehind {
                    // Translate the canvas to move the band, then draw the
                    // block back at -offset so it stays over the skeleton.
                    // Same pixels the old start/end arithmetic produced.
                    val offset = shift.value * 1200f
                    translate(left = offset) {
                        drawRect(brush = sweep, topLeft = Offset(x = -offset, y = 0f), size = size)
                    }
                }
            },
    )
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416)
@Composable
private fun SkeletonPreview() {
    AzfTheme {
        Column(Modifier.padding(16.dp)) {
            Skeleton(modifier = Modifier.fillMaxWidth().height(96.dp), shape = AzfShapes.Card)
            Skeleton(
                modifier = Modifier
                    .padding(top = 12.dp)
                    .fillMaxWidth(0.6f)
                    .height(20.dp),
            )
        }
    }
}
