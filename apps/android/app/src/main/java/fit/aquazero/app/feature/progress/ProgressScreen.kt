package fit.aquazero.app.feature.progress

import android.content.Context
import android.content.Intent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.TrendingDown
import androidx.compose.material.icons.automirrored.outlined.TrendingUp
import androidx.compose.material.icons.outlined.Bolt
import androidx.compose.material.icons.outlined.FitnessCenter
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import fit.aquazero.app.R
import fit.aquazero.app.core.designsystem.AzfAppHeader
import fit.aquazero.app.core.designsystem.AzfCard
import fit.aquazero.app.core.designsystem.AzfCardTier
import fit.aquazero.app.core.designsystem.AzfChip
import fit.aquazero.app.core.designsystem.AzfShapes
import fit.aquazero.app.core.designsystem.AzfSpacing
import fit.aquazero.app.core.designsystem.AzfTheme
import fit.aquazero.app.core.designsystem.DataLarge
import fit.aquazero.app.core.designsystem.DataSmall
import fit.aquazero.app.core.designsystem.EmptyState
import fit.aquazero.app.core.designsystem.ErrorState
import fit.aquazero.app.core.designsystem.LocalAzfExtended
import fit.aquazero.app.core.designsystem.PrimaryButton
import fit.aquazero.app.core.designsystem.SecondaryButton
import fit.aquazero.app.core.designsystem.Skeleton
import fit.aquazero.app.core.designsystem.ToastController
import fit.aquazero.app.core.designsystem.revealOnEnter
import fit.aquazero.app.core.model.ConsistencyStatusDto
import fit.aquazero.app.core.model.ProgressSummaryDto
import fit.aquazero.app.core.model.TrendPointDto
import fit.aquazero.app.core.ui.LocaleFormatters
import fit.aquazero.app.feature.gamification.CelebrationHost
import java.time.LocalDate
import java.util.Locale
import kotlin.math.abs
import kotlin.math.roundToInt

/**
 * Your Progress.
 *
 * Range chips, the weight journey chart with its goal line, the calorie trend,
 * consistency (never a streak), the weekly insight, cumulative metrics, the
 * macro donut, achievements, and export through the Android share sheet.
 */
@Composable
fun ProgressScreen(
    modifier: Modifier = Modifier,
    onLogWeight: () -> Unit = {},
    viewModel: ProgressViewModel = hiltViewModel(),
    toastController: ToastController? = null,
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val resources = LocalResources.current

    LaunchedEffect(viewModel) {
        viewModel.events.collect { event ->
            when (event) {
                is ProgressEvent.ShareExport -> context.shareText(
                    subject = resources.getString(R.string.progress_export_title),
                    body = event.body,
                    chooserTitle = resources.getString(R.string.progress_export_chooser),
                )

                is ProgressEvent.ExportEmpty ->
                    toastController?.info(resources.getString(R.string.progress_export_empty))
            }
        }
    }

    Box(modifier = modifier.fillMaxSize()) {
        ProgressContent(
            state = state,
            modifier = Modifier.fillMaxSize(),
            onRangeChange = viewModel::setRange,
            onLogWeight = onLogWeight,
            onExport = viewModel::exportData,
            onRetry = viewModel::refresh,
        )
        CelebrationHost()
    }
}

@Composable
private fun ProgressContent(
    state: ProgressUiState,
    modifier: Modifier = Modifier,
    onRangeChange: (ProgressRange) -> Unit,
    onLogWeight: () -> Unit,
    onExport: () -> Unit,
    onRetry: () -> Unit,
) {
    Scaffold(
        modifier = modifier.fillMaxSize(),
        containerColor = MaterialTheme.colorScheme.background,
        topBar = { AzfAppHeader(title = stringResource(R.string.screen_progress), onBack = null) },
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
            // Every slot below declares a `contentType`. This list is entirely
            // heterogeneous — a chip row, two charts, cards, a grid — so
            // without one Compose treats the slots as interchangeable and
            // discards the subcomposition whenever a slot's kind changes
            // (loading → loaded, error → loaded, insight appearing).
            item(key = "ranges", contentType = "ranges") {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    ProgressRange.entries.forEach { range ->
                        AzfChip(
                            text = stringResource(rangeLabelRes(range)),
                            selected = state.range == range,
                            onClick = { onRangeChange(range) },
                        )
                    }
                }
            }

            if (state.loading && state.summary == null) {
                items(
                    count = 3,
                    key = { "progress-skeleton-$it" },
                    contentType = { "skeleton" },
                ) {
                    Skeleton(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(120.dp),
                        shape = AzfShapes.Card,
                    )
                }
                return@LazyColumn
            }

            if (state.refreshError && state.summary == null) {
                item(key = "progress-error", contentType = "error") {
                    ErrorState(
                        title = stringResource(R.string.progress_error_title),
                        message = stringResource(R.string.progress_error_body),
                        retryLabel = stringResource(R.string.training_refresh),
                        onRetry = onRetry,
                    )
                }
                return@LazyColumn
            }

            val summary = state.summary ?: return@LazyColumn

            item(key = "consistency", contentType = "consistency") {
                ConsistencyCard(
                    consistency = summary.consistency,
                    modifier = Modifier.revealOnEnter(0),
                )
            }

            state.insight?.let { insight ->
                item(key = "insight", contentType = "insight") {
                    WeeklyInsightCard(insight = insight, modifier = Modifier.revealOnEnter(1))
                }
            }

            state.adaptiveExpenditure?.let { adaptive ->
                item(key = "adaptive-metabolism", contentType = "adaptive-metabolism") {
                    AdaptiveMetabolicCard(result = adaptive, modifier = Modifier.revealOnEnter(2))
                }
            }

            item(key = "weight-hero", contentType = "weight-hero") {
                WeightHeroRow(state = state, modifier = Modifier.revealOnEnter(3))
            }

            item(key = "weight-chart", contentType = "weight-chart") {
                AzfCard(tier = AzfCardTier.Hero, modifier = Modifier.fillMaxWidth()) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.Bottom,
                    ) {
                        Text(
                            text = stringResource(R.string.progress_weight_journey).uppercase(),
                            style = MaterialTheme.typography.headlineMedium,
                            color = MaterialTheme.colorScheme.onSurface,
                        )
                        state.goalWeightKg?.let { goal ->
                            Text(
                                text = stringResource(
                                    R.string.progress_goal_kg,
                                    formatKg(goal),
                                ),
                                style = DataSmall,
                                color = LocalAzfExtended.current.secondaryFixedDim,
                            )
                        }
                    }
                    Spacer(modifier = Modifier.height(12.dp))
                    if (state.weightSeries.isEmpty()) {
                        EmptyState(
                            title = stringResource(R.string.progress_no_weighins_title),
                            message = stringResource(R.string.progress_no_weighins_body),
                        )
                    } else {
                        WeightChart(
                            points = state.weightSeries,
                            goalKg = state.goalWeightKg,
                            contentDescription = weightChartDescription(state),
                        )
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(top = 4.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text(
                                text = shortDate(state.weightSeries.first().date),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Text(
                                text = shortDate(state.weightSeries.last().date),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }

            item(key = "kcal", contentType = "kcal-chart") {
                AzfCard(modifier = Modifier.fillMaxWidth()) {
                    Text(
                        text = stringResource(R.string.progress_calorie_trend).uppercase(),
                        style = MaterialTheme.typography.headlineMedium,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    if (state.kcalSeries.isEmpty()) {
                        EmptyState(
                            title = stringResource(R.string.progress_no_meals_title),
                            message = stringResource(R.string.progress_no_meals_body),
                        )
                    } else {
                        KcalBars(
                            points = state.kcalSeries,
                            targetKcal = state.kcalTarget,
                            contentDescription = kcalBarsDescription(state),
                        )
                        Text(
                            text = stringResource(R.string.progress_kcal_avg, state.averageKcal),
                            style = DataSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = 6.dp),
                        )
                        state.kcalTarget?.let { target ->
                            Text(
                                text = stringResource(
                                    R.string.progress_kcal_target,
                                    target.roundToInt(),
                                ),
                                style = DataSmall,
                                color = LocalAzfExtended.current.secondaryFixedDim,
                            )
                        }
                    }
                }
            }

            item(key = "stats", contentType = "stats") {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    MetricCard(
                        label = stringResource(R.string.progress_stat_workouts),
                        value = summary.workoutsCompleted.toString(),
                        icon = Icons.Outlined.FitnessCenter,
                        accent = LocalAzfExtended.current.secondaryFixedDim,
                        modifier = Modifier.weight(1f),
                    )
                    MetricCard(
                        label = stringResource(R.string.progress_stat_burned),
                        value = summary.totalKcalBurned.roundToInt().toString(),
                        unit = stringResource(R.string.progress_unit_kcal),
                        icon = Icons.Outlined.Bolt,
                        // Coral, never red — the product's only "warm" accent.
                        accent = LocalAzfExtended.current.coral,
                        modifier = Modifier.weight(1f),
                    )
                }
            }

            item(key = "macros", contentType = "macros") {
                AzfCard(modifier = Modifier.fillMaxWidth()) {
                    Text(
                        text = stringResource(R.string.progress_macro_split).uppercase(),
                        style = MaterialTheme.typography.headlineMedium,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    if (state.macros.hasData) {
                        MacroDonut(
                            proteinG = state.macros.proteinG,
                            carbsG = state.macros.carbsG,
                            fatG = state.macros.fatG,
                        )
                    } else {
                        Text(
                            text = stringResource(R.string.progress_macro_empty),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }

            item(key = "achievements-header", contentType = "heading") {
                Spacer(modifier = Modifier.height(AzfSpacing.ElementGapSmall))
                Text(
                    text = stringResource(R.string.progress_achievements).uppercase(),
                    style = MaterialTheme.typography.headlineMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }

            item(key = "achievements", contentType = "achievements") {
                if (summary.achievements.isEmpty()) {
                    EmptyState(
                        title = stringResource(R.string.progress_no_badges_title),
                        message = stringResource(R.string.progress_no_badges_body),
                    )
                } else {
                    LazyVerticalGrid(
                        columns = GridCells.Fixed(ACHIEVEMENT_COLUMNS),
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(achievementGridHeight(summary.achievements.size).dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                        userScrollEnabled = false,
                    ) {
                        items(
                            items = summary.achievements,
                            key = { it.definition.id },
                            contentType = { "achievement" },
                        ) { achievement ->
                            AchievementTile(
                                status = achievement,
                                earnedDateLabel = achievement.earnedAt
                                    ?.take(ISO_DATE_LENGTH)
                                    ?.let(::shortDate),
                            )
                        }
                    }
                }
            }

            item(key = "actions", contentType = "actions") {
                Spacer(modifier = Modifier.height(AzfSpacing.ElementGapMedium))
                PrimaryButton(
                    text = stringResource(R.string.progress_log_weight),
                    onClick = onLogWeight,
                )
                Spacer(modifier = Modifier.height(12.dp))
                SecondaryButton(
                    text = stringResource(R.string.progress_export),
                    onClick = onExport,
                )
            }
        }
    }
}

/**
 * Current weight and the change since the start.
 *
 * Direction is reported, not judged: a gain is not painted as failure and a
 * loss is not painted as reward. Same ink either way — the sign carries the
 * information (product invariant §5.3, no red for weight gain).
 */
@Composable
private fun WeightHeroRow(state: ProgressUiState, modifier: Modifier = Modifier) {
    Row(modifier = modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        AzfCard(modifier = Modifier.weight(1f)) {
            Text(
                text = stringResource(R.string.progress_current_weight).uppercase(),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Row(verticalAlignment = Alignment.Bottom, modifier = Modifier.padding(top = 6.dp)) {
                Text(
                    text = state.currentWeightKg?.let(::formatKg) ?: "–",
                    style = DataLarge.copy(fontSize = 28.sp, lineHeight = 30.sp),
                    color = LocalAzfExtended.current.primaryFixedDim,
                )
                Text(
                    text = stringResource(R.string.log_weight_unit_kg),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(start = 4.dp, bottom = 2.dp),
                )
            }
        }
        AzfCard(modifier = Modifier.weight(1f)) {
            Text(
                text = stringResource(R.string.progress_since_start).uppercase(),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 6.dp)) {
                val delta = state.deltaKg
                Icon(
                    imageVector = if (delta != null && delta > 0) {
                        Icons.AutoMirrored.Outlined.TrendingUp
                    } else {
                        Icons.AutoMirrored.Outlined.TrendingDown
                    },
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(18.dp),
                )
                Text(
                    text = delta?.let { signedKg(it) } ?: "–",
                    style = DataSmall.copy(fontSize = 18.sp, lineHeight = 22.sp),
                    // Neutral ink in both directions, deliberately.
                    color = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.padding(start = 6.dp),
                )
            }
        }
    }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

@Composable
private fun weightChartDescription(state: ProgressUiState): String {
    val first = state.weightSeries.firstOrNull()?.date.orEmpty()
    val last = state.weightSeries.lastOrNull()
    val latest = last?.value?.let(::formatKg) ?: "–"
    val goal = state.goalWeightKg
    return if (goal != null) {
        stringResource(
            R.string.progress_weight_chart_cd_goal,
            shortDate(first),
            shortDate(last?.date.orEmpty()),
            latest,
            formatKg(goal),
        )
    } else {
        stringResource(
            R.string.progress_weight_chart_cd,
            shortDate(first),
            shortDate(last?.date.orEmpty()),
            latest,
        )
    }
}

@Composable
private fun kcalBarsDescription(state: ProgressUiState): String {
    val target = state.kcalTarget
    return if (target != null) {
        stringResource(
            R.string.progress_kcal_bars_cd_target,
            state.averageKcal,
            target.roundToInt(),
        )
    } else {
        stringResource(R.string.progress_kcal_bars_cd, state.averageKcal)
    }
}

private fun rangeLabelRes(range: ProgressRange): Int = when (range) {
    ProgressRange.WEEK -> R.string.progress_range_7d
    ProgressRange.MONTH -> R.string.progress_range_30d
    ProgressRange.QUARTER -> R.string.progress_range_90d
}

/** One decimal, always — metrics use tabular figures so columns stay aligned. */
internal fun formatKg(value: Double): String = String.format(Locale.US, "%.1f", value)

/** Signed one-decimal kilogram delta: "+0.4 kg" / "-1.2 kg". */
internal fun signedKg(value: Double): String {
    val sign = if (value > 0) {
        "+"
    } else if (value < 0) {
        "-"
    } else {
        ""
    }
    return "$sign${String.format(Locale.US, "%.1f", abs(value))} kg"
}

/**
 * "14 Aug" in the device locale; falls back to the raw string when unparsable.
 *
 * Called once per achievement tile and twice per chart, so the formatter is
 * cached by [LocaleFormatters] instead of compiled from the pattern each time.
 */
internal fun shortDate(isoDate: String): String = runCatching {
    LocalDate.parse(isoDate).format(LocaleFormatters.of(SHORT_DATE_PATTERN))
}.getOrDefault(isoDate)

private fun achievementGridHeight(count: Int): Int {
    val rows = (count + ACHIEVEMENT_COLUMNS - 1) / ACHIEVEMENT_COLUMNS
    return rows * ACHIEVEMENT_ROW_HEIGHT
}

/** Hand plain text to the system share sheet. */
private fun Context.shareText(subject: String, body: String, chooserTitle: String) {
    val intent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_SUBJECT, subject)
        putExtra(Intent.EXTRA_TEXT, body)
    }
    startActivity(Intent.createChooser(intent, chooserTitle))
}

private const val ACHIEVEMENT_COLUMNS = 3
private const val ACHIEVEMENT_ROW_HEIGHT = 116
private const val ISO_DATE_LENGTH = 10
private const val SHORT_DATE_PATTERN = "d MMM"

@Preview(showBackground = true, backgroundColor = 0xFF0E1416)
@Composable
private fun ProgressPreview() {
    AzfTheme {
        Box {
            ProgressContent(
                state = ProgressUiState(
                    loading = false,
                    summary = ProgressSummaryDto(
                        currentWeightKg = 83.1,
                        startWeightKg = 84.6,
                        targetWeightKg = 80.0,
                        workoutsCompleted = 42,
                        totalKcalBurned = 18420.0,
                        consistency = ConsistencyStatusDto(
                            currentDays = 4,
                            bestDays = 11,
                            activeDays = 18,
                            windowDays = 28,
                            graceRemaining = 2,
                        ),
                    ),
                    weightSeries = listOf(
                        TrendPointDto("2026-08-01", 84.6),
                        TrendPointDto("2026-08-10", 84.0),
                        TrendPointDto("2026-08-20", 83.1),
                    ),
                    kcalSeries = (1..14).map {
                        TrendPointDto("2026-08-%02d".format(it), 1800.0 + it * 25)
                    },
                    kcalTarget = 2100.0,
                ),
                onRangeChange = {},
                onLogWeight = {},
                onExport = {},
                onRetry = {},
            )
        }
    }
}
