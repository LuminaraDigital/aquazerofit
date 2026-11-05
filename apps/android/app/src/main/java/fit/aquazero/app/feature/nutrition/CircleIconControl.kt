package fit.aquazero.app.feature.nutrition

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import fit.aquazero.app.core.designsystem.AzfShapes
import fit.aquazero.app.core.designsystem.AzfSpacing
import fit.aquazero.app.core.designsystem.pressScale

/**
 * The one icon control of the nutrition area: a 48dp circle with a hairline
 * ring. Day chevrons, the per-meal add button and the camera controls all use
 * it, so a tap target never changes size or shape from screen to screen.
 * Defaults suit a normal surface; the camera passes its own overlay colours.
 */
@Composable
internal fun CircleIconControl(
    icon: ImageVector,
    contentDescription: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    tint: Color = MaterialTheme.colorScheme.onSurface,
    container: Color = Color.Transparent,
    ring: Color = MaterialTheme.colorScheme.outlineVariant,
) {
    val interaction = remember { MutableInteractionSource() }
    Box(
        modifier = modifier
            .size(AzfSpacing.TouchTarget)
            .alpha(if (enabled) 1f else 0.4f)
            .pressScale(interaction)
            .clip(AzfShapes.Pill)
            .background(container)
            .border(BorderStroke(1.dp, ring), AzfShapes.Pill)
            .clickable(
                interactionSource = interaction,
                indication = null,
                enabled = enabled,
                role = Role.Button,
                onClick = onClick,
            ),
        contentAlignment = Alignment.Center,
    ) {
        Icon(imageVector = icon, contentDescription = contentDescription, tint = tint)
    }
}
