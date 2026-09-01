package fit.aquazero.app.core.designsystem

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Remove
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import fit.aquazero.app.R

/**
 * Grams stepper: ±10g detents with haptic ticks, clamped to 5–2000g
 * (matching the API's item-gram plausibility bounds). The value renders
 * with tabular figures so live changes never jitter.
 */
@Composable
fun GramsStepper(
    grams: Int,
    onGramsChange: (Int) -> Unit,
    modifier: Modifier = Modifier,
    step: Int = 10,
    min: Int = 5,
    max: Int = 2000,
) {
    val haptics = LocalHapticFeedback.current

    fun nudge(delta: Int) {
        val next = (grams + delta).coerceIn(min, max)
        if (next != grams) {
            haptics.performHapticFeedbackType()
            onGramsChange(next)
        }
    }

    Row(modifier = modifier, verticalAlignment = Alignment.CenterVertically) {
        StepperButton(
            icon = Icons.Outlined.Remove,
            contentDescription = stringResource(R.string.stepper_decrease),
            enabled = grams > min,
            onClick = { nudge(-step) },
        )
        Text(
            text = stringResource(R.string.grams_value, grams),
            style = DataLarge,
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.padding(horizontal = 20.dp),
        )
        StepperButton(
            icon = Icons.Outlined.Add,
            contentDescription = stringResource(R.string.stepper_increase),
            enabled = grams < max,
            onClick = { nudge(step) },
        )
    }
}

private fun androidx.compose.ui.hapticfeedback.HapticFeedback.performHapticFeedbackType() {
    performHapticFeedback(HapticFeedbackType.SegmentTick)
}

@Composable
private fun StepperButton(
    icon: ImageVector,
    contentDescription: String,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    Box(
        modifier = Modifier
            .size(AzfSpacing.TouchTarget)
            .pressScale(interaction)
            .clip(AzfShapes.Pill)
            .background(
                if (enabled) {
                    MaterialTheme.colorScheme.surfaceContainerHigh
                } else {
                    MaterialTheme.colorScheme.surfaceContainerLow
                },
            )
            .clickable(
                interactionSource = interaction,
                indication = null,
                enabled = enabled,
                role = Role.Button,
                onClick = onClick,
            ),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = contentDescription,
            tint = if (enabled) {
                LocalAzfExtended.current.primaryFixedDim
            } else {
                MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f)
            },
        )
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416)
@Composable
private fun GramsStepperPreview() {
    AzfTheme {
        Box(Modifier.padding(16.dp)) {
            GramsStepper(grams = 150, onGramsChange = {})
        }
    }
}
