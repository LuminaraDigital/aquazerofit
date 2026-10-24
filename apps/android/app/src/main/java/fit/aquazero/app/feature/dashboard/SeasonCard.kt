package fit.aquazero.app.feature.dashboard

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import fit.aquazero.app.R
import fit.aquazero.app.core.designsystem.AzfCard
import fit.aquazero.app.core.designsystem.AzfShapes
import fit.aquazero.app.core.designsystem.AzfSpacing
import fit.aquazero.app.core.designsystem.AzfTheme
import fit.aquazero.app.core.designsystem.LocalAzfExtended
import fit.aquazero.app.core.model.BeltRungDto
import fit.aquazero.app.core.model.BeltTier
import fit.aquazero.app.core.model.FightRecordSeasonProgressDto
import fit.aquazero.app.core.model.FightRecordStatusDto
import fit.aquazero.app.core.model.SeasonDto
import fit.aquazero.app.core.ui.BeltBadge
import fit.aquazero.app.core.ui.CardSkeleton
import fit.aquazero.app.core.ui.FightRecordUiState
import fit.aquazero.app.core.ui.beltName
import fit.aquazero.app.core.ui.daysLeftText
import fit.aquazero.app.core.ui.nextBeltProgress
import fit.aquazero.app.core.ui.nextBeltText
import fit.aquazero.app.core.ui.seasonDatesText

/**
 * Season card on the dashboard (AZF-W3-05 US-01), a port of
 * `apps/web/src/components/fightRecord/SeasonCard.tsx`.
 *
 * The season, the belt held and what the next one asks for. Nothing here
 * counts down: days left is a plain sentence, never a ring or a timer, and the
 * bar fills toward the next belt rather than marking days missed. No weight,
 * calorie or body figure appears on this surface.
 *
 * Renders nothing at all when Fight Record is off for the account, so a dark
 * launch leaves the dashboard exactly as it was. [modifier] carries the gap
 * above the card for the same reason: when the card is absent, so is its gap.
 *
 * Display-only on Android (R1a): no celebration sheet and no share here; the
 * Fight Record screen holds the one share action.
 */
@Composable
fun SeasonCard(
    onOpenFightRecord: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: SeasonCardViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    SeasonCardContent(
        state = state,
        onRetry = viewModel::refresh,
        onOpenFightRecord = onOpenFightRecord,
        modifier = modifier,
    )
}

/** Stateless body, one branch per state, so each one previews on its own. */
@Composable
internal fun SeasonCardContent(
    state: FightRecordUiState,
    onRetry: () -> Unit,
    onOpenFightRecord: () -> Unit,
    modifier: Modifier = Modifier,
) {
    when (state) {
        FightRecordUiState.Loading -> CardSkeleton(height = 196.dp, modifier = modifier)
        FightRecordUiState.Failed -> SeasonCardRetry(onRetry = onRetry, modifier = modifier)
        FightRecordUiState.Off -> Unit
        is FightRecordUiState.Ready -> SeasonCardBody(
            record = state.record,
            onOpenFightRecord = onOpenFightRecord,
            modifier = modifier,
        )
    }
}

@Composable
private fun SeasonCardBody(
    record: FightRecordStatusDto,
    onOpenFightRecord: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val current = record.current
    val season = current.season
    AzfCard(modifier = modifier.fillMaxWidth()) {
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = stringResource(R.string.fight_record_season_number, season.number).uppercase(),
                    style = MaterialTheme.typography.headlineSmall,
                    color = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.semantics { heading() },
                )
                Text(
                    text = stringResource(R.string.fight_record_season_subtitle, season.name, seasonDatesText(season)),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            // Decorative: the belt is named in full right below it.
            BeltBadge(
                tier = current.tier,
                width = 56.dp,
                decorative = true,
                modifier = Modifier.padding(start = AzfSpacing.ElementGapSmall, top = 4.dp),
            )
        }

        Spacer(Modifier.height(AzfSpacing.ElementGapMedium))
        Text(
            text = beltName(current.tier),
            style = MaterialTheme.typography.titleLarge,
            color = MaterialTheme.colorScheme.onSurface,
        )
        Text(
            text = nextBeltText(current),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        Spacer(Modifier.height(AzfSpacing.ElementGapSmall))
        NextBeltBar(fraction = nextBeltProgress(current))

        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = daysLeftText(current.daysLeft),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.weight(1f),
            )
            TextButton(onClick = onOpenFightRecord) {
                Text(
                    text = stringResource(R.string.fight_record_title),
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
        }
    }
}

/**
 * Progress toward the next belt. Static on purpose — a filling animation on
 * every dashboard visit would read as a meter running — and silent to screen
 * readers, because the sentence above it already says the same thing in words.
 */
@Composable
private fun NextBeltBar(fraction: Float) {
    val fill = LocalAzfExtended.current.primaryFixedDim
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(8.dp)
            .clip(AzfShapes.Pill)
            .background(LocalAzfExtended.current.ringTrack)
            .drawBehind {
                drawRoundRect(
                    color = fill,
                    size = Size(size.width * fraction, size.height),
                    cornerRadius = CornerRadius(size.height / 2f),
                )
            },
    )
}

/**
 * The small retry, shown only when there is no snapshot to fall back on. The
 * dashboard's own [ErrorState][fit.aquazero.app.core.designsystem.ErrorState]
 * is a full-width section; an optional card failing deserves one line.
 */
@Composable
private fun SeasonCardRetry(onRetry: () -> Unit, modifier: Modifier = Modifier) {
    AzfCard(modifier = modifier.fillMaxWidth()) {
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = stringResource(R.string.fight_record_card_error),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.weight(1f),
            )
            TextButton(onClick = onRetry) {
                Text(
                    text = stringResource(R.string.action_retry),
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
        }
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416)
@Composable
private fun SeasonCardPreview() {
    AzfTheme {
        Column(Modifier.padding(16.dp)) {
            SeasonCardContent(
                state = FightRecordUiState.Ready(
                    FightRecordStatusDto(
                        current = FightRecordSeasonProgressDto(
                            season = SeasonDto(
                                id = "season-3",
                                number = 3,
                                name = "Second Wind",
                                startsOn = "2027-03-01",
                                endsOn = "2027-04-25",
                            ),
                            activeDays = 14,
                            daysLeft = 23,
                            tier = BeltTier.BLUE,
                            next = BeltRungDto(tier = BeltTier.PURPLE, activeDays = 24),
                        ),
                    ),
                ),
                onRetry = {},
                onOpenFightRecord = {},
            )
            Spacer(Modifier.height(16.dp))
            SeasonCardContent(state = FightRecordUiState.Failed, onRetry = {}, onOpenFightRecord = {})
        }
    }
}
