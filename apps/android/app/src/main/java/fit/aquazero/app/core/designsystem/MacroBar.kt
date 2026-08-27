package fit.aquazero.app.core.designsystem

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp

/**
 * One macro's progress: label + tabular value over a rounded-cap linear bar
 * on the ring-track color. Fully-rounded ends mimic fluid flow (DESIGN.md).
 */
@Composable
fun MacroBar(
    label: String,
    consumed: Double,
    target: Double,
    color: Color,
    modifier: Modifier = Modifier,
    unit: String = "g",
) {
    val reducedMotion = rememberReducedMotion()
    val fraction = if (target > 0) (consumed / target).toFloat().coerceIn(0f, 1f) else 0f
    val animated by animateFloatAsState(
        targetValue = fraction,
        animationSpec = if (reducedMotion) tween(0) else tween(600, easing = AzfMotion.RevealEasing),
        label = "macroFill",
    )
    Column(modifier = modifier.fillMaxWidth()) {
        Row(modifier = Modifier.fillMaxWidth()) {
            Text(
                text = label,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.weight(1f),
            )
            Text(
                text = "${consumed.toInt()} / ${target.toInt()}$unit",
                style = DataSmall,
                color = MaterialTheme.colorScheme.onSurface,
            )
        }
        Box(
            modifier = Modifier
                .padding(top = 6.dp)
                .fillMaxWidth()
                .height(8.dp)
                .clip(AzfShapes.Pill)
                .background(LocalAzfExtended.current.ringTrack),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(animated)
                    .fillMaxHeight()
                    .clip(AzfShapes.Pill)
                    .background(color),
            )
        }
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416)
@Composable
private fun MacroBarPreview() {
    AzfTheme {
        Column(Modifier.padding(16.dp)) {
            MacroBar(label = "PROTEIN", consumed = 92.0, target = 140.0, color = AzfColors.SecondaryFixedDim)
            MacroBar(
                label = "CARBS",
                consumed = 180.0,
                target = 220.0,
                color = AzfColors.PrimaryFixedDim,
                modifier = Modifier.padding(top = 12.dp),
            )
            MacroBar(
                label = "FAT",
                consumed = 40.0,
                target = 70.0,
                color = AzfColors.Coral,
                modifier = Modifier.padding(top = 12.dp),
            )
        }
    }
}
