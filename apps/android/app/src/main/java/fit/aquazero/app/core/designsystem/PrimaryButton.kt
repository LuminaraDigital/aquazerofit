package fit.aquazero.app.core.designsystem

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp

/**
 * Primary CTA: a flat aqua fill with dark ink (10.1:1), press-scale feedback
 * (0.97) and a 56dp minimum height. One per view (docs/design.md).
 */
@Composable
fun PrimaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    loading: Boolean = false,
) {
    val interaction = remember { MutableInteractionSource() }
    // Disabled sits two steps above any card or sheet, so it still reads as a
    // button that is not ready yet rather than vanishing into a sheet.
    val fill = if (enabled) {
        LocalAzfExtended.current.primaryFixedDim
    } else {
        MaterialTheme.colorScheme.surfaceContainerHighest
    }
    Box(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = 56.dp)
            .pressScale(interaction)
            .clip(AzfShapes.Inner)
            .background(fill)
            .clickable(
                interactionSource = interaction,
                indication = null,
                enabled = enabled && !loading,
                role = Role.Button,
                onClick = onClick,
            ),
        contentAlignment = Alignment.Center,
    ) {
        if (loading) {
            CircularProgressIndicator(
                modifier = Modifier.padding(8.dp),
                color = AzfColors.OnPrimaryFixed,
                strokeWidth = 2.dp,
            )
        } else {
            Text(
                text = text,
                style = MaterialTheme.typography.titleMedium,
                // Disabled is a different surface, not a dimmed accent, so
                // "not yet" never reads as "press me".
                color = if (enabled) AzfColors.OnPrimaryFixed else MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 24.dp, vertical = 16.dp),
            )
        }
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416)
@Composable
private fun PrimaryButtonPreview() {
    AzfTheme {
        Box(Modifier.padding(16.dp)) {
            PrimaryButton(text = "Get Started", onClick = {})
        }
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416)
@Composable
private fun PrimaryButtonLoadingPreview() {
    AzfTheme {
        Box(Modifier.padding(16.dp)) {
            PrimaryButton(text = "Get Started", onClick = {}, loading = true)
        }
    }
}
