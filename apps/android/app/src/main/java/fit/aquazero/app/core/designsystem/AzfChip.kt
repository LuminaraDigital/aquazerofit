package fit.aquazero.app.core.designsystem

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp

/**
 * Pill chip: low-opacity accent fill with full-strength accent text when
 * selected, outline-only when idle. 48dp tall so the whole chip is the touch
 * target, one line, and TalkBack hears whether it is selected. Emits a haptic
 * tick on selection.
 */
@Composable
fun AzfChip(
    text: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val interaction = remember { MutableInteractionSource() }
    val haptics = LocalHapticFeedback.current
    val accent = LocalAzfExtended.current.primaryFixedDim
    Row(
        modifier = modifier
            .heightIn(min = 48.dp)
            .pressScale(interaction)
            .clip(AzfShapes.Pill)
            .background(if (selected) accent.copy(alpha = 0.15f) else MaterialTheme.colorScheme.surfaceContainerLow)
            .border(
                BorderStroke(
                    1.dp,
                    if (selected) accent else MaterialTheme.colorScheme.outlineVariant,
                ),
                AzfShapes.Pill,
            )
            .clickable(
                interactionSource = interaction,
                indication = null,
                role = Role.Button,
            ) {
                haptics.performHapticFeedback(HapticFeedbackType.SegmentTick)
                onClick()
            }
            .semantics { this.selected = selected }
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelLarge,
            color = if (selected) accent else MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
        )
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416)
@Composable
private fun AzfChipPreview() {
    AzfTheme {
        Row(Modifier.padding(16.dp)) {
            AzfChip(text = "High Protein", selected = true, onClick = {})
            AzfChip(text = "Breakfast", selected = false, onClick = {}, modifier = Modifier.padding(start = 8.dp))
        }
    }
}
