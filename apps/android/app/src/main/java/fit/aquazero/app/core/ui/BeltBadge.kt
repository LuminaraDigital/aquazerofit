package fit.aquazero.app.core.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import fit.aquazero.app.core.designsystem.AzfTheme
import fit.aquazero.app.core.model.BeltTier

/**
 * A belt, drawn: band, knot, two tails and the rank bar near the right end.
 *
 * Drawn rather than shipped as art so it scales from a ladder row to the
 * season block without an asset per size, and so its geometry and colours can
 * be held line for line against `apps/web/src/components/fightRecord/BeltBadge.tsx`
 * (a 120 x 56 viewBox, mirrored below) and the colour table in
 * `apps/web/src/lib/fightRecord.ts`. Change one, change all three, or a blue
 * belt on the phone stops matching the blue belt on the share card.
 *
 * "No belt yet" ([tier] null) is a dashed outline, never a grey belt: a grey
 * belt reads as a belt someone lost, and nothing in Fight Record can be lost.
 *
 * Every belt carries an outline in the theme's outline colour, because the
 * belt colours are the sport's, not the theme's: a white belt on a light
 * surface and a black belt on Deep Sea would otherwise vanish.
 *
 * @param decorative set when adjacent text already names the belt, so a
 *   screen reader does not hear it twice.
 */
@Composable
fun BeltBadge(
    tier: BeltTier?,
    modifier: Modifier = Modifier,
    width: Dp = 80.dp,
    decorative: Boolean = false,
) {
    val outline = MaterialTheme.colorScheme.outline
    val label = beltName(tier)
    val a11y = if (decorative) {
        Modifier
    } else {
        Modifier.semantics {
            contentDescription = label
            role = Role.Image
        }
    }
    Spacer(
        modifier = modifier
            .size(width = width, height = width * VIEW_HEIGHT / VIEW_WIDTH)
            .then(a11y)
            .drawWithCache {
                val scale = size.width / VIEW_WIDTH
                val leftTail = tailPath(scale, LEFT_TAIL)
                val rightTail = tailPath(scale, RIGHT_TAIL)
                val stroke = Stroke(width = OUTLINE_WIDTH * scale)
                val dashed = Stroke(
                    width = DASHED_WIDTH * scale,
                    pathEffect = PathEffect.dashPathEffect(floatArrayOf(6f * scale, 5f * scale)),
                )
                onDrawBehind {
                    if (tier == null) {
                        drawBox(scale, BAND, outline, dashed)
                        return@onDrawBehind
                    }
                    val fill = beltColour(tier)
                    drawBox(scale, BAND, fill, null)
                    drawBox(scale, BAND, outline, stroke)
                    drawBox(scale, RANK_BAR, rankBarColour(tier), null)
                    listOf(leftTail, rightTail).forEach { tail ->
                        drawPath(tail, fill)
                        drawPath(tail, outline, style = stroke)
                    }
                    drawBox(scale, KNOT, fill, null)
                    drawBox(scale, KNOT, outline, stroke)
                }
            },
    )
}

/** Belt colours, mirroring `BELT_COLOUR` in `apps/web/src/lib/fightRecord.ts`. */
private fun beltColour(tier: BeltTier): Color = when (tier) {
    BeltTier.WHITE -> Color(0xFFF4F6F8)
    BeltTier.BLUE -> Color(0xFF2F6FED)
    BeltTier.PURPLE -> Color(0xFF7B4FD6)
    BeltTier.BROWN -> Color(0xFF8A5A3B)
    BeltTier.BLACK -> Color(0xFF16181D)
}

/** The rank bar: black on every belt, red on a black belt (`rankBarColour` on the web). */
private fun rankBarColour(tier: BeltTier): Color =
    if (tier == BeltTier.BLACK) Color(0xFFD62828) else Color(0xFF16181D)

/** A rectangle in viewBox units: x, y, width, height and corner radius. */
private class ViewRect(val x: Float, val y: Float, val w: Float, val h: Float, val r: Float = 0f)

private fun DrawScope.drawBox(scale: Float, box: ViewRect, color: Color, stroke: Stroke?) {
    val topLeft = Offset(box.x * scale, box.y * scale)
    val boxSize = Size(box.w * scale, box.h * scale)
    val corner = CornerRadius(box.r * scale)
    if (stroke == null) {
        drawRoundRect(color = color, topLeft = topLeft, size = boxSize, cornerRadius = corner)
    } else {
        drawRoundRect(color = color, topLeft = topLeft, size = boxSize, cornerRadius = corner, style = stroke)
    }
}

private fun tailPath(scale: Float, points: List<Offset>): Path = Path().apply {
    points.forEachIndexed { index, point ->
        if (index == 0) moveTo(point.x * scale, point.y * scale) else lineTo(point.x * scale, point.y * scale)
    }
    close()
}

private const val VIEW_WIDTH = 120f
private const val VIEW_HEIGHT = 56f
private const val OUTLINE_WIDTH = 1.5f
private const val DASHED_WIDTH = 2f

private val BAND = ViewRect(x = 4f, y = 16f, w = 112f, h = 16f, r = 5f)
private val RANK_BAR = ViewRect(x = 88f, y = 18f, w = 14f, h = 12f)
private val KNOT = ViewRect(x = 50f, y = 11f, w = 20f, h = 26f, r = 5f)
private val LEFT_TAIL = listOf(Offset(57f, 32f), Offset(46f, 52f), Offset(53f, 54f), Offset(61f, 32f))
private val RIGHT_TAIL = listOf(Offset(63f, 32f), Offset(74f, 52f), Offset(67f, 54f), Offset(59f, 32f))

@Preview(showBackground = true, backgroundColor = 0xFF0E1416)
@Composable
private fun BeltBadgePreview() {
    AzfTheme {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            BeltBadge(tier = null)
            BeltTier.entries.forEach { BeltBadge(tier = it) }
        }
    }
}
