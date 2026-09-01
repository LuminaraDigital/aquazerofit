package fit.aquazero.app.core.designsystem

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Circular progress ring: track `#1E4C74`, rounded caps, animated fill
 * (800ms, gated on reduced motion) and a soft outer glow on the lit arc.
 */
@Composable
fun RingProgress(
    progress: Float,
    modifier: Modifier = Modifier,
    size: Dp = 120.dp,
    strokeWidth: Dp = 8.dp,
    color: Color = LocalAzfExtended.current.primaryFixedDim,
    trackColor: Color = LocalAzfExtended.current.ringTrack,
    center: (@Composable () -> Unit)? = null,
) {
    val reducedMotion = rememberReducedMotion()
    val target = progress.coerceIn(0f, 1f)
    val animated by animateFloatAsState(
        targetValue = target,
        animationSpec = if (reducedMotion) tween(0) else tween(durationMillis = 800, easing = AzfMotion.RevealEasing),
        label = "ringFill",
    )
    Box(modifier = modifier.size(size), contentAlignment = Alignment.Center) {
        Canvas(modifier = Modifier.size(size)) {
            val strokePx = strokeWidth.toPx()
            val inset = strokePx / 2
            val arcSize = Size(this.size.width - strokePx, this.size.height - strokePx)
            val topLeft = Offset(inset, inset)
            drawArc(
                color = trackColor,
                startAngle = -90f,
                sweepAngle = 360f,
                useCenter = false,
                topLeft = topLeft,
                size = arcSize,
                style = Stroke(width = strokePx, cap = StrokeCap.Round),
            )
            if (animated > 0f) {
                // Glow pass: wider, translucent stroke under the arc.
                drawArc(
                    color = color.copy(alpha = 0.25f),
                    startAngle = -90f,
                    sweepAngle = 360f * animated,
                    useCenter = false,
                    topLeft = topLeft,
                    size = arcSize,
                    style = Stroke(width = strokePx * 1.8f, cap = StrokeCap.Round),
                )
                drawArc(
                    color = color,
                    startAngle = -90f,
                    sweepAngle = 360f * animated,
                    useCenter = false,
                    topLeft = topLeft,
                    size = arcSize,
                    style = Stroke(width = strokePx, cap = StrokeCap.Round),
                )
            }
        }
        center?.invoke()
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416)
@Composable
private fun RingProgressPreview() {
    AzfTheme {
        Box(Modifier.padding(16.dp)) {
            RingProgress(progress = 0.68f) {
                androidx.compose.material3.Text(
                    text = "68%",
                    style = DataLarge,
                    color = AzfColors.OnSurface,
                )
            }
        }
    }
}
