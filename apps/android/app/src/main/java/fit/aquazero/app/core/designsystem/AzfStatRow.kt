package fit.aquazero.app.core.designsystem

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp

/**
 * One line of a tale-of-the-tape block (docs/design.md): the label in
 * condensed capitals on the left, the figure in tabular numerals on the
 * right with its unit attached, and a hairline beneath. TalkBack reads the
 * row once, as "label: value unit".
 */
@Composable
fun AzfStatRow(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
    unit: String? = null,
    valueStyle: TextStyle = DataMedium,
    valueColor: Color = MaterialTheme.colorScheme.onSurface,
    divider: Boolean = true,
) {
    val spoken = listOfNotNull("$label: $value", unit).joinToString(" ")
    Column(modifier = modifier.fillMaxWidth().clearAndSetSemantics { contentDescription = spoken }) {
        Row(
            modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).padding(vertical = 8.dp),
            verticalAlignment = Alignment.Bottom,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                text = label.uppercase(),
                style = StatLabel,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.weight(1f).padding(end = 12.dp, bottom = 4.dp),
            )
            Text(text = value, style = valueStyle, color = valueColor)
            if (unit != null) {
                Text(
                    text = unit,
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(start = 4.dp, bottom = 2.dp),
                )
            }
        }
        if (divider) HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416)
@Composable
private fun AzfStatRowPreview() {
    AzfTheme {
        Column(Modifier.padding(16.dp)) {
            AzfStatRow(label = "Left today", value = "1,240", unit = "kcal", valueStyle = Scoreboard)
            AzfStatRow(label = "Protein", value = "92", unit = "g")
            AzfStatRow(label = "Water", value = "1.5", unit = "L", divider = false)
        }
    }
}
