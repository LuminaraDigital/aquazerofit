package fit.aquazero.app.core.designsystem

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Fill
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Hydration as a row of droplets ([total] defaults to 8 glasses). Filled
 * droplets pop in with a spring; unfilled ones render as outlines on the
 * ring-track color. Reduced motion renders the final state directly.
 */
@Composable
fun WaterDroplets(
    filled: Int,
    modifier: Modifier = Modifier,
    total: Int = 8,
    dropletSize: Dp = 22.dp,
) {
    Row(modifier = modifier) {
        repeat(total) { index ->
            Droplet(
                filled = index < filled,
                size = dropletSize,
                modifier = Modifier.padding(end = 6.dp),
            )
        }
    }
}

@Composable
private fun Droplet(filled: Boolean, size: Dp, modifier: Modifier = Modifier) {
    val reducedMotion = rememberReducedMotion()
    val fillScale by animateFloatAsState(
        targetValue = if (filled) 1f else 0f,
        animationSpec = if (reducedMotion) {
            tween(0)
        } else {
            spring(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessMedium)
        },
        label = "dropletFill",
    )
    val aqua = LocalAzfExtended.current.primaryFixedDim
    val track = LocalAzfExtended.current.ringTrack
    Canvas(modifier = modifier.size(size)) {
        val path = dropletPath(this.size.width, this.size.height)
        drawPath(path = path, color = track, style = Stroke(width = this.size.width * 0.08f))
        if (fillScale > 0f) {
            scale(scale = fillScale) {
                drawPath(path = path, color = aqua, style = Fill)
            }
        }
    }
}

/** Classic droplet: pointed crown flowing into a round belly. */
private fun dropletPath(w: Float, h: Float): Path = Path().apply {
    moveTo(w * 0.5f, h * 0.05f)
    cubicTo(w * 0.62f, h * 0.32f, w * 0.92f, h * 0.5f, w * 0.92f, h * 0.68f)
    cubicTo(w * 0.92f, h * 0.88f, w * 0.73f, h * 0.98f, w * 0.5f, h * 0.98f)
    cubicTo(w * 0.27f, h * 0.98f, w * 0.08f, h * 0.88f, w * 0.08f, h * 0.68f)
    cubicTo(w * 0.08f, h * 0.5f, w * 0.38f, h * 0.32f, w * 0.5f, h * 0.05f)
    close()
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416)
@Composable
private fun WaterDropletsPreview() {
    AzfTheme {
        WaterDroplets(filled = 5, modifier = Modifier.padding(16.dp))
    }
}
