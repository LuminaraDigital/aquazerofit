package fit.aquazero.app.feature.dashboard

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.WaterDrop
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import fit.aquazero.app.R
import fit.aquazero.app.core.designsystem.AzfCard
import fit.aquazero.app.core.designsystem.AzfSpacing
import fit.aquazero.app.core.designsystem.DataSmall
import fit.aquazero.app.core.designsystem.MacroBar
import fit.aquazero.app.core.designsystem.SecondaryButton
import fit.aquazero.app.core.designsystem.Skeleton
import fit.aquazero.app.core.designsystem.WaterDroplets

/**
 * Composites that more than one feature needs.
 *
 * These lived inside feature/dashboard, which meant nutrition had to import
 * the dashboard feature to reuse them. They are domain-aware (they know what
 * a macro and a hydration target are) so they do not belong in
 * `core.designsystem` either - this layer sits between the two.
 */

/** One macro bar with a spoken progress description. */
@Composable
fun MacroRow(
    label: String,
    consumed: Double,
    target: Double,
    color: Color,
    modifier: Modifier = Modifier,
) {
    val description = stringResource(
        R.string.macro_progress_cd,
        label,
        consumed.toInt(),
        target.toInt(),
    )
    MacroBar(
        label = label.uppercase(),
        consumed = consumed,
        target = target,
        color = color,
        modifier = modifier.semantics { contentDescription = description },
    )
}

/**
 * Hydration: eight droplet segments and one-tap +250 ml. The tap is
 * optimistic — the Room write lands before the network is consulted.
 */
@Composable
fun HydrationCard(
    consumedMl: Int,
    targetMl: Int,
    pending: Boolean,
    onLogWater: () -> Unit,
    modifier: Modifier = Modifier,
) {
    AzfCard(modifier = modifier.fillMaxWidth()) {
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Icon(
                imageVector = Icons.Outlined.WaterDrop,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
            )
            Text(
                text = stringResource(R.string.hydration_title).uppercase(),
                style = MaterialTheme.typography.headlineSmall,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier
                    .padding(start = 8.dp)
                    .weight(1f),
            )
            Text(
                text = stringResource(
                    R.string.hydration_litres,
                    NutritionFormat.fmtLitres(consumedMl),
                    NutritionFormat.fmtLitres(targetMl),
                ),
                style = DataSmall,
                color = MaterialTheme.colorScheme.primary,
            )
        }

        Spacer(Modifier.height(AzfSpacing.ElementGapMedium))

        val dropletDescription =
            stringResource(R.string.hydration_droplets_cd, consumedMl, targetMl)
        WaterDroplets(
            filled = NutritionFormat.dropletsFilled(consumedMl, targetMl),
            total = DROPLET_SEGMENTS,
            modifier = Modifier
                .fillMaxWidth()
                .semantics { contentDescription = dropletDescription },
        )

        Spacer(Modifier.height(AzfSpacing.ElementGapMedium))

        val actionLabel = stringResource(R.string.hydration_log_cd)
        SecondaryButton(
            text = stringResource(R.string.hydration_log_increment),
            onClick = onLogWater,
            enabled = !pending,
            modifier = Modifier.semantics { contentDescription = actionLabel },
        )
    }
}

/** Card-shaped skeleton used while the first day loads. */
@Composable
fun CardSkeleton(height: Dp, modifier: Modifier = Modifier) {
    Skeleton(
        modifier = modifier
            .fillMaxWidth()
            .height(height),
        shape = RoundedCornerShape(20.dp),
    )
}

private const val DROPLET_SEGMENTS = 8
