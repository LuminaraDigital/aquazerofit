package fit.aquazero.app.core.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Calculate
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import fit.aquazero.app.R
import fit.aquazero.app.core.designsystem.AzfCard
import fit.aquazero.app.core.designsystem.AzfColors
import fit.aquazero.app.core.designsystem.AzfTheme
import fit.aquazero.app.core.designsystem.PrimaryButton

/**
 * The honest "we do not have your numbers yet" state.
 *
 * Calorie and macro targets come out of the deterministic calculator
 * (Mifflin-St Jeor → activity factor → goal adjustment, clamped to the safety
 * floor). There is no defensible stand-in for that: printing a generic 2,000
 * kcal under the words "your target" would be a health claim about a person the
 * app knows nothing about. So any surface that would otherwise render a target
 * renders this instead — it names what is missing, why it is needed, and how
 * long it takes to supply.
 *
 * "Any surface" is why it sits below the features: first run shows it, Settings
 * shows it in place of the biometrics summary, and anything that later renders
 * a target will need it too. One card keeps that message identical everywhere,
 * without a feature having to import another feature to say it.
 */
@Composable
fun TargetsNotSetCard(
    onSetUp: () -> Unit,
    modifier: Modifier = Modifier,
) {
    AzfCard(modifier = modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.Top) {
            Icon(
                imageVector = Icons.Outlined.Calculate,
                contentDescription = null,
                tint = AzfColors.PrimaryFixedDim,
                modifier = Modifier.size(24.dp),
            )
            Spacer(modifier = Modifier.size(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = stringResource(R.string.targets_not_set_title).uppercase(),
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = stringResource(R.string.targets_not_set_body),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        Spacer(modifier = Modifier.height(16.dp))
        PrimaryButton(
            text = stringResource(R.string.targets_not_set_cta),
            onClick = onSetUp,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = stringResource(R.string.targets_not_set_footnote),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416)
@Composable
private fun TargetsNotSetCardPreview() {
    AzfTheme {
        TargetsNotSetCard(onSetUp = {}, modifier = Modifier.padding(20.dp))
    }
}
