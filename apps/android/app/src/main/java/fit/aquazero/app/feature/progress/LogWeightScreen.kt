package fit.aquazero.app.feature.progress

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.TrendingDown
import androidx.compose.material.icons.automirrored.outlined.TrendingUp
import androidx.compose.material.icons.outlined.CalendarToday
import androidx.compose.material.icons.outlined.ChevronLeft
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import fit.aquazero.app.R
import fit.aquazero.app.core.database.SyncState
import fit.aquazero.app.core.database.WeightLogEntity
import fit.aquazero.app.core.designsystem.AzfAppHeader
import fit.aquazero.app.core.designsystem.AzfCard
import fit.aquazero.app.core.designsystem.AzfCardTier
import fit.aquazero.app.core.designsystem.AzfChip
import fit.aquazero.app.core.designsystem.AzfShapes
import fit.aquazero.app.core.designsystem.AzfSpacing
import fit.aquazero.app.core.designsystem.AzfTextField
import fit.aquazero.app.core.designsystem.AzfTheme
import fit.aquazero.app.core.designsystem.DataLarge
import fit.aquazero.app.core.designsystem.DataSmall
import fit.aquazero.app.core.designsystem.EmptyState
import fit.aquazero.app.core.designsystem.LocalAzfExtended
import fit.aquazero.app.core.designsystem.PrimaryButton
import fit.aquazero.app.core.designsystem.ToastController
import fit.aquazero.app.core.ui.LocaleFormatters
import java.time.LocalDate
import java.util.Locale
import kotlin.math.abs

/**
 * Log Weight.
 *
 * A single very large numeric field, a display-only kg/lb toggle (canonical
 * kilograms are always what gets submitted), a date capped at today, an
 * optional note with quick chips, and the last 30 days with per-entry deltas.
 *
 * **Gain is never red.** An increase is drawn in coral — the product's warm
 * accent — and a decrease in sea green; neither is framed as success or
 * failure, and no copy anywhere says anything was lost.
 */
@Composable
fun LogWeightScreen(
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: LogWeightViewModel = hiltViewModel(),
    toastController: ToastController? = null,
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val resources = LocalResources.current

    LaunchedEffect(viewModel) {
        viewModel.events.collect { event ->
            when (event) {
                is LogWeightEvent.Saved -> {
                    toastController?.success(resources.getString(R.string.log_weight_saved))
                    onBack()
                }
            }
        }
    }

    LogWeightContent(
        state = state,
        modifier = modifier,
        onBack = onBack,
        onValueChange = viewModel::onValueChange,
        onUnitChange = viewModel::setUnit,
        onShiftDate = viewModel::shiftDate,
        onNoteChange = viewModel::onNoteChange,
        onQuickNote = viewModel::appendQuickNote,
        onSubmit = viewModel::submit,
    )
}

@Composable
private fun LogWeightContent(
    state: LogWeightUiState,
    modifier: Modifier = Modifier,
    onBack: () -> Unit,
    onValueChange: (String) -> Unit,
    onUnitChange: (WeightUnit) -> Unit,
    onShiftDate: (Long) -> Unit,
    onNoteChange: (String) -> Unit,
    onQuickNote: (String) -> Unit,
    onSubmit: () -> Unit,
) {
    Scaffold(
        modifier = modifier.fillMaxSize(),
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            AzfAppHeader(title = stringResource(R.string.screen_log_weight), onBack = onBack)
        },
    ) { innerPadding ->
        LazyColumn(
            modifier = Modifier
                .padding(innerPadding)
                .fillMaxSize(),
            contentPadding = PaddingValues(
                start = AzfSpacing.ContainerMargin,
                end = AzfSpacing.ContainerMargin,
                bottom = AzfSpacing.SectionGap,
            ),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item(key = "entry") { BigWeightEntry(state = state, onValueChange = onValueChange) }
            item(key = "units") { UnitToggle(state = state, onUnitChange = onUnitChange) }
            item(key = "delta") { DeltaBadge(state = state) }
            item(key = "error") {
                state.errorRes?.let { res ->
                    Text(
                        text = stringResource(res),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
            item(key = "date") { DateRow(state = state, onShiftDate = onShiftDate) }
            item(key = "note") {
                AzfTextField(
                    value = state.note,
                    onValueChange = onNoteChange,
                    label = stringResource(R.string.log_weight_notes),
                    singleLine = false,
                )
            }
            item(key = "quick-notes") {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(QUICK_NOTE_RES, key = { it }) { res ->
                        val text = stringResource(res)
                        AzfChip(
                            text = text,
                            selected = state.note.contains(text),
                            onClick = { onQuickNote(text) },
                        )
                    }
                }
            }
            item(key = "save") {
                Spacer(modifier = Modifier.height(AzfSpacing.ElementGapSmall))
                PrimaryButton(
                    text = if (state.saving) {
                        stringResource(R.string.log_weight_saving)
                    } else {
                        stringResource(R.string.log_weight_save)
                    },
                    onClick = onSubmit,
                    loading = state.saving,
                )
            }
            item(key = "recent-header") {
                Spacer(modifier = Modifier.height(AzfSpacing.ElementGapMedium))
                Text(
                    text = stringResource(R.string.log_weight_recent).uppercase(),
                    style = MaterialTheme.typography.headlineMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }
            if (state.recent.isEmpty()) {
                item(key = "recent-empty") {
                    EmptyState(
                        title = stringResource(R.string.log_weight_recent_empty_title),
                        message = stringResource(R.string.log_weight_recent_empty_body),
                    )
                }
            } else {
                itemsIndexedRecent(state)
            }
        }
    }
}

/** Recent list with per-entry deltas against the next-older entry. */
private fun androidx.compose.foundation.lazy.LazyListScope.itemsIndexedRecent(
    state: LogWeightUiState,
) {
    items(state.recent.size, key = { state.recent[it].localId }) { index ->
        val log = state.recent[index]
        val previous = state.recent.getOrNull(index + 1)
        RecentEntryRow(
            log = log,
            deltaKg = previous?.let { log.weightKg - it.weightKg },
            unit = state.unit,
        )
    }
}

@Composable
private fun BigWeightEntry(state: LogWeightUiState, onValueChange: (String) -> Unit) {
    val accent = LocalAzfExtended.current.primaryFixedDim
    val unitWord = stringResource(
        if (state.unit == WeightUnit.KG) {
            R.string.log_weight_kilograms
        } else {
            R.string.log_weight_pounds
        },
    )
    val description = stringResource(R.string.log_weight_input_cd, unitWord)
    val entryStyle = DataLarge.copy(
        fontSize = ENTRY_SIZE_SP.sp,
        lineHeight = ENTRY_LINE_SP.sp,
    )
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = AzfSpacing.ElementGapMedium),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(contentAlignment = Alignment.Center) {
            if (state.value.isEmpty()) {
                Text(
                    text = stringResource(R.string.log_weight_placeholder),
                    style = entryStyle,
                    color = accent.copy(alpha = 0.2f),
                )
            }
            BasicTextField(
                value = state.value,
                onValueChange = onValueChange,
                singleLine = true,
                textStyle = entryStyle.copy(color = accent, textAlign = TextAlign.Center),
                cursorBrush = SolidColor(accent),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                modifier = Modifier
                    .width(ENTRY_WIDTH.dp)
                    .semantics { contentDescription = description },
            )
        }
        Box(
            modifier = Modifier
                .padding(top = 4.dp)
                .width(64.dp)
                .height(4.dp)
                .clip(AzfShapes.Pill)
                .background(LocalAzfExtended.current.secondaryFixedDim),
        )
    }
}

@Composable
private fun UnitToggle(state: LogWeightUiState, onUnitChange: (WeightUnit) -> Unit) {
    val groupLabel = stringResource(R.string.log_weight_unit_group)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .semantics { contentDescription = groupLabel },
        horizontalArrangement = Arrangement.Center,
    ) {
        Row(
            modifier = Modifier
                .clip(AzfShapes.Pill)
                .background(MaterialTheme.colorScheme.surfaceContainer)
                .border(
                    BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                    AzfShapes.Pill,
                )
                .padding(4.dp),
        ) {
            listOf(
                WeightUnit.KG to R.string.log_weight_unit_kg,
                WeightUnit.LB to R.string.log_weight_unit_lb,
            ).forEach { (unit, labelRes) ->
                val selected = state.unit == unit
                Text(
                    text = stringResource(labelRes).uppercase(),
                    style = MaterialTheme.typography.labelLarge,
                    color = if (selected) {
                        MaterialTheme.colorScheme.onPrimaryContainer
                    } else {
                        MaterialTheme.colorScheme.onSurfaceVariant
                    },
                    modifier = Modifier
                        .clip(AzfShapes.Pill)
                        .background(
                            if (selected) {
                                MaterialTheme.colorScheme.primaryContainer
                            } else {
                                MaterialTheme.colorScheme.surfaceContainer
                            },
                        )
                        .clickable { onUnitChange(unit) }
                        .padding(horizontal = 20.dp, vertical = 8.dp),
                )
            }
        }
    }
}

/**
 * "1.2 kg down since last entry". Coral for up, sea green for down — a gain is
 * warm, never an alarm, and neither direction is called good or bad.
 */
@Composable
private fun DeltaBadge(state: LogWeightUiState) {
    val delta = state.deltaVsLastKg ?: return
    val extended = LocalAzfExtended.current
    val up = delta > 0
    val tint = if (up) extended.coral else extended.secondaryFixedDim
    val magnitude = String.format(
        Locale.US,
        "%.1f",
        abs(WeightUnits.fromKg(delta, state.unit)),
    )
    val unitLabel = stringResource(
        if (state.unit == WeightUnit.KG) R.string.log_weight_unit_kg else R.string.log_weight_unit_lb,
    )
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            modifier = Modifier
                .clip(AzfShapes.Pill)
                .background(tint.copy(alpha = 0.12f))
                .border(BorderStroke(1.dp, tint.copy(alpha = 0.3f)), AzfShapes.Pill)
                .padding(horizontal = 14.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = if (up) {
                    Icons.AutoMirrored.Outlined.TrendingUp
                } else {
                    Icons.AutoMirrored.Outlined.TrendingDown
                },
                contentDescription = null,
                tint = tint,
                modifier = Modifier.size(18.dp),
            )
            Text(
                text = stringResource(
                    if (up) R.string.log_weight_delta_up else R.string.log_weight_delta_down,
                    magnitude,
                    unitLabel,
                ),
                style = DataSmall,
                color = tint,
                modifier = Modifier.padding(start = 8.dp),
            )
        }
    }
}

@Composable
private fun DateRow(state: LogWeightUiState, onShiftDate: (Long) -> Unit) {
    AzfCard(tier = AzfCardTier.Compact, modifier = Modifier.fillMaxWidth()) {
        Text(
            text = stringResource(R.string.log_weight_date).uppercase(),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            IconButton(onClick = { onShiftDate(-1L) }) {
                Icon(
                    imageVector = Icons.Outlined.ChevronLeft,
                    contentDescription = stringResource(R.string.log_weight_date_earlier),
                    tint = MaterialTheme.colorScheme.onSurface,
                )
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = Icons.Outlined.CalendarToday,
                    contentDescription = null,
                    tint = LocalAzfExtended.current.primaryFixedDim,
                    modifier = Modifier.size(16.dp),
                )
                Text(
                    text = longDate(state.localDate),
                    style = DataSmall,
                    color = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.padding(start = 8.dp),
                )
            }
            IconButton(onClick = { onShiftDate(1L) }, enabled = state.canGoLater) {
                Icon(
                    imageVector = Icons.Outlined.ChevronRight,
                    contentDescription = stringResource(R.string.log_weight_date_later),
                    tint = if (state.canGoLater) {
                        MaterialTheme.colorScheme.onSurface
                    } else {
                        MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f)
                    },
                )
            }
        }
    }
}

@Composable
private fun RecentEntryRow(log: WeightLogEntity, deltaKg: Double?, unit: WeightUnit) {
    val extended = LocalAzfExtended.current
    val unitLabel = stringResource(
        if (unit == WeightUnit.KG) R.string.log_weight_unit_kg else R.string.log_weight_unit_lb,
    )
    AzfCard(tier = AzfCardTier.Compact, modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = stringResource(
                        R.string.log_weight_value,
                        String.format(Locale.US, "%.1f", WeightUnits.fromKg(log.weightKg, unit)),
                        unitLabel,
                    ),
                    style = DataSmall,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    text = listOfNotNull(
                        longDate(log.localDate),
                        log.note?.takeIf { it.isNotBlank() },
                    ).joinToString(" · "),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (log.syncState == SyncState.PENDING) {
                    Text(
                        text = stringResource(R.string.log_weight_pending),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
                    )
                }
            }
            if (deltaKg != null) {
                val up = deltaKg > 0
                val tint = if (up) extended.coral else extended.secondaryFixedDim
                Text(
                    text = stringResource(
                        R.string.log_weight_delta_badge,
                        signedDisplay(deltaKg, unit),
                        unitLabel,
                    ),
                    style = DataSmall,
                    color = tint,
                    modifier = Modifier
                        .clip(AzfShapes.Pill)
                        .background(tint.copy(alpha = 0.14f))
                        .padding(horizontal = 10.dp, vertical = 4.dp),
                )
            }
        }
    }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/**
 * The quick-note chips. A fixed list of resource ids, so it is built once at
 * class-load rather than rebuilt on every recomposition of the chip row.
 */
private val QUICK_NOTE_RES: List<Int> = listOf(
    R.string.log_weight_quick_morning,
    R.string.log_weight_quick_post_workout,
    R.string.log_weight_quick_after_meal,
)

/**
 * "Thu, 14 Aug" in the device locale.
 *
 * Two calls per recent-entry row, so the formatter is cached by
 * [LocaleFormatters] rather than compiled from the pattern on every scroll.
 */
private fun longDate(isoDate: String): String = runCatching {
    LocalDate.parse(isoDate).format(LocaleFormatters.of(RECENT_DATE_PATTERN))
}.getOrDefault(isoDate)

private const val RECENT_DATE_PATTERN = "EEE, d MMM"
private const val ENTRY_WIDTH = 220
private const val ENTRY_SIZE_SP = 64
private const val ENTRY_LINE_SP = 68

@Preview(showBackground = true, backgroundColor = 0xFF0E1416)
@Composable
private fun LogWeightPreview() {
    AzfTheme {
        LogWeightContent(
            state = LogWeightUiState(
                value = "83.1",
                recent = listOf(
                    WeightLogEntity(
                        localId = "w1",
                        weightKg = 83.1,
                        localDate = "2026-08-26",
                        loggedAt = "2026-08-26T07:10:00Z",
                        idempotencyKey = "k1",
                        syncState = SyncState.SYNCED,
                    ),
                    WeightLogEntity(
                        localId = "w2",
                        weightKg = 83.6,
                        localDate = "2026-08-24",
                        loggedAt = "2026-08-24T07:05:00Z",
                        idempotencyKey = "k2",
                        syncState = SyncState.PENDING,
                    ),
                ),
            ),
            onBack = {},
            onValueChange = {},
            onUnitChange = {},
            onShiftDate = {},
            onNoteChange = {},
            onQuickNote = {},
            onSubmit = {},
        )
    }
}
