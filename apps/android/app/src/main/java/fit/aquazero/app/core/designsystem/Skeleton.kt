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
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Shape
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
    val shift by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1400, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "skeletonShift",
    )
    Box(
        modifier = modifier
            .clip(shape)
            .background(
                Brush.linearGradient(
                    colors = listOf(base, highlight, base),
                    start = Offset(x = shift * 1200f - 600f, y = 0f),
                    end = Offset(x = shift * 1200f, y = 80f),
                ),
            ),
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
