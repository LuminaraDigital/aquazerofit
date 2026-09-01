package fit.aquazero.app.core.designsystem

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp

/**
 * Card tiers (plan §5): Hero (highest surface + stronger border glow),
 * Standard (default card), Compact (tight padding for dense lists).
 */
enum class AzfCardTier { Hero, Standard, Compact }

/**
 * The Deep Sea card: tonal surface, 1dp outline border, 20dp radius.
 * Elevation is tonal layering, never a heavy shadow.
 */
@Composable
fun AzfCard(
    modifier: Modifier = Modifier,
    tier: AzfCardTier = AzfCardTier.Standard,
    content: @Composable ColumnScope.() -> Unit,
) {
    val background = when (tier) {
        AzfCardTier.Hero -> MaterialTheme.colorScheme.surfaceContainer
        AzfCardTier.Standard -> MaterialTheme.colorScheme.surfaceContainerLow
        AzfCardTier.Compact -> MaterialTheme.colorScheme.surfaceContainerLow
    }
    val borderColor = when (tier) {
        AzfCardTier.Hero -> LocalAzfExtended.current.ringTrack
        else -> MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f)
    }
    val padding = when (tier) {
        AzfCardTier.Compact -> 12.dp
        else -> AzfSpacing.CardPadding
    }
    Column(
        modifier = modifier
            .clip(AzfShapes.Card)
            .background(background)
            .border(BorderStroke(1.dp, borderColor), AzfShapes.Card)
            .padding(padding),
        content = content,
    )
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416)
@Composable
private fun AzfCardPreview() {
    AzfTheme {
        Column(Modifier.padding(16.dp)) {
            AzfCard(tier = AzfCardTier.Hero) {
                Text("HERO CARD", style = MaterialTheme.typography.headlineMedium, color = Color.White)
            }
            AzfCard(tier = AzfCardTier.Standard, modifier = Modifier.padding(top = 12.dp)) {
                Text("Standard card", style = MaterialTheme.typography.bodyMedium)
            }
            AzfCard(tier = AzfCardTier.Compact, modifier = Modifier.padding(top = 12.dp)) {
                Text("Compact card", style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}
