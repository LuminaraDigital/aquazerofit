package fit.aquazero.app.feature.dashboard

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import fit.aquazero.app.R
import fit.aquazero.app.core.designsystem.PrimaryButton
import fit.aquazero.app.core.model.DerivedTargetsDto

/**
 * Explainable targets sheet: BMR, activity, goal, adaptive delta, safety floor.
 * Numbers come from the server; the coach may narrate but never invent kcal.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TargetExplainSheet(
    targets: DerivedTargetsDto?,
    visible: Boolean,
    onDismiss: () -> Unit,
) {
    if (!visible || targets == null) return
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp)
                .padding(bottom = 32.dp),
        ) {
            Text(
                text = stringResource(R.string.target_explain_title),
                style = MaterialTheme.typography.headlineSmall,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Spacer(Modifier.height(12.dp))
            ExplainRow(
                label = stringResource(R.string.target_explain_bmr),
                value = "${targets.bmr} kcal",
            )
            ExplainRow(
                label = stringResource(R.string.target_explain_tdee),
                value = "${targets.tdee} kcal",
            )
            ExplainRow(
                label = stringResource(R.string.target_explain_goal),
                value = "${targets.kcalTarget} kcal",
            )
            if (targets.adaptiveEnabled == true && targets.adaptationKcal != null) {
                ExplainRow(
                    label = stringResource(R.string.target_explain_adaptive),
                    value = "${targets.adaptationKcal} kcal",
                )
            }
            targets.adaptiveReasoning?.takeIf { it.isNotBlank() }?.let { reasoning ->
                Spacer(Modifier.height(8.dp))
                Text(
                    text = reasoning,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (targets.clamped && targets.clampReason != null) {
                Spacer(Modifier.height(8.dp))
                Text(
                    text = targets.clampReason,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(Modifier.height(16.dp))
            PrimaryButton(
                text = stringResource(R.string.target_explain_close),
                onClick = onDismiss,
            )
        }
    }
}

@Composable
private fun ExplainRow(label: String, value: String) {
    Column(modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurface,
        )
    }
}
