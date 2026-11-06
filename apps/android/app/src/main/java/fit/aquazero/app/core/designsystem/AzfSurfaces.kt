package fit.aquazero.app.core.designsystem

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateIntAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

private const val COUNT_UP_MS = 700
private const val LEAD_EDGE_ALPHA = 0.4f

/**
 * The lead card on a screen: one tonal step above [AzfCard] with a quiet aqua
 * hairline. Use it once per view, so it keeps meaning "start here". It is
 * flat on purpose (docs/design.md, "What this retires").
 */
@Composable
fun AzfHeroSurface(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    contentPadding: Dp = AzfSpacing.CardPadding,
    content: @Composable ColumnScope.() -> Unit,
) {
    val edge = LocalAzfExtended.current.primaryFixedDim.copy(alpha = LEAD_EDGE_ALPHA)
    val interaction = remember { MutableInteractionSource() }
    Column(
        modifier = modifier
            .fillMaxWidth()
            .pressScale(interaction)
            .clip(AzfShapes.Card)
            .background(MaterialTheme.colorScheme.surfaceContainer)
            .border(BorderStroke(1.dp, edge), AzfShapes.Card)
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
 * A frame whose edge turns aqua while [active], for the surface that is
 * waiting on the user or working for them. The change is a short colour
 * confirmation, not a loop: a frame that keeps moving says nothing new.
 */
@Composable
fun ActiveFrame(
    active: Boolean,
    modifier: Modifier = Modifier,
    shape: Shape = AzfShapes.Inner,
    idleEdge: Color = MaterialTheme.colorScheme.outlineVariant,
    content: @Composable BoxScope.() -> Unit,
) {
    val reducedMotion = rememberReducedMotion()
    val edge by animateColorAsState(
        targetValue = if (active) LocalAzfExtended.current.primaryFixedDim else idleEdge,
        animationSpec = tween(if (reducedMotion) 0 else AzfMotion.ConfirmDurationMs),
        label = "activeEdge",
    )
    Box(
        modifier = modifier.border(BorderStroke(if (active) 1.5.dp else 1.dp, edge), shape),
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
