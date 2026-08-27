package fit.aquazero.app.feature.progress

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import fit.aquazero.app.R
import fit.aquazero.app.core.designsystem.AzfShapes
import fit.aquazero.app.core.designsystem.AzfTheme
import fit.aquazero.app.core.designsystem.DataSmall
import fit.aquazero.app.core.designsystem.LocalAzfExtended
import fit.aquazero.app.core.network.dto.TrendPointDto
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * Pure chart maths, kept out of the drawing code so the geometry is unit
 * testable without a device.
 */
object ChartMath {

    /** One point in chart space. */
    data class P(val x: Float, val y: Float)

    /**
     * Catmull-Rom → cubic-bezier control points for the segment `p1 → p2`,
     * exactly the construction the web's `smoothPath` uses (tension 1/6).
     */
    fun controlPoints(p0: P, p1: P, p2: P, p3: P): Pair<P, P> {
        val c1 = P(p1.x + (p2.x - p0.x) / 6f, p1.y + (p2.y - p0.y) / 6f)
        val c2 = P(p2.x - (p3.x - p1.x) / 6f, p2.y - (p3.y - p1.y) / 6f)
        return c1 to c2
    }

    /**
     * Map a series (plus an optional goal, which must stay on-canvas) into
     * chart space. Returns an empty list for an empty series.
     */
    fun project(
        values: List<Double>,
        goal: Double?,
        width: Float,
        height: Float,
        padding: Float,
    ): List<P> {
        if (values.isEmpty()) return emptyList()
        val withGoal = if (goal != null) values + goal else values
        val min = withGoal.min()
        val max = withGoal.max()
        val span = max(MIN_SPAN, (max - min).toFloat())
        val usableHeight = height - padding * 2
        val step = if (values.size == 1) 0f else (width - padding * 2) / (values.size - 1)
        return values.mapIndexed { index, value ->
            P(
                x = padding + step * index,
                y = padding + (1f - ((value - min).toFloat() / span)) * usableHeight,
            )
        }
    }

    /** Y coordinate for one raw value under the same projection as [project]. */
    fun yFor(
        value: Double,
        values: List<Double>,
        goal: Double?,
        height: Float,
        padding: Float,
    ): Float {
        val withGoal = if (goal != null) values + goal else values
        if (withGoal.isEmpty()) return height / 2f
        val min = withGoal.min()
        val max = withGoal.max()
        val span = max(MIN_SPAN, (max - min).toFloat())
        return padding + (1f - ((value - min).toFloat() / span)) * (height - padding * 2)
    }

    /** Never let a flat series collapse the chart to a single line of pixels. */
    private const val MIN_SPAN = 0.5f
}

/**
 * Weight line chart: Catmull-Rom smoothed line, gradient under-fill, dashed
 * goal line and a lit end point.
 *
 * **No red, ever.** The line is one aqua whether the series rises or falls —
 * direction is information, not a verdict (product invariant §5.3).
 */
@Composable
fun WeightChart(
    points: List<TrendPointDto>,
    goalKg: Double?,
    modifier: Modifier = Modifier,
    contentDescription: String? = null,
) {
    val lineColor = LocalAzfExtended.current.primaryFixedDim
    val goalColor = LocalAzfExtended.current.secondaryFixedDim
    val values = points.map { it.value }
    Canvas(
        modifier = modifier
            .fillMaxWidth()
            .height(CHART_HEIGHT.dp)
            .then(
                if (contentDescription != null) {
                    Modifier.semantics { this.contentDescription = contentDescription }
                } else {
                    Modifier
                },
            ),
    ) {
        if (values.isEmpty()) return@Canvas
        val padding = CHART_PADDING.dp.toPx()
        val projected = ChartMath.project(values, goalKg, size.width, size.height, padding)
        val offsets = projected.map { Offset(it.x, it.y) }

        if (goalKg != null) {
            val goalY = ChartMath.yFor(goalKg, values, goalKg, size.height, padding)
            drawLine(
                color = goalColor,
                start = Offset(padding, goalY),
                end = Offset(size.width - padding, goalY),
                strokeWidth = 1.5.dp.toPx(),
                pathEffect = PathEffect.dashPathEffect(floatArrayOf(12f, 12f)),
            )
        }

        val line = smoothPath(projected)
        if (offsets.size > 1) {
            val fill = Path().apply {
                addPath(line)
                lineTo(offsets.last().x, size.height)
                lineTo(offsets.first().x, size.height)
                close()
            }
            drawPath(
                path = fill,
                brush = Brush.verticalGradient(
                    colors = listOf(lineColor.copy(alpha = 0.3f), Color.Transparent),
                ),
            )
        }
        drawPath(
            path = line,
            color = lineColor,
            style = Stroke(
                width = 3.dp.toPx(),
                cap = StrokeCap.Round,
                join = StrokeJoin.Round,
            ),
        )
        offsets.lastOrNull()?.let { last ->
            drawCircle(color = lineColor, radius = 4.dp.toPx(), center = last)
        }
    }
}

/**
 * Daily calorie bars against the target line.
 *
 * Every bar is the same aqua. Painting over-target days coral would mark them
 * as errors — precisely the calorie guilt this product designs out — and it is
 * redundant: a bar crossing the dashed target line has already said so by
 * position, which also survives colour blindness.
 */
@Composable
fun KcalBars(
    points: List<TrendPointDto>,
    targetKcal: Double?,
    modifier: Modifier = Modifier,
    contentDescription: String? = null,
) {
    val barColor = LocalAzfExtended.current.primaryFixedDim
    val targetColor = LocalAzfExtended.current.secondaryFixedDim
    Canvas(
        modifier = modifier
            .fillMaxWidth()
            .height(BARS_HEIGHT.dp)
            .then(
                if (contentDescription != null) {
                    Modifier.semantics { this.contentDescription = contentDescription }
                } else {
                    Modifier
                },
            ),
    ) {
        if (points.isEmpty()) return@Canvas
        val padding = CHART_PADDING.dp.toPx()
        val maxValue = max(
            targetKcal ?: 0.0,
            points.maxOf { it.value },
        ).coerceAtLeast(1.0)
        val slot = (size.width - padding * 2) / points.size
        val barWidth = (slot - 2f).coerceAtLeast(2f)
        val radius = androidx.compose.ui.geometry.CornerRadius(
            (barWidth / 2f).coerceAtMost(3.dp.toPx()),
        )

        points.forEachIndexed { index, point ->
            val height = ((point.value / maxValue).toFloat() * (size.height - padding * 2))
                .coerceAtLeast(1f)
            drawRoundRect(
                color = barColor.copy(alpha = 0.7f),
                topLeft = Offset(padding + slot * index + 1f, size.height - padding - height),
                size = Size(barWidth, height),
                cornerRadius = radius,
            )
        }

        if (targetKcal != null) {
            val y = size.height - padding -
                ((targetKcal / maxValue).toFloat() * (size.height - padding * 2))
            drawLine(
                color = targetColor,
                start = Offset(padding, y),
                end = Offset(size.width - padding, y),
                strokeWidth = 1.5.dp.toPx(),
                pathEffect = PathEffect.dashPathEffect(floatArrayOf(12f, 12f)),
            )
        }
    }
}

/** Average macro split as a donut plus a legend. */
@Composable
fun MacroDonut(
    proteinG: Double,
    carbsG: Double,
    fatG: Double,
    modifier: Modifier = Modifier,
) {
    val extended = LocalAzfExtended.current
    val kcalProtein = proteinG * KCAL_PER_G_PROTEIN
    val kcalCarbs = carbsG * KCAL_PER_G_CARBS
    val kcalFat = fatG * KCAL_PER_G_FAT
    val total = (kcalProtein + kcalCarbs + kcalFat).coerceAtLeast(1.0)
    val segments = listOf(
        Triple(R.string.progress_macro_protein, extended.secondaryFixedDim, kcalProtein to proteinG),
        Triple(R.string.progress_macro_carbs, extended.primaryFixedDim, kcalCarbs to carbsG),
        // Coral, never red — the same accent the product uses for weight gain.
        Triple(R.string.progress_macro_fat, extended.coral, kcalFat to fatG),
    )
    val description = stringResource(
        R.string.progress_macro_cd,
        ((kcalProtein / total) * 100).roundToInt(),
        ((kcalCarbs / total) * 100).roundToInt(),
        ((kcalFat / total) * 100).roundToInt(),
    )

    Row(
        modifier = modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Canvas(
            modifier = Modifier
                .size(DONUT_SIZE.dp)
                .semantics { contentDescription = description },
        ) {
            val stroke = 14.dp.toPx()
            val inset = stroke / 2f
            val arcSize = Size(size.width - stroke, size.height - stroke)
            drawArc(
                color = extended.ringTrack,
                startAngle = 0f,
                sweepAngle = 360f,
                useCenter = false,
                topLeft = Offset(inset, inset),
                size = arcSize,
                style = Stroke(width = stroke),
            )
            var start = -90f
            segments.forEach { (_, color, pair) ->
                val sweep = ((pair.first / total).toFloat() * 360f)
                if (sweep > 0f) {
                    drawArc(
                        color = color,
                        startAngle = start,
                        sweepAngle = sweep,
                        useCenter = false,
                        topLeft = Offset(inset, inset),
                        size = arcSize,
                        style = Stroke(width = stroke, cap = StrokeCap.Butt),
                    )
                }
                start += sweep
            }
        }
        Column(
            modifier = Modifier
                .padding(start = 20.dp)
                .clearAndSetSemantics { },
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            segments.forEach { (labelRes, color, pair) ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(10.dp)
                            .clip(CircleShape)
                            .background(color),
                    )
                    Text(
                        text = stringResource(labelRes),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(start = 8.dp),
                    )
                    Text(
                        text = stringResource(
                            R.string.progress_macro_entry,
                            pair.second.roundToInt(),
                            ((pair.first / total) * 100).roundToInt(),
                        ),
                        style = DataSmall,
                        color = MaterialTheme.colorScheme.onSurface,
                        modifier = Modifier.padding(start = 8.dp),
                    )
                }
            }
        }
    }
}

/** Compose the Catmull-Rom path through [points]. */
private fun smoothPath(points: List<ChartMath.P>): Path {
    val path = Path()
    if (points.isEmpty()) return path
    path.moveTo(points[0].x, points[0].y)
    if (points.size == 1) return path
    for (i in 0 until points.size - 1) {
        val p0 = points[max(0, i - 1)]
        val p1 = points[i]
        val p2 = points[i + 1]
        val p3 = points[minOf(points.size - 1, i + 2)]
        val (c1, c2) = ChartMath.controlPoints(p0, p1, p2, p3)
        path.cubicTo(c1.x, c1.y, c2.x, c2.y, p2.x, p2.y)
    }
    return path
}

private const val CHART_HEIGHT = 170
private const val BARS_HEIGHT = 140
private const val CHART_PADDING = 12
private const val DONUT_SIZE = 128
private const val KCAL_PER_G_PROTEIN = 4.0
private const val KCAL_PER_G_CARBS = 4.0
private const val KCAL_PER_G_FAT = 9.0

@Preview(showBackground = true, backgroundColor = 0xFF0E1416)
@Composable
private fun WeightChartPreview() {
    AzfTheme {
        Box(modifier = Modifier.padding(16.dp).clip(AzfShapes.Card)) {
            WeightChart(
                points = listOf(
                    TrendPointDto("2026-08-01", 84.2),
                    TrendPointDto("2026-08-08", 83.6),
                    TrendPointDto("2026-08-15", 83.9),
                    TrendPointDto("2026-08-22", 83.1),
                ),
                goalKg = 80.0,
            )
        }
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416)
@Composable
private fun KcalBarsPreview() {
    AzfTheme {
        Box(modifier = Modifier.padding(16.dp)) {
            KcalBars(
                points = (1..14).map { TrendPointDto("2026-08-%02d".format(it), 1700.0 + it * 40) },
                targetKcal = 2100.0,
            )
        }
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416)
@Composable
private fun MacroDonutPreview() {
    AzfTheme {
        Box(modifier = Modifier.padding(16.dp)) {
            MacroDonut(proteinG = 140.0, carbsG = 210.0, fatG = 68.0)
        }
    }
}
