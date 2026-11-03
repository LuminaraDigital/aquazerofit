package fit.aquazero.app.core.designsystem

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Size
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
    // A `State<Float>`, not a `by` delegate: the fill is read inside the draw
    // lambda below. It used to feed `fillMaxWidth(animated)`, so all 600ms of
    // it recomposed, remeasured and relaid out the bar on every frame — three
    // of these per hero card, on two screens, on every meal logged.
    val animated = animateFloatAsState(
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
                .background(LocalAzfExtended.current.ringTrack)
                // Drawn rather than scaled. `graphicsLayer { scaleX }` would
                // also be draw-phase, but it squashes the pill's caps with the
                // bar: at a tenth full the 4dp right cap becomes 0.4dp, and a
                // rounded-cap bar reading as a square-ended one is the one
                // thing DESIGN.md asks this component not to do. A rounded
                // rect keeps the caps circular at every fraction.
                .drawWithCache {
                    val cap = CornerRadius(size.height / 2f)
                    onDrawBehind {
                        drawRoundRect(
                            color = color,
                            size = Size(size.width * animated.value, size.height),
                            cornerRadius = cap,
                        )
                    }
                },
        )
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
