package fit.aquazero.app.core.designsystem

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp

/**
 * Minimal trend sparkline on Canvas: smoothed polyline with rounded joins,
 * an optional soft gradient under-fill, and a lit end-point dot.
 */
@Composable
fun Sparkline(
    values: List<Float>,
    modifier: Modifier = Modifier,
    color: Color = LocalAzfExtended.current.primaryFixedDim,
    showFill: Boolean = true,
) {
    Canvas(modifier = modifier) {
        if (values.size < 2) return@Canvas
        val min = values.min()
        val max = values.max()
        val span = (max - min).takeIf { it > 0f } ?: 1f
        val stepX = size.width / (values.size - 1)
        val pad = size.height * 0.08f
        val usable = size.height - pad * 2

        fun pointY(v: Float): Float = pad + usable * (1f - (v - min) / span)

        val line = Path()
        values.forEachIndexed { i, v ->
            val x = i * stepX
            val y = pointY(v)
            if (i == 0) line.moveTo(x, y) else line.lineTo(x, y)
        }

        if (showFill) {
            val fill = Path().apply {
                addPath(line)
                lineTo(size.width, size.height)
                lineTo(0f, size.height)
                close()
            }
            drawPath(
                path = fill,
                brush = Brush.verticalGradient(
                    colors = listOf(color.copy(alpha = 0.25f), Color.Transparent),
                ),
            )
        }
        drawPath(
            path = line,
            color = color,
            style = Stroke(width = 2.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round),
        )
        drawCircle(
            color = color,
            radius = 3.dp.toPx(),
            center = androidx.compose.ui.geometry.Offset(size.width, pointY(values.last())),
        )
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416)
@Composable
private fun SparklinePreview() {
    AzfTheme {
        Box(Modifier.padding(16.dp)) {
            Sparkline(
                values = listOf(82.4f, 82.1f, 82.2f, 81.8f, 81.9f, 81.5f, 81.2f),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp),
            )
        }
    }
}
