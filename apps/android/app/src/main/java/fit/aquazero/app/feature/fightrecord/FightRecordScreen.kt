package fit.aquazero.app.feature.fightrecord

import android.content.Context
import android.content.Intent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.SportsMartialArts
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import fit.aquazero.app.BuildConfig
import fit.aquazero.app.R
import fit.aquazero.app.core.designsystem.AzfAppHeader
import fit.aquazero.app.core.designsystem.AzfCard
import fit.aquazero.app.core.designsystem.AzfCardTier
import fit.aquazero.app.core.designsystem.AzfShapes
import fit.aquazero.app.core.designsystem.AzfSpacing
import fit.aquazero.app.core.designsystem.AzfTheme
import fit.aquazero.app.core.designsystem.EmptyState
import fit.aquazero.app.core.designsystem.ErrorState
import fit.aquazero.app.core.designsystem.PrimaryButton
import fit.aquazero.app.core.designsystem.Skeleton
import fit.aquazero.app.core.model.BeltAwardDto
import fit.aquazero.app.core.model.BeltRungDto
import fit.aquazero.app.core.model.BeltTier
import fit.aquazero.app.core.model.FightRecordSeasonProgressDto
import fit.aquazero.app.core.model.FightRecordStatusDto
import fit.aquazero.app.core.model.SeasonDto
import fit.aquazero.app.core.ui.BeltBadge
import fit.aquazero.app.core.ui.FightRecordUiState
import fit.aquazero.app.core.ui.beltName
import fit.aquazero.app.core.ui.beltNameRes
import fit.aquazero.app.core.ui.currentSeasonBelt
import fit.aquazero.app.core.ui.daysLeftText
import fit.aquazero.app.core.ui.isRungHeld
import fit.aquazero.app.core.ui.nextBeltText
import fit.aquazero.app.core.ui.seasonDatesText

/**
 * Fight Record (AZF-W3-05 US-09), a port of
 * `apps/web/src/pages/fightRecord/FightRecord.tsx`: the season, the full belt
 * ladder and a shelf with the highest belt from every season.
 *
 * The page explains the rules in one paragraph and then shows them, because a
 * mechanic people cannot predict feels arbitrary, and an arbitrary reward is a
 * slot machine with better manners. Every rung shows its threshold up front.
 *
 * Display-only on Android (R1a): no celebration, no story share, no emoji
 * status and nothing sold. The one outward action is a plain-text share of the
 * current season's belt.
 */
@Composable
fun FightRecordScreen(
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: FightRecordViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current
    FightRecordContent(
        state = state,
        onBack = onBack,
        onRetry = viewModel::refresh,
        onShare = { award -> context.shareBelt(award) },
        modifier = modifier,
    )
}

/** Stateless body — everything previewable lives here. */
@Composable
internal fun FightRecordContent(
    state: FightRecordUiState,
    onBack: () -> Unit,
    onRetry: () -> Unit,
    onShare: (BeltAwardDto) -> Unit,
    modifier: Modifier = Modifier,
) {
    Scaffold(
        modifier = modifier.fillMaxSize(),
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            AzfAppHeader(title = stringResource(R.string.fight_record_title), onBack = onBack)
        },
    ) { innerPadding ->
        LazyColumn(
            modifier = Modifier
                .padding(innerPadding)
                .fillMaxSize(),
            contentPadding = PaddingValues(
                start = AzfSpacing.ContainerMargin,
                end = AzfSpacing.ContainerMargin,
                top = AzfSpacing.ElementGapMedium,
                bottom = 40.dp,
            ),
            verticalArrangement = Arrangement.spacedBy(AzfSpacing.Gutter),
        ) {
            when (state) {
                FightRecordUiState.Loading -> item {
                    Column(verticalArrangement = Arrangement.spacedBy(AzfSpacing.Gutter)) {
                        Skeleton(modifier = Modifier.fillMaxWidth().height(220.dp), shape = AzfShapes.Card)
                        Skeleton(modifier = Modifier.fillMaxWidth().height(260.dp), shape = AzfShapes.Card)
                    }
                }
                FightRecordUiState.Failed -> item {
                    ErrorState(
                        title = stringResource(R.string.fight_record_title),
                        message = stringResource(R.string.fight_record_error),
                        retryLabel = stringResource(R.string.action_retry),
                        onRetry = onRetry,
                    )
                }
                // Reached only if the flag turns off while the page is open,
                // or from a stale entry point: say so plainly, invent nothing.
                FightRecordUiState.Off -> item {
                    EmptyState(
                        title = stringResource(R.string.fight_record_off_title),
                        message = stringResource(R.string.fight_record_off_body),
                        icon = Icons.Outlined.SportsMartialArts,
                    )
                }
                is FightRecordUiState.Ready -> {
                    item {
                        Text(
                            text = stringResource(R.string.fight_record_intro),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    item { CurrentSeason(record = state.record, onShare = onShare) }
                    item { Ladder(record = state.record) }
                    item { Shelf(record = state.record) }
                }
            }
        }
    }
}

@Composable
private fun CurrentSeason(record: FightRecordStatusDto, onShare: (BeltAwardDto) -> Unit) {
    val current = record.current
    val season = current.season
    val shareable = currentSeasonBelt(record)
    AzfCard(modifier = Modifier.fillMaxWidth(), tier = AzfCardTier.Hero) {
        Text(
            text = stringResource(R.string.fight_record_season_named, season.number, season.name).uppercase(),
            style = MaterialTheme.typography.headlineSmall,
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.semantics { heading() },
        )
        Text(
            text = seasonDatesText(season),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        Spacer(Modifier.height(AzfSpacing.ElementGapMedium))
        Row(verticalAlignment = Alignment.CenterVertically) {
            // Decorative: the belt is named in full beside it.
            BeltBadge(tier = current.tier, width = 80.dp, decorative = true)
            Column(modifier = Modifier.padding(start = AzfSpacing.ElementGapMedium)) {
                Text(
                    text = beltName(current.tier),
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    text = pluralStringResource(
                        R.plurals.fight_record_active_days,
                        current.activeDays,
                        current.activeDays,
                    ),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        Spacer(Modifier.height(AzfSpacing.ElementGapMedium))
        Text(
            text = nextBeltText(current),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface,
        )
        Text(
            text = daysLeftText(current.daysLeft),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        if (shareable != null) {
            Spacer(Modifier.height(AzfSpacing.ElementGapMedium))
            PrimaryButton(
                text = stringResource(R.string.fight_record_share),
                onClick = { onShare(shareable) },
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

/**
 * Every rung with its threshold, held ones ticked. The tick is decoration;
 * the held state rides in each row's semantics, so a screen reader hears
 * "Blue Belt, 12 active days, Held" rather than an unlabelled icon.
 */
@Composable
private fun Ladder(record: FightRecordStatusDto) {
    val held = stringResource(R.string.fight_record_rung_held)
    val ahead = stringResource(R.string.fight_record_rung_ahead)
    AzfCard(modifier = Modifier.fillMaxWidth()) {
        SectionHeading(stringResource(R.string.fight_record_ladder_heading))
        record.ladder.forEach { rung ->
            // A tier this build cannot name decodes to null; skip that rung.
            val tier = rung.tier ?: return@forEach
            val isHeld = isRungHeld(tier, record.current.tier)
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = AzfSpacing.ElementGapSmall)
                    .semantics(mergeDescendants = true) { stateDescription = if (isHeld) held else ahead },
            ) {
                BeltBadge(tier = tier, width = 48.dp, decorative = true)
                Text(
                    text = beltName(tier),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier
                        .weight(1f)
                        .padding(start = AzfSpacing.ElementGapMedium),
                )
                Text(
                    text = pluralStringResource(R.plurals.fight_record_rung_days, rung.activeDays, rung.activeDays),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                // A fixed slot, so the threshold column lines up held or not.
                Box(
                    modifier = Modifier
                        .padding(start = AzfSpacing.ElementGapSmall)
                        .size(20.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    if (isHeld) {
                        Icon(
                            imageVector = Icons.Outlined.CheckCircle,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                        )
                    }
                }
            }
        }
    }
}

/** Highest belt from every season, newest first, as the server orders them. */
@Composable
private fun Shelf(record: FightRecordStatusDto) {
    val belts = record.belts.filter { it.tier != null }
    AzfCard(modifier = Modifier.fillMaxWidth()) {
        SectionHeading(stringResource(R.string.fight_record_shelf_heading))
        if (belts.isEmpty()) {
            record.ladder.firstOrNull { it.tier != null }?.let { first ->
                Text(
                    text = pluralStringResource(R.plurals.fight_record_shelf_empty, first.activeDays, first.activeDays),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = AzfSpacing.ElementGapSmall),
                )
            }
        }
        belts.forEach { belt ->
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = AzfSpacing.ElementGapSmall)
                    .semantics(mergeDescendants = true) {},
            ) {
                BeltBadge(tier = belt.tier, width = 48.dp, decorative = true)
                Column(modifier = Modifier.padding(start = AzfSpacing.ElementGapMedium)) {
                    Text(
                        text = beltName(belt.tier),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    Text(
                        text = stringResource(R.string.fight_record_season_named, belt.seasonNumber, belt.seasonName),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

@Composable
private fun SectionHeading(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.titleMedium,
        color = MaterialTheme.colorScheme.onSurface,
        modifier = Modifier.semantics { heading() },
    )
}

/**
 * Hand the current season's belt to the system share sheet, as plain text in
 * the pattern of the huddle invite.
 *
 * Belt and season only. No count of days and no health figure (§5.2), and no
 * personal invite link either: Android has no attribution links yet, so the
 * public welcome page is the honest destination.
 */
private fun Context.shareBelt(award: BeltAwardDto) {
    val text = getString(
        R.string.fight_record_share_text,
        getString(beltNameRes(award.tier)),
        award.seasonNumber,
        WELCOME_URL,
    )
    val intent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_TEXT, text)
    }
    runCatching {
        startActivity(
            Intent.createChooser(intent, getString(R.string.fight_record_share))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    }
}

/** The public front door on the web (`/welcome` in `apps/web/src/App.tsx`). */
private val WELCOME_URL = "${BuildConfig.WEB_BASE_URL}/welcome"

@Preview(showBackground = true, backgroundColor = 0xFF0E1416, heightDp = 1200)
@Composable
private fun FightRecordPreview() {
    val ladder = listOf(
        BeltRungDto(BeltTier.WHITE, 3),
        BeltRungDto(BeltTier.BLUE, 12),
        BeltRungDto(BeltTier.PURPLE, 24),
        BeltRungDto(BeltTier.BROWN, 36),
        BeltRungDto(BeltTier.BLACK, 48),
    )
    AzfTheme {
        FightRecordContent(
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
                        next = BeltRungDto(BeltTier.PURPLE, 24),
                    ),
                    ladder = ladder,
                    belts = listOf(
                        BeltAwardDto(id = "b3", seasonNumber = 3, seasonName = "Second Wind", tier = BeltTier.BLUE),
                        BeltAwardDto(id = "b2", seasonNumber = 2, seasonName = "Ground Game", tier = BeltTier.PURPLE),
                    ),
                ),
            ),
            onBack = {},
            onRetry = {},
            onShare = {},
        )
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416)
@Composable
private fun FightRecordOffPreview() {
    AzfTheme {
        FightRecordContent(state = FightRecordUiState.Off, onBack = {}, onRetry = {}, onShare = {})
    }
}
