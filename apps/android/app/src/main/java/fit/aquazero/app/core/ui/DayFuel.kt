package fit.aquazero.app.core.ui

import androidx.annotation.StringRes
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import fit.aquazero.app.R
import fit.aquazero.app.core.common.LocalDailyNutrition
import fit.aquazero.app.core.designsystem.AzfMotion
import fit.aquazero.app.core.designsystem.AzfShapes
import fit.aquazero.app.core.designsystem.DataLarge
import fit.aquazero.app.core.designsystem.LocalAzfExtended
import fit.aquazero.app.core.designsystem.RingProgress
import fit.aquazero.app.core.designsystem.rememberCountUp
import fit.aquazero.app.core.designsystem.rememberReducedMotion

private const val MACRO_FILL_MS = 800

/** Fuel left for the day, or protein left when protein leads. Numbers count up. */
@Composable
fun FuelRing(
    nutrition: LocalDailyNutrition,
    proteinFirst: Boolean = false,
    size: Dp = 132.dp,
) {
    val extended = LocalAzfExtended.current
    val progress = if (proteinFirst) {
        NutritionFormat.clampFraction(nutrition.proteinConsumed, nutrition.proteinTarget)
    } else {
        NutritionFormat.clampFraction(nutrition.kcalConsumed, nutrition.kcalTarget)
    }
    val remaining = if (proteinFirst) {
        nutrition.proteinTarget - nutrition.proteinConsumed
    } else {
        nutrition.kcalRemaining
    }
    val shown = rememberCountUp(remaining.coerceAtLeast(0.0).toInt())
    val description = if (proteinFirst) {
        stringResource(
            R.string.dashboard_protein_cd,
            NutritionFormat.fmt1(nutrition.proteinConsumed),
            NutritionFormat.fmt1(nutrition.proteinTarget),
        )
    } else {
        stringResource(
            R.string.dashboard_calories_cd,
            NutritionFormat.fmtInt(nutrition.kcalConsumed),
            NutritionFormat.fmtInt(nutrition.kcalTarget),
        )
    }
    RingProgress(
        progress = progress,
        size = size,
        strokeWidth = 10.dp,
        color = if (proteinFirst) extended.secondaryFixedDim else extended.primaryFixedDim,
        modifier = Modifier.semantics { contentDescription = description },
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.clearAndSetSemantics { },
        ) {
            Text(
                text = NutritionFormat.fmtInt(shown.toDouble()),
                style = DataLarge,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
            )
            Text(
                text = stringResource(
                    if (proteinFirst) R.string.dashboard_protein_left else R.string.dashboard_kcal_left,
                ).uppercase(),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
        }
    }
}

/** Protein green, carbs aqua, fat coral: fixed macro semantics, never re-themed. */
@Composable
fun MacroMiniBars(nutrition: LocalDailyNutrition, modifier: Modifier = Modifier) {
    val extended = LocalAzfExtended.current
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        MiniMacro(
            labelRes = R.string.macro_protein,
            consumed = nutrition.proteinConsumed,
            target = nutrition.proteinTarget,
            color = extended.secondaryFixedDim,
        )
        MiniMacro(
            labelRes = R.string.macro_carbs,
            consumed = nutrition.carbsConsumed,
            target = nutrition.carbsTarget,
            color = extended.primaryFixedDim,
        )
        MiniMacro(
            labelRes = R.string.macro_fat,
            consumed = nutrition.fatConsumed,
            target = nutrition.fatTarget,
            color = extended.coral,
        )
    }
}

@Composable
private fun MiniMacro(@StringRes labelRes: Int, consumed: Double, target: Double, color: Color) {
    val reducedMotion = rememberReducedMotion()
    val fill by animateFloatAsState(
        targetValue = NutritionFormat.clampFraction(consumed, target),
        animationSpec = tween(if (reducedMotion) 0 else MACRO_FILL_MS, easing = AzfMotion.RevealEasing),
        label = "miniMacro",
    )
    Column {
        Row(modifier = Modifier.fillMaxWidth()) {
            Text(
                text = stringResource(labelRes),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.weight(1f),
            )
            Text(
                text = "${NutritionFormat.fmtInt(consumed)}/${NutritionFormat.fmtInt(target)}g",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Spacer(Modifier.height(4.dp))
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(6.dp)
                .clip(AzfShapes.Pill)
                .background(color.copy(alpha = 0.18f)),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(fill)
                    .height(6.dp)
                    .clip(AzfShapes.Pill)
                    .background(color),
            )
        }
    }
}
