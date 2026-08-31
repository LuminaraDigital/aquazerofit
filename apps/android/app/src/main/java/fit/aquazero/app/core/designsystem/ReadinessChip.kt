package fit.aquazero.app.core.designsystem

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.TrendingUp
import androidx.compose.material.icons.outlined.Balance
import androidx.compose.material.icons.outlined.ExpandLess
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.Shield
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import fit.aquazero.app.R
import fit.aquazero.app.core.model.ReadinessAssessmentDto
import fit.aquazero.app.core.model.ReadinessMode

/**
 * Readiness week chip (Protect / Maintain / Progress).
 *
 * All three modes share calm aqua styling. Protect is never dressed as an alarm.
 * Mirrors web [ReadinessChip.tsx].
 */
@Composable
fun ReadinessChip(
    readiness: ReadinessAssessmentDto?,
    loading: Boolean = false,
    modifier: Modifier = Modifier,
) {
    if (loading) {
        Skeleton(
            modifier = modifier
                .fillMaxWidth()
                .height(64.dp),
            shape = AzfShapes.Card,
        )
        return
    }
    if (readiness == null) return

    var expanded by remember(readiness) { mutableStateOf(false) }
    val copy = readinessModeCopy(readiness.mode)
    val hasSignals = readiness.signals.isNotEmpty()
    val toggleLabel = if (expanded) {
        stringResource(R.string.readiness_hide_why)
    } else {
        stringResource(R.string.readiness_show_why)
    }

    AzfCard(modifier = modifier.fillMaxWidth()) {
        val summaryModifier = Modifier.fillMaxWidth()
        if (hasSignals) {
            Row(
                modifier = summaryModifier
                    .clickable { expanded = !expanded }
                    .semantics {
                        contentDescription = "${copy.label} week. ${readiness.headline}"
                    },
                verticalAlignment = Alignment.CenterVertically,
            ) {
                ReadinessSummary(copy = copy, headline = readiness.headline, modifier = Modifier.weight(1f))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = toggleLabel,
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.primary,
                    )
                    Icon(
                        imageVector = if (expanded) Icons.Outlined.ExpandLess else Icons.Outlined.ExpandMore,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(18.dp),
                    )
                }
            }
        } else {
            Row(
                modifier = summaryModifier.semantics {
                    contentDescription = "${copy.label} week. ${readiness.headline}"
                },
                verticalAlignment = Alignment.CenterVertically,
            ) {
                ReadinessSummary(copy = copy, headline = readiness.headline, modifier = Modifier.weight(1f))
            }
        }

        if (hasSignals && expanded) {
            Spacer(Modifier.height(12.dp))
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 4.dp),
            ) {
                readiness.signals.forEach { signal ->
                    Text(
                        text = signal.label,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    Text(
                        text = signal.detail,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(8.dp))
                }
            }
        }
    }
}

@Composable
private fun ReadinessSummary(
    copy: ReadinessModeCopy,
    headline: String,
    modifier: Modifier = Modifier,
) {
    Row(modifier = modifier, verticalAlignment = Alignment.CenterVertically) {
        Icon(
            imageVector = copy.icon,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier
                .size(36.dp)
                .padding(end = 12.dp),
        )
        Column {
            Text(
                text = stringResource(R.string.readiness_week_label, copy.label).uppercase(),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.primary,
            )
            Text(
                text = headline,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
        }
    }
}

private data class ReadinessModeCopy(val label: String, val icon: ImageVector)

@Composable
private fun readinessModeCopy(mode: ReadinessMode): ReadinessModeCopy = when (mode) {
    ReadinessMode.PROTECT -> ReadinessModeCopy(
        label = stringResource(R.string.readiness_mode_protect),
        icon = Icons.Outlined.Shield,
    )
    ReadinessMode.MAINTAIN -> ReadinessModeCopy(
        label = stringResource(R.string.readiness_mode_maintain),
        icon = Icons.Outlined.Balance,
    )
    ReadinessMode.PROGRESS -> ReadinessModeCopy(
        label = stringResource(R.string.readiness_mode_progress),
        icon = Icons.AutoMirrored.Outlined.TrendingUp,
    )
}
