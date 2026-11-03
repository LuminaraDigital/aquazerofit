package fit.aquazero.app.core.designsystem

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.animateIntAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.sin

private const val AURA_AQUA_ALPHA = 0.20f
private const val AURA_MINT_ALPHA = 0.12f
private const val GLOW_TURN_MS = 5200
private const val COUNT_UP_MS = 700

/**
 * Brand light pooled behind a screen's first fold. Static on purpose: it costs
 * one draw, and the things that move on these screens should be the user's own
 * numbers.
 */
@Composable
fun AquaAura(modifier: Modifier = Modifier, height: Dp = 360.dp) {
    val aqua = LocalAzfExtended.current.primaryFixedDim
    val mint = LocalAzfExtended.current.secondaryFixedDim
    Canvas(modifier = modifier.fillMaxWidth().height(height)) {
        drawRect(
            brush = Brush.radialGradient(
                colors = listOf(aqua.copy(alpha = AURA_AQUA_ALPHA), Color.Transparent),
                center = Offset(size.width * 0.12f, 0f),
                radius = size.height,
            ),
        )
        drawRect(
            brush = Brush.radialGradient(
                colors = listOf(mint.copy(alpha = AURA_MINT_ALPHA), Color.Transparent),
                center = Offset(size.width * 0.95f, 0f),
                radius = size.height * 0.8f,
            ),
        )
    }
}

/**
 * The one lit surface on a screen: a tinted gradient fill and a gradient
 * hairline, a step above [AzfCard]'s Hero tier. Use it once per view, so it
 * keeps meaning "start here".
 */
@Composable
fun AzfHeroSurface(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    contentPadding: Dp = AzfSpacing.CardPadding,
    content: @Composable ColumnScope.() -> Unit,
) {
    val extended = LocalAzfExtended.current
    val interaction = remember { MutableInteractionSource() }
    val fill = Brush.linearGradient(
        colors = listOf(
            extended.primaryFixedDim.copy(alpha = 0.22f),
            extended.secondaryFixedDim.copy(alpha = 0.08f),
            Color.Transparent,
        ),
    )
    val edge = Brush.linearGradient(
        colors = listOf(
            extended.primaryFixedDim.copy(alpha = 0.5f),
            MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.3f),
        ),
    )
    Column(
        modifier = modifier
            .fillMaxWidth()
            .pressScale(interaction)
            .clip(AzfShapes.Hero)
            .background(MaterialTheme.colorScheme.surfaceContainer)
            .background(fill)
            .border(BorderStroke(1.dp, edge), AzfShapes.Hero)
            .then(
                if (onClick != null) {
                    Modifier.clickable(
                        interactionSource = interaction,
                        indication = null,
                        role = Role.Button,
                        onClick = onClick,
                    )
                } else {
                    Modifier
                },
            )
            .padding(contentPadding),
        content = content,
    )
}

/**
 * A frame whose edge lights up and slowly turns while [active], for the
 * surface that is waiting on the user or working for them. Under reduced motion
 * the edge still lights, it just holds still.
 *
 * The rotation is read in the draw phase, so a turn repaints the frame and
 * recomposes nothing inside it.
 */
@Composable
fun GlowFrame(
    active: Boolean,
    modifier: Modifier = Modifier,
    shape: Shape = AzfShapes.Inner,
    idleEdge: Color = MaterialTheme.colorScheme.outlineVariant,
    content: @Composable BoxScope.() -> Unit,
) {
    val extended = LocalAzfExtended.current
    val reducedMotion = rememberReducedMotion()
    val turn = remember { Animatable(0f) }
    val lit by animateFloatAsState(
        targetValue = if (active) 1f else 0f,
        animationSpec = tween(if (reducedMotion) 0 else AzfMotion.ConfirmDurationMs),
        label = "glowLit",
    )
    LaunchedEffect(active, reducedMotion) {
        if (active && !reducedMotion) {
            turn.animateTo(
                targetValue = FULL_TURN_RADIANS,
                animationSpec = infiniteRepeatable(
                    animation = tween(GLOW_TURN_MS, easing = LinearEasing),
                    repeatMode = RepeatMode.Restart,
                ),
            )
        }
    }
    Box(
        modifier = modifier.drawWithContent {
            drawContent()
            val outline = shape.createOutline(size, layoutDirection, this)
            val strokePx = 1.dp.toPx()
            drawOutline(outline, idleEdge.copy(alpha = idleEdge.alpha * (1f - lit)), style = Stroke(strokePx))
            if (lit > 0f) {
                val radius = max(size.width, size.height) / 2f
                val centre = Offset(size.width / 2f, size.height / 2f)
                val axis = Offset(cos(turn.value), sin(turn.value)) * radius
                val brush = Brush.linearGradient(
                    colors = listOf(extended.primaryFixedDim, extended.secondaryFixedDim, extended.primaryFixedDim),
                    start = centre - axis,
                    end = centre + axis,
                )
                drawOutline(outline, brush, alpha = lit * 0.25f, style = Stroke(strokePx * 5f))
                drawOutline(outline, brush, alpha = lit, style = Stroke(strokePx * 1.5f))
            }
        },
        content = content,
    )
}

/** Counts up to [target] when it changes; lands at once under reduced motion. */
@Composable
fun rememberCountUp(target: Int): Int {
    val reducedMotion = rememberReducedMotion()
    val value by animateIntAsState(
        targetValue = target,
        animationSpec = tween(if (reducedMotion) 0 else COUNT_UP_MS, easing = AzfMotion.RevealEasing),
        label = "countUp",
    )
    return value
}

private const val FULL_TURN_RADIANS = (2.0 * Math.PI).toFloat()
