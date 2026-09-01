package fit.aquazero.app.feature.dashboard

import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import fit.aquazero.app.R
import fit.aquazero.app.core.common.LocalDailyNutrition
import fit.aquazero.app.core.designsystem.AzfCard
import fit.aquazero.app.core.designsystem.AzfSpacing
import fit.aquazero.app.core.model.DerivedTargetsDto
import kotlin.math.abs

/**
 * Daily Energy Loop: energy equation + adaptive delta.
 *
 * Coach voice moved to [DashboardCoachCard]. Numbers remain code-calculated.
 */
@Composable
internal fun DailyEnergyLoopCard(
    nutrition: LocalDailyNutrition,
    kcalBurned: Double,
    targets: DerivedTargetsDto?,
    onExplainTarget: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    AzfCard(modifier = modifier.fillMaxWidth()) {
        if (targets?.adaptiveEnabled == true && targets.adaptationKcal != null) {
            val delta = targets.adaptationKcal
            val sign = if (delta >= 0) "+" else "−"
            Text(
                text = stringResource(
                    R.string.energy_loop_adaptive_delta,
                    sign,
                    NutritionFormat.fmtInt(abs(delta)),
                ),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.primary,
            )
            targets.adaptiveReasoning?.takeIf { it.isNotBlank() }?.let { reasoning ->
                Spacer(Modifier.height(4.dp))
                Text(
                    text = reasoning,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(Modifier.height(AzfSpacing.ElementGapSmall))
        }

        CalorieDerivationRow(nutrition = nutrition, kcalBurned = kcalBurned)

        if (onExplainTarget != null && targets != null) {
            Spacer(Modifier.height(4.dp))
            TextButton(onClick = onExplainTarget) {
                Text(text = stringResource(R.string.target_explain_link))
            }
        }
    }
}
