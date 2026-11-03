package fit.aquazero.app.core.designsystem

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.invisibleToUser
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import fit.aquazero.app.R
import fit.aquazero.app.core.common.MatchConfidenceBand
import fit.aquazero.app.core.common.MealTrust

/**
 * Confirm-first trust surfaces shared across meal logging paths.
 * Copy and thresholds live in [MealTrust]; this file is presentation only.
 */
enum class MealTrustBannerTone {
    Caution,
    Info,
}

@Composable
fun MealTrustBanner(
    text: String,
    modifier: Modifier = Modifier,
    tone: MealTrustBannerTone = MealTrustBannerTone.Caution,
    contentDescription: String? = null,
) {
    val colors = when (tone) {
        MealTrustBannerTone.Caution -> {
            val coral = LocalAzfExtended.current.coral
            coral to coral.copy(alpha = 0.10f)
        }
        MealTrustBannerTone.Info -> {
            val accent = LocalAzfExtended.current.secondaryFixedDim
            accent to accent.copy(alpha = 0.10f)
        }
    }
    val a11yLabel = contentDescription ?: text
    Box(
        modifier = modifier
            .fillMaxWidth()
            .clip(AzfShapes.Inner)
            .background(colors.second)
            .border(BorderStroke(1.dp, colors.first.copy(alpha = 0.5f)), AzfShapes.Inner)
            .semantics { this.contentDescription = a11yLabel }
            .padding(horizontal = 12.dp, vertical = 10.dp),
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.semantics { invisibleToUser() },
        )
    }
}

@Composable
fun FatCautionBanner(modifier: Modifier = Modifier) {
    MealTrustBanner(
        text = stringResource(R.string.trust_fat_caution),
        modifier = modifier,
        tone = MealTrustBannerTone.Caution,
        contentDescription = stringResource(R.string.trust_fat_caution_cd),
    )
}

@Composable
fun ConfidenceBandChip(
    score: Int,
    modifier: Modifier = Modifier,
) {
    val band = MealTrust.confidenceBandFromScore(score)
    val label = MealTrust.confidenceBandLabel(band)
    val cd = stringResource(R.string.trust_confidence_cd, label, score)
    val toneColor = when (band) {
        MatchConfidenceBand.HIGH -> LocalAzfExtended.current.secondaryFixedDim
        MatchConfidenceBand.MODERATE -> LocalAzfExtended.current.primaryFixedDim
        MatchConfidenceBand.LOW -> LocalAzfExtended.current.coral
    }
    Text(
        text = stringResource(R.string.trust_confidence_band, label, score),
        style = MaterialTheme.typography.labelMedium,
        color = toneColor,
        modifier = modifier.semantics { contentDescription = cd },
    )
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416)
@Composable
private fun MealTrustBannerPreview() {
    AzfTheme {
        FatCautionBanner(Modifier.padding(16.dp))
    }
}
