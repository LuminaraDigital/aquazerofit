package fit.aquazero.app.feature.nutrition

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.CalendarToday
import androidx.compose.material.icons.outlined.ChevronLeft
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.PhotoCamera
import androidx.compose.material.icons.outlined.QrCodeScanner
import androidx.compose.material.icons.outlined.RestaurantMenu
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import fit.aquazero.app.R
import fit.aquazero.app.core.common.LocalDailyNutrition
import fit.aquazero.app.core.designsystem.AzfCard
import fit.aquazero.app.core.designsystem.AzfHeroSurface
import fit.aquazero.app.core.designsystem.AzfSectionHeading
import fit.aquazero.app.core.designsystem.AzfShapes
import fit.aquazero.app.core.designsystem.AzfSpacing
import fit.aquazero.app.core.designsystem.AzfStatRow
import fit.aquazero.app.core.designsystem.AzfTheme
import fit.aquazero.app.core.designsystem.DataSmall
import fit.aquazero.app.core.designsystem.LocalAzfExtended
import fit.aquazero.app.core.designsystem.Scoreboard
import fit.aquazero.app.core.designsystem.Skeleton
import fit.aquazero.app.core.designsystem.pressScale
import fit.aquazero.app.core.designsystem.rememberCountUp
import fit.aquazero.app.core.model.MealType
import fit.aquazero.app.core.ui.NutritionFormat
import kotlin.math.abs

/** Previous / current / next day, with the calendar trigger on the label. */
@Composable
internal fun DaySwitcher(
    selectedDate: String,
    isToday: Boolean,
    onShiftDay: (Long) -> Unit,
    onOpenCalendar: () -> Unit,
    onBackToToday: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        CircleIconControl(
            icon = Icons.Outlined.ChevronLeft,
            contentDescription = stringResource(R.string.nutrition_prev_day),
            onClick = { onShiftDay(-1) },
        )
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            val interaction = remember { MutableInteractionSource() }
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .pressScale(interaction)
                    .clip(AzfShapes.Pill)
                    .clickable(
                        interactionSource = interaction,
                        indication = null,
                        role = Role.Button,
                        onClick = onOpenCalendar,
                    )
                    .minimumInteractiveComponentSize()
                    .padding(horizontal = 12.dp, vertical = 4.dp),
            ) {
                Text(
                    text = if (isToday) {
                        stringResource(R.string.nutrition_today).uppercase()
                    } else {
                        NutritionFormat.formatShortDate(selectedDate).uppercase()
                    },
                    style = MaterialTheme.typography.headlineSmall,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Icon(
                    imageVector = Icons.Outlined.CalendarToday,
                    contentDescription = stringResource(R.string.nutrition_open_calendar),
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier
                        .padding(start = 8.dp)
                        .size(18.dp),
                )
            }
            if (!isToday) {
                Text(
                    text = stringResource(R.string.nutrition_back_to_today).uppercase(),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier
                        .clip(AzfShapes.Pill)
                        .clickable(role = Role.Button, onClick = onBackToToday)
                        .minimumInteractiveComponentSize()
                        .padding(horizontal = 8.dp, vertical = 4.dp),
                )
            }
        }
        CircleIconControl(
            icon = Icons.Outlined.ChevronRight,
            contentDescription = stringResource(R.string.nutrition_next_day),
            enabled = !isToday,
            onClick = { onShiftDay(1) },
        )
    }
}

/**
 * The lead card: what is left of today's calories in scoreboard numerals,
 * one line of how that was reached, and the macros as ruled rows.
 */
@Composable
internal fun CaloriesRemainingCard(
    nutrition: LocalDailyNutrition,
    kcalBurned: Double,
    modifier: Modifier = Modifier,
) {
    val over = nutrition.kcalRemaining < 0
    val shown = rememberCountUp(abs(nutrition.kcalRemaining).toInt())
    val formulaDescription = stringResource(
        R.string.nutrition_formula_cd,
        NutritionFormat.fmtInt(nutrition.kcalTarget),
        NutritionFormat.fmtInt(nutrition.kcalConsumed),
        NutritionFormat.fmtInt(kcalBurned),
        NutritionFormat.fmtInt(nutrition.kcalRemaining),
    )
    val eaten = NutritionFormat.fmtInt(nutrition.kcalConsumed)
    val goal = NutritionFormat.fmtInt(nutrition.kcalTarget)
    AzfHeroSurface(modifier = modifier) {
        // The figure and its sentence are one fact; read once, not as parts.
        Column(modifier = Modifier.clearAndSetSemantics { contentDescription = formulaDescription }) {
            AzfSectionHeading(
                stringResource(if (over) R.string.nutrition_over else R.string.nutrition_remaining),
            )
            Row(modifier = Modifier.padding(top = 8.dp), verticalAlignment = Alignment.Bottom) {
                Text(
                    text = NutritionFormat.fmtInt(shown.toDouble()),
                    style = Scoreboard,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    text = stringResource(R.string.nutrition_unit_kcal),
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(start = 4.dp, bottom = 8.dp),
                )
            }
            Text(
                text = if (kcalBurned > 0) {
                    stringResource(
                        R.string.nutrition_day_summary_burned,
                        eaten,
                        goal,
                        NutritionFormat.fmtInt(kcalBurned),
                    )
                } else {
                    stringResource(R.string.nutrition_day_summary, eaten, goal)
                },
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 8.dp),
            )
        }
        Spacer(Modifier.height(AzfSpacing.ElementGapSmall))
        MacroRow(R.string.macro_protein, nutrition.proteinConsumed, nutrition.proteinTarget)
        MacroRow(R.string.macro_carbs, nutrition.carbsConsumed, nutrition.carbsTarget)
        MacroRow(R.string.macro_fat, nutrition.fatConsumed, nutrition.fatTarget, divider = false)
    }
}

@Composable
private fun MacroRow(labelRes: Int, consumed: Double, target: Double, divider: Boolean = true) {
    AzfStatRow(
        label = stringResource(labelRes),
        value = "${NutritionFormat.fmtInt(consumed)} / ${NutritionFormat.fmtInt(target)}",
        unit = stringResource(R.string.nutrition_unit_g),
        divider = divider,
    )
}

/** Collapsible micronutrient rows, summed from the day's logged items. */
@Composable
internal fun MicronutrientCard(
    micros: Micronutrients,
    expanded: Boolean,
    onToggle: () -> Unit,
    modifier: Modifier = Modifier,
) {
    AzfCard(modifier = modifier.fillMaxWidth()) {
        val toggleLabel = stringResource(
            if (expanded) R.string.nutrition_micros_collapse else R.string.nutrition_micros_expand,
        )
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(AzfShapes.Inner)
                .clickable(role = Role.Button, onClick = onToggle)
                .minimumInteractiveComponentSize()
                .semantics { contentDescription = toggleLabel },
            verticalAlignment = Alignment.CenterVertically,
        ) {
            AzfSectionHeading(
                text = stringResource(R.string.nutrition_micros),
                modifier = Modifier.weight(1f),
            )
            Icon(
                imageVector = Icons.Outlined.ExpandMore,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.rotate(if (expanded) 180f else 0f),
            )
        }
        AnimatedVisibility(visible = expanded) {
            Column(modifier = Modifier.padding(top = AzfSpacing.ElementGapSmall)) {
                MicroRow(R.string.micro_fiber, stringResource(R.string.unit_grams, NutritionFormat.fmt1(micros.fiberG)))
                MicroRow(R.string.micro_sugar, stringResource(R.string.unit_grams, NutritionFormat.fmt1(micros.sugarG)))
                MicroRow(
                    R.string.micro_sodium,
                    stringResource(R.string.unit_milligrams, micros.sodiumMg.toString()),
                )
                MicroRow(
                    R.string.micro_potassium,
                    stringResource(R.string.unit_milligrams, micros.potassiumMg.toString()),
                )
                MicroRow(
                    R.string.micro_calcium,
                    stringResource(R.string.unit_milligrams, micros.calciumMg.toString()),
                )
                MicroRow(
                    R.string.micro_iron,
                    stringResource(R.string.unit_milligrams, NutritionFormat.fmt1(micros.ironMg)),
                    divider = false,
                )
            }
        }
    }
}

/** Four quick actions in a 2x2 grid of equal tiles: photo, barcode, copy-previous, meal plan. */
@Composable
internal fun QuickActions(
    copying: Boolean,
    barcodeEnabled: Boolean,
    onCaptureMeal: () -> Unit,
    onScanBarcode: () -> Unit,
    onCopyPrevious: () -> Unit,
    onMealPlan: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(AzfSpacing.ElementGapSmall),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(AzfSpacing.ElementGapSmall)) {
            QuickAction(
                icon = Icons.Outlined.PhotoCamera,
                title = stringResource(R.string.quick_scan_title),
                onClick = onCaptureMeal,
                modifier = Modifier.weight(1f),
            )
            QuickAction(
                icon = Icons.Outlined.QrCodeScanner,
                title = stringResource(R.string.quick_barcode_title),
                enabled = barcodeEnabled,
                onClick = onScanBarcode,
                modifier = Modifier.weight(1f),
            )
        }
        Row(horizontalArrangement = Arrangement.spacedBy(AzfSpacing.ElementGapSmall)) {
            QuickAction(
                icon = Icons.Outlined.ContentCopy,
                title = stringResource(
                    if (copying) R.string.quick_copy_busy else R.string.quick_copy_title,
                ),
                enabled = !copying,
                onClick = onCopyPrevious,
                modifier = Modifier.weight(1f),
            )
            QuickAction(
                icon = Icons.Outlined.RestaurantMenu,
                title = stringResource(R.string.quick_meal_plan_title),
                onClick = onMealPlan,
                modifier = Modifier.weight(1f),
            )
        }
    }
}

/**
 * One meal: its section heading, its kcal and a single add control, then one
 * card whose logged entries are split by hairlines. An empty slot is one line.
 */
@Composable
internal fun MealSection(
    mealType: MealType,
    logs: List<MealLogUi>,
    onAdd: () -> Unit,
    onEdit: (String) -> Unit,
    onDelete: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val label = stringResource(NutritionFormat.mealLabelRes(mealType))
    Column(modifier = modifier.fillMaxWidth()) {
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            AzfSectionHeading(text = label, modifier = Modifier.weight(1f))
            if (logs.isNotEmpty()) {
                Text(
                    text = stringResource(R.string.kcal_value, NutritionFormat.fmtInt(logs.sumOf { it.kcal })),
                    style = DataSmall,
                    color = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.padding(end = 8.dp),
                )
            }
            CircleIconControl(
                icon = Icons.Outlined.Add,
                contentDescription = stringResource(R.string.timeline_add_to, label),
                tint = MaterialTheme.colorScheme.primary,
                onClick = onAdd,
            )
        }
        AzfCard(modifier = Modifier.fillMaxWidth()) {
            if (logs.isEmpty()) {
                Text(
                    text = stringResource(R.string.timeline_not_logged),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(vertical = 4.dp),
                )
            }
            logs.forEachIndexed { index, log ->
                if (index > 0) HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                MealLogRow(
                    log = log,
                    mealLabel = label,
                    onEdit = { onEdit(log.localId) },
                    onDelete = { onDelete(log.localId) },
                )
            }
        }
    }
}

@Composable
private fun MealLogRow(
    log: MealLogUi,
    mealLabel: String,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) {
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
            Text(
                text = log.title,
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            Text(
                text = stringResource(R.string.kcal_value, NutritionFormat.fmtInt(log.kcal)),
                style = DataSmall,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.padding(start = 12.dp),
            )
        }
        if (log.itemsLine.isNotBlank()) {
            Text(
                text = log.itemsLine,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 4.dp),
            )
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = stringResource(
                        R.string.macro_line,
                        NutritionFormat.fmt1(log.proteinG),
                        NutritionFormat.fmt1(log.carbsG),
                        NutritionFormat.fmt1(log.fatG),
                    ),
                    style = DataSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                when (log.badge) {
                    MealSyncBadge.None -> if (log.fromPhoto) {
                        Text(
                            text = stringResource(R.string.timeline_from_photo),
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }

                    MealSyncBadge.Pending -> Text(
                        text = stringResource(R.string.timeline_pending),
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )

                    MealSyncBadge.Failed -> Text(
                        text = stringResource(R.string.timeline_failed),
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }
            IconButton(onClick = onEdit, modifier = Modifier.size(AzfSpacing.TouchTarget)) {
                Icon(
                    imageVector = Icons.Outlined.Edit,
                    contentDescription = stringResource(R.string.timeline_edit, mealLabel),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            IconButton(onClick = onDelete, modifier = Modifier.size(AzfSpacing.TouchTarget)) {
                Icon(
                    imageVector = Icons.Outlined.Delete,
                    contentDescription = stringResource(R.string.timeline_delete, mealLabel),
                    tint = MaterialTheme.colorScheme.error,
                )
            }
        }
    }
}

/** Seven-day kcal bars; the selected day is lit in the action colour. */
@Composable
internal fun WeeklyKcalBars(
    trend: List<DayValue>,
    selectedDate: String,
    loading: Boolean,
    modifier: Modifier = Modifier,
) {
    val hasData = trend.any { it.value > 0 }
    AzfCard(modifier = modifier.fillMaxWidth()) {
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            AzfSectionHeading(text = stringResource(R.string.weekly_title), modifier = Modifier.weight(1f))
            if (hasData) {
                Text(
                    text = stringResource(
                        R.string.weekly_avg,
                        NutritionFormat.fmtInt(trend.sumOf { it.value } / trend.size),
                    ),
                    style = DataSmall,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }
        }
        Spacer(Modifier.height(AzfSpacing.ElementGapMedium))
        when {
            loading && trend.isEmpty() -> Skeleton(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(128.dp),
            )

            !hasData -> Text(
                text = stringResource(R.string.weekly_empty),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            else -> {
                val window = trend.takeLast(WEEK_DAYS)
                val max = window.maxOf { it.value }
                val chartDescription = stringResource(R.string.weekly_chart_cd)
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(128.dp)
                        .semantics { contentDescription = chartDescription },
                    verticalAlignment = Alignment.Bottom,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    window.forEach { point ->
                        KcalBar(
                            point = point,
                            max = max,
                            selected = point.date == selectedDate,
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun KcalBar(
    point: DayValue,
    max: Double,
    selected: Boolean,
    modifier: Modifier = Modifier,
) {
    val extended = LocalAzfExtended.current
    // Bar height is the only thing carrying the value, and the visible label
    // is a single letter. Without this the whole chart reads "M T W T F S S".
    val barDescription = stringResource(
        if (selected) R.string.weekly_bar_selected_cd else R.string.weekly_bar_cd,
        NutritionFormat.fullWeekday(point.date),
        // Grouped, like every other spoken calorie figure: "1,840" is read as
        // a number, "1840" is read as four digits.
        NutritionFormat.fmtInt(point.value),
    )
    Column(
        modifier = modifier
            .fillMaxHeight()
            .clearAndSetSemantics { contentDescription = barDescription },
        verticalArrangement = Arrangement.Bottom,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f),
            contentAlignment = Alignment.BottomCenter,
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .fillMaxHeight(NutritionMath.barFraction(point.value, max))
                    .clip(RoundedCornerShape(topStart = 8.dp, topEnd = 8.dp))
                    .then(
                        if (selected) {
                            Modifier.background(extended.primaryFixedDim)
                        } else if (point.value > 0) {
                            Modifier.background(extended.primaryFixedDim.copy(alpha = 0.25f))
                        } else {
                            Modifier.background(MaterialTheme.colorScheme.surfaceContainerHighest)
                        },
                    ),
            )
        }
        Text(
            text = NutritionFormat.narrowWeekday(point.date),
            style = MaterialTheme.typography.labelMedium,
            color = if (selected) {
                MaterialTheme.colorScheme.primary
            } else {
                MaterialTheme.colorScheme.onSurfaceVariant
            },
            modifier = Modifier.padding(top = 8.dp),
        )
    }
}

// ----------------------------------------------------------------- atoms

@Composable
private fun MicroRow(labelRes: Int, value: String, divider: Boolean = true) {
    AzfStatRow(
        label = stringResource(labelRes),
        value = value,
        valueStyle = DataSmall,
        divider = divider,
    )
}

@Composable
private fun QuickAction(
    icon: ImageVector,
    title: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    val interaction = remember { MutableInteractionSource() }
    Row(
        modifier = modifier
            .alpha(if (enabled) 1f else 0.5f)
            .pressScale(interaction)
            .heightIn(min = 56.dp)
            .clip(AzfShapes.Inner)
            .background(MaterialTheme.colorScheme.surfaceContainerLow)
            .clickable(
                interactionSource = interaction,
                indication = null,
                enabled = enabled,
                role = Role.Button,
                onClick = onClick,
            )
            .padding(horizontal = AzfSpacing.ElementGapMedium, vertical = AzfSpacing.ElementGapSmall),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.size(24.dp),
        )
        Text(
            text = title,
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 2,
            modifier = Modifier.padding(start = 12.dp),
        )
    }
}

private const val WEEK_DAYS = 7

// ----------------------------------------------------------------- previews

private val previewNutrition = LocalDailyNutrition(
    kcalTarget = 2400.0,
    kcalConsumed = 1100.0,
    kcalRemaining = 1300.0,
    proteinConsumed = 62.0,
    proteinTarget = 140.0,
    carbsConsumed = 107.0,
    carbsTarget = 220.0,
    fatConsumed = 30.0,
    fatTarget = 70.0,
    waterConsumedMl = 1250,
    waterTargetMl = 2000,
)

@Preview(showBackground = true, backgroundColor = 0xFF0E1416)
@Composable
private fun DaySwitcherPreview() {
    AzfTheme {
        Column(Modifier.padding(16.dp)) {
            DaySwitcher(
                selectedDate = "2026-08-26",
                isToday = false,
                onShiftDay = {},
                onOpenCalendar = {},
                onBackToToday = {},
            )
        }
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416)
@Composable
private fun CaloriesRemainingCardPreview() {
    AzfTheme {
        Column(Modifier.padding(16.dp)) {
            CaloriesRemainingCard(nutrition = previewNutrition, kcalBurned = 320.0)
        }
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416)
@Composable
private fun MicronutrientCardPreview() {
    AzfTheme {
        Column(Modifier.padding(16.dp)) {
            MicronutrientCard(
                micros = Micronutrients(28.4, 41.2, 1840, 2650, 720, 11.3),
                expanded = true,
                onToggle = {},
            )
        }
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416)
@Composable
private fun QuickActionsPreview() {
    AzfTheme {
        Column(Modifier.padding(16.dp)) {
            QuickActions(
                copying = false,
                barcodeEnabled = true,
                onCaptureMeal = {},
                onScanBarcode = {},
                onCopyPrevious = {},
                onMealPlan = {},
            )
        }
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416)
@Composable
private fun MealSectionPreview() {
    AzfTheme {
        Column(Modifier.padding(16.dp)) {
            MealSection(
                mealType = MealType.BREAKFAST,
                logs = listOf(
                    MealLogUi(
                        localId = "1",
                        mealType = MealType.BREAKFAST,
                        title = "Porridge, blueberries",
                        itemsLine = "Porridge 80g · Blueberries 60g",
                        kcal = 430.0,
                        proteinG = 14.0,
                        carbsG = 68.0,
                        fatG = 9.0,
                        fromPhoto = false,
                        badge = MealSyncBadge.Pending,
                        items = emptyList(),
                    ),
                ),
                onAdd = {},
                onEdit = {},
                onDelete = {},
            )
            Spacer(Modifier.height(20.dp))
            MealSection(
                mealType = MealType.LUNCH,
                logs = emptyList(),
                onAdd = {},
                onEdit = {},
                onDelete = {},
            )
        }
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416)
@Composable
private fun WeeklyKcalBarsPreview() {
    AzfTheme {
        Column(Modifier.padding(16.dp)) {
            WeeklyKcalBars(
                trend = listOf(
                    DayValue("2026-08-21", 2100.0),
                    DayValue("2026-08-22", 1850.0),
                    DayValue("2026-08-23", 0.0),
                    DayValue("2026-08-24", 2320.0),
                    DayValue("2026-08-25", 1990.0),
                    DayValue("2026-08-26", 2210.0),
                    DayValue("2026-08-27", 1100.0),
                ),
                selectedDate = "2026-08-27",
                loading = false,
            )
        }
    }
}
