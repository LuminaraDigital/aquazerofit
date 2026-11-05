package fit.aquazero.app.core.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import fit.aquazero.app.R
import fit.aquazero.app.core.designsystem.AzfSpacing
import fit.aquazero.app.core.designsystem.AzfStatRow
import fit.aquazero.app.core.designsystem.DataLarge
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
                .padding(horizontal = AzfSpacing.ContainerMargin)
                .padding(bottom = AzfSpacing.SectionGap),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = stringResource(R.string.target_explain_title).uppercase(),
                    style = MaterialTheme.typography.headlineMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.weight(1f).semantics { heading() },
                )
                IconButton(onClick = onDismiss, modifier = Modifier.size(AzfSpacing.TouchTarget)) {
                    Icon(
                        imageVector = Icons.Outlined.Close,
                        contentDescription = stringResource(R.string.action_close),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            Spacer(Modifier.height(AzfSpacing.ElementGapSmall))
            val kcal = "kcal"
            AzfStatRow(label = stringResource(R.string.target_explain_bmr), value = "${targets.bmr}", unit = kcal)
            AzfStatRow(label = stringResource(R.string.target_explain_tdee), value = "${targets.tdee}", unit = kcal)
            if (targets.adaptiveEnabled == true && targets.adaptationKcal != null) {
                AzfStatRow(
                    label = stringResource(R.string.target_explain_adaptive),
                    value = "${targets.adaptationKcal}",
                    unit = kcal,
                )
            }
            AzfStatRow(
                label = stringResource(R.string.target_explain_goal),
                value = "${targets.kcalTarget}",
                unit = kcal,
                valueStyle = DataLarge,
                divider = false,
            )
            targets.adaptiveReasoning?.takeIf { it.isNotBlank() }?.let { reasoning ->
                Spacer(Modifier.height(AzfSpacing.ElementGapSmall))
                Text(
                    text = reasoning,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (targets.clamped && targets.clampReason != null) {
                Spacer(Modifier.height(AzfSpacing.ElementGapSmall))
                Text(
                    text = targets.clampReason,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}
