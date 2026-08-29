package fit.aquazero.app.feature.nutrition

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ChevronLeft
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import fit.aquazero.app.R
import fit.aquazero.app.core.designsystem.AzfShapes
import fit.aquazero.app.core.designsystem.AzfSpacing
import fit.aquazero.app.core.designsystem.AzfTheme
import fit.aquazero.app.core.designsystem.DataSmall
import fit.aquazero.app.core.designsystem.LocalAzfExtended
import fit.aquazero.app.core.designsystem.currentLocale
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.util.Locale

/**
 * Month picker for the day switcher. Days with logged calories carry a small
 * aqua dot; future days are disabled — the diary never runs ahead of the
 * clock. Deliberately hand-rolled rather than Material's `DatePicker` so it
 * can carry the logged-day affordance and the Deep Sea shapes.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun AquaCalendarPicker(
    selectedDate: String,
    today: String,
    loggedDates: Set<String>,
    onSelectDate: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    val selected = remember(selectedDate) {
        runCatching { LocalDate.parse(selectedDate) }.getOrElse { LocalDate.now() }
    }
    val todayDate = remember(today) {
        runCatching { LocalDate.parse(today) }.getOrElse { LocalDate.now() }
    }
    var month by remember(selectedDate) { mutableStateOf(YearMonth.from(selected)) }
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(horizontal = AzfSpacing.ContainerMargin)
                .padding(bottom = AzfSpacing.ContainerMargin),
        ) {
            Text(
                text = stringResource(R.string.calendar_title).uppercase(),
                style = MaterialTheme.typography.headlineSmall,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Spacer(Modifier.height(AzfSpacing.ElementGapMedium))

            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                IconButton(
                    onClick = { month = month.minusMonths(1) },
                    modifier = Modifier.size(AzfSpacing.TouchTarget),
                ) {
                    Icon(
                        imageVector = Icons.Outlined.ChevronLeft,
                        contentDescription = stringResource(R.string.calendar_prev_month),
                        tint = MaterialTheme.colorScheme.onSurface,
                    )
                }
                Text(
                    text = month.atDay(1).format(MONTH_FORMATTER).uppercase(),
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.onSurface,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.weight(1f),
                )
                val nextEnabled = month < YearMonth.from(todayDate)
                IconButton(
                    onClick = { month = month.plusMonths(1) },
                    enabled = nextEnabled,
                    modifier = Modifier.size(AzfSpacing.TouchTarget),
                ) {
                    Icon(
                        imageVector = Icons.Outlined.ChevronRight,
                        contentDescription = stringResource(R.string.calendar_next_month),
                        tint = MaterialTheme.colorScheme.onSurface,
                    )
                }
            }

            Spacer(Modifier.height(8.dp))

            Row(modifier = Modifier.fillMaxWidth()) {
                val locale = currentLocale()
                WEEK_START_ORDER.forEach { day ->
                    Text(
                        text = day.getDisplayName(TextStyle.NARROW, locale),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.weight(1f),
                    )
                }
            }

            Spacer(Modifier.height(4.dp))

            val cells = remember(month) { monthCells(month) }
            cells.chunked(DAYS_PER_WEEK).forEach { week ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    week.forEach { date ->
                        DayCell(
                            date = date,
                            inMonth = date != null && YearMonth.from(date) == month,
                            selected = date == selected,
                            logged = date != null && date.toString() in loggedDates,
                            enabled = date != null && !date.isAfter(todayDate),
                            onClick = { date?.let { onSelectDate(it.toString()) } },
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun DayCell(
    date: LocalDate?,
    inMonth: Boolean,
    selected: Boolean,
    logged: Boolean,
    enabled: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    if (date == null) {
        Box(modifier = modifier.aspectRatio(1f))
        return
    }
    val accent = LocalAzfExtended.current.primaryFixedDim
    val description = stringResource(
        R.string.calendar_day_cd,
        date.format(DAY_FORMATTER),
        stringResource(if (logged) R.string.calendar_day_logged else R.string.calendar_day_empty),
    )
    Box(
        modifier = modifier
            .aspectRatio(1f)
            .alpha(
                if (!enabled) {
                    0.3f
                } else if (inMonth) {
                    1f
                } else {
                    0.5f
                },
            )
            .clip(AzfShapes.Inner)
            .background(
                if (selected) accent.copy(alpha = 0.18f) else MaterialTheme.colorScheme.surfaceContainerLow,
            )
            .border(
                BorderStroke(1.dp, if (selected) accent else Color.Transparent),
                AzfShapes.Inner,
            )
            .clickable(enabled = enabled, onClick = onClick)
            .semantics { contentDescription = description },
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = date.dayOfMonth.toString(),
                style = DataSmall,
                color = if (selected) accent else MaterialTheme.colorScheme.onSurface,
            )
            Box(
                modifier = Modifier
                    .padding(top = 3.dp)
                    .size(4.dp)
                    .clip(AzfShapes.Pill)
                    .background(
                        if (logged) accent else Color.Transparent,
                    ),
            )
        }
    }
}

/** Six weeks of cells covering [month], padded with nulls at both ends. */
private fun monthCells(month: YearMonth): List<LocalDate?> {
    val first = month.atDay(1)
    val leading = WEEK_START_ORDER.indexOf(first.dayOfWeek)
    val cells = ArrayList<LocalDate?>(42)
    repeat(leading) { cells.add(null) }
    for (day in 1..month.lengthOfMonth()) cells.add(month.atDay(day))
    while (cells.size % DAYS_PER_WEEK != 0) cells.add(null)
    return cells
}

private const val DAYS_PER_WEEK = 7

private val WEEK_START_ORDER = listOf(
    DayOfWeek.MONDAY,
    DayOfWeek.TUESDAY,
    DayOfWeek.WEDNESDAY,
    DayOfWeek.THURSDAY,
    DayOfWeek.FRIDAY,
    DayOfWeek.SATURDAY,
    DayOfWeek.SUNDAY,
)

private val MONTH_FORMATTER: DateTimeFormatter =
    DateTimeFormatter.ofPattern("MMMM yyyy", Locale.getDefault())

private val DAY_FORMATTER: DateTimeFormatter =
    DateTimeFormatter.ofPattern("EEEE d MMMM", Locale.getDefault())

@Preview(showBackground = true, backgroundColor = 0xFF0E1416)
@Composable
private fun DayCellPreview() {
    AzfTheme {
        Row(Modifier.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            DayCell(
                date = LocalDate.of(2026, 8, 27),
                inMonth = true,
                selected = true,
                logged = true,
                enabled = true,
                onClick = {},
                modifier = Modifier.size(48.dp),
            )
            DayCell(
                date = LocalDate.of(2026, 8, 26),
                inMonth = true,
                selected = false,
                logged = true,
                enabled = true,
                onClick = {},
                modifier = Modifier.size(48.dp),
            )
            DayCell(
                date = LocalDate.of(2026, 8, 28),
                inMonth = true,
                selected = false,
                logged = false,
                enabled = false,
                onClick = {},
                modifier = Modifier.size(48.dp),
            )
        }
    }
}
