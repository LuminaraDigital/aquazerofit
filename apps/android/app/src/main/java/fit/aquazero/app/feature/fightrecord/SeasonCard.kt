package fit.aquazero.app.feature.fightrecord

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
import androidx.lifecycle.compose.LifecycleResumeEffect
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

/**
 * Season card on the dashboard (AZF-W3-05 US-01), a port of
 * `apps/web/src/components/fightRecord/SeasonCard.tsx`.
 *
 * The season, the belt held and what the next one asks for. Nothing here
 * counts down: days left is a plain sentence, never a ring or a timer, and the
 * bar fills toward the next belt rather than marking days missed. No weight,
 * calorie or body figure appears on this surface.
 *
 * Renders nothing at all until a snapshot says the feature is on: not while
 * loading, not on a failed fetch, not when off. Most accounts are off during
 * the rollout, and a skeleton that collapses, or a retry for a feature the
 * account does not have, would make the dark launch visible; the web card
 * renders nothing in the same states for the same reason. The dashboard owns
 * only the slot and hands its spacing in through [modifier], so when the card
 * is absent, so is its gap.
 *
 * Refreshes on every resume, so a season that rolled over while the app was
 * in the background, or a feature switched on since, shows up on return; the
 * ViewModel also refetches when the outbox empties, which is when a log made
 * on the dashboard has reached the server and can count.
 *
 * Display-only on Android (R1a): no celebration sheet and no share here; the
 * Fight Record screen holds the one share action.
 */
@Composable
fun SeasonCard(
    onOpenFightRecord: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: FightRecordViewModel = hiltViewModel(),
) {
    LifecycleResumeEffect(viewModel) {
        viewModel.refresh()
        onPauseOrDispose { }
    }
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val record = (state as? FightRecordUiState.Ready)?.record
    if (record != null) {
        SeasonCardContent(record = record, onOpenFightRecord = onOpenFightRecord, modifier = modifier)
    }
}

/** Stateless body for a record that exists — the only state the card draws. */
@Composable
internal fun SeasonCardContent(
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
            BeltBadge(
                tier = current.tier,
                width = 56.dp,
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

@Preview(showBackground = true, backgroundColor = 0xFF0E1416)
@Composable
private fun SeasonCardPreview() {
    AzfTheme {
        Column(Modifier.padding(16.dp)) {
            SeasonCardContent(
                record = FightRecordStatusDto(
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
                onOpenFightRecord = {},
            )
        }
    }
}
