package fit.aquazero.app.core.designsystem

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import fit.aquazero.app.core.common.MealTrust

/** One-tap cooking-fat presets from [MealTrust.cookingFatPresets]. */
@Composable
fun CookingFatPresetsRow(
    onPresetClick: (MealTrust.CookingFatPreset) -> Unit,
    modifier: Modifier = Modifier,
) {
    FlowRow(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        modifier = modifier,
    ) {
        MealTrust.cookingFatPresets.forEach { preset ->
            AzfChip(
                text = preset.label,
                selected = false,
                onClick = { onPresetClick(preset) },
            )
        }
    }
}
