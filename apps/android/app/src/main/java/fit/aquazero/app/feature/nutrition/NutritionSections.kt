package fit.aquazero.app.feature.nutrition

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AddCircleOutline
import androidx.compose.material.icons.outlined.Biotech
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
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import fit.aquazero.app.R
import fit.aquazero.app.core.common.LocalDailyNutrition
import fit.aquazero.app.core.designsystem.AzfCard
import fit.aquazero.app.core.designsystem.AzfCardTier
import fit.aquazero.app.core.designsystem.AzfShapes
import fit.aquazero.app.core.designsystem.AzfSpacing
import fit.aquazero.app.core.designsystem.AzfTheme
import fit.aquazero.app.core.designsystem.DataLarge
import fit.aquazero.app.core.designsystem.DataSmall
import fit.aquazero.app.core.designsystem.LocalAzfExtended
import fit.aquazero.app.core.designsystem.RingProgress
import fit.aquazero.app.core.designsystem.Skeleton
import fit.aquazero.app.core.designsystem.pressScale
import fit.aquazero.app.core.model.MealType
import fit.aquazero.app.core.ui.MacroRow
import fit.aquazero.app.core.ui.NutritionFormat

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
        RoundIconButton(
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
                        onClick = onOpenCalendar,
                    )
                    .padding(horizontal = 12.dp, vertical = 6.dp),
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
                        .padding(start = 6.dp)
                        .size(18.dp),
                )
            }
            if (!isToday) {
                Text(
                    text = stringResource(R.string.nutrition_back_to_today).uppercase(),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier
                        .clip(AzfShapes.Pill)
                        .clickable(onClick = onBackToToday)
                        .padding(horizontal = 8.dp, vertical = 4.dp),
                )
            }
        }
        RoundIconButton(
            icon = Icons.Outlined.ChevronRight,
            contentDescription = stringResource(R.string.nutrition_next_day),
            enabled = !isToday,
            onClick = { onShiftDay(1) },
        )
    }
}

/** Calories-remaining hero with the goal − food + exercise formula row. */
@Composable
internal fun CaloriesRemainingCard(
    nutrition: LocalDailyNutrition,
    kcalBurned: Double,
    modifier: Modifier = Modifier,
) {
    AzfCard(modifier = modifier.fillMaxWidth(), tier = AzfCardTier.Hero) {
        Text(
            text = stringResource(R.string.nutrition_calories_remaining).uppercase(),
            style = MaterialTheme.typography.headlineMedium,
            color = MaterialTheme.colorScheme.onSurface,
        )
        Spacer(Modifier.height(AzfSpacing.ElementGapMedium))
        Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
            RingProgress(
                progress = NutritionFormat.clampFraction(
                    nutrition.kcalConsumed,
                    nutrition.kcalTarget,
                ),
                size = 160.dp,
                strokeWidth = 8.dp,
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        text = NutritionFormat.fmtInt(nutrition.kcalRemaining.coerceAtLeast(0.0)),
                        style = DataLarge,
                        color = MaterialTheme.colorScheme.primary,
                    )
                    Text(
                        text = stringResource(R.string.dashboard_kcal_left).uppercase(),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 4.dp),
                    )
                }
            }
        }
        Spacer(Modifier.height(AzfSpacing.ElementGapMedium))

        val formulaDescription = stringResource(
            R.string.nutrition_formula_cd,
            NutritionFormat.fmtInt(nutrition.kcalTarget),
            NutritionFormat.fmtInt(nutrition.kcalConsumed),
            NutritionFormat.fmtInt(kcalBurned),
            NutritionFormat.fmtInt(nutrition.kcalRemaining),
        )
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .semantics { contentDescription = formulaDescription },
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            FormulaCell(
                value = NutritionFormat.fmtInt(nutrition.kcalTarget),
                label = stringResource(R.string.nutrition_goal),
                modifier = Modifier.weight(1f),
            )
            FormulaCell(
                value = "− ${NutritionFormat.fmtInt(nutrition.kcalConsumed)}",
                label = stringResource(R.string.nutrition_food),
                modifier = Modifier.weight(1f),
            )
            FormulaCell(
                value = "+ ${NutritionFormat.fmtInt(kcalBurned)}",
                label = stringResource(R.string.nutrition_exercise),
                modifier = Modifier.weight(1f),
            )
            FormulaCell(
                value = NutritionFormat.fmtInt(nutrition.kcalRemaining),
                label = stringResource(R.string.nutrition_remaining),
                accent = true,
                modifier = Modifier.weight(1f),
            )
        }
    }
}

/** Full-width macro bars: protein green, carbs aqua, fat coral. */
@Composable
internal fun MacroCard(nutrition: LocalDailyNutrition, modifier: Modifier = Modifier) {
    val extended = LocalAzfExtended.current
    AzfCard(modifier = modifier.fillMaxWidth()) {
        Text(
            text = stringResource(R.string.nutrition_macros).uppercase(),
            style = MaterialTheme.typography.headlineSmall,
            color = MaterialTheme.colorScheme.onSurface,
        )
        Spacer(Modifier.height(AzfSpacing.ElementGapMedium))
        MacroRow(
            label = stringResource(R.string.macro_protein),
            consumed = nutrition.proteinConsumed,
            target = nutrition.proteinTarget,
            color = extended.secondaryFixedDim,
        )
        Spacer(Modifier.height(12.dp))
        MacroRow(
            label = stringResource(R.string.macro_carbs),
            consumed = nutrition.carbsConsumed,
            target = nutrition.carbsTarget,
            color = extended.primaryFixedDim,
        )
        Spacer(Modifier.height(12.dp))
        MacroRow(
            label = stringResource(R.string.macro_fat),
            consumed = nutrition.fatConsumed,
            target = nutrition.fatTarget,
            color = extended.coral,
        )
    }
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
                .clickable(onClick = onToggle)
                .semantics { contentDescription = toggleLabel },
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = Icons.Outlined.Biotech,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
            )
            Text(
                text = stringResource(R.string.nutrition_micros).uppercase(),
                style = MaterialTheme.typography.headlineSmall,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier
                    .padding(start = 8.dp)
                    .weight(1f),
            )
            Icon(
                imageVector = Icons.Outlined.ExpandMore,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.rotate(if (expanded) 180f else 0f),
            )
        }
        AnimatedVisibility(visible = expanded) {
            Column(modifier = Modifier.padding(top = AzfSpacing.ElementGapMedium)) {
                MicroRow(
                    labelRes = R.string.micro_fiber,
                    value = stringResource(
                        R.string.unit_grams,
                        NutritionFormat.fmt1(micros.fiberG),
                    ),
                )
                MicroRow(
                    labelRes = R.string.micro_sugar,
                    value = stringResource(
                        R.string.unit_grams,
                        NutritionFormat.fmt1(micros.sugarG),
                    ),
                )
                MicroRow(
                    labelRes = R.string.micro_sodium,
                    value = stringResource(
                        R.string.unit_milligrams,
                        micros.sodiumMg.toString(),
                    ),
                )
                MicroRow(
                    labelRes = R.string.micro_potassium,
                    value = stringResource(
                        R.string.unit_milligrams,
                        micros.potassiumMg.toString(),
                    ),
                )
                MicroRow(
                    labelRes = R.string.micro_calcium,
                    value = stringResource(
                        R.string.unit_milligrams,
                        micros.calciumMg.toString(),
                    ),
                )
                MicroRow(
                    labelRes = R.string.micro_iron,
                    value = stringResource(
                        R.string.unit_milligrams,
                        NutritionFormat.fmt1(micros.ironMg),
                    ),
                )
            }
        }
    }
}

/** Four quick actions: photo, barcode, copy-previous, meal plan. */
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
    Column(modifier = modifier.fillMaxWidth()) {
        Row(modifier = Modifier.fillMaxWidth()) {
            QuickAction(
                icon = Icons.Outlined.PhotoCamera,
                title = stringResource(R.string.quick_scan_title),
                subtitle = stringResource(R.string.quick_scan_sub),
                onClick = onCaptureMeal,
                modifier = Modifier.weight(1f),
            )
            Spacer(Modifier.width(12.dp))
            QuickAction(
                icon = Icons.Outlined.QrCodeScanner,
                title = stringResource(R.string.quick_barcode_title),
                subtitle = stringResource(
                    if (barcodeEnabled) R.string.quick_barcode_sub else R.string.quick_barcode_unavailable,
                ),
                enabled = barcodeEnabled,
                onClick = onScanBarcode,
                modifier = Modifier.weight(1f),
            )
        }
        Spacer(Modifier.height(12.dp))
        Row(modifier = Modifier.fillMaxWidth()) {
            QuickAction(
                icon = Icons.Outlined.ContentCopy,
                title = stringResource(
                    if (copying) R.string.quick_copy_busy else R.string.quick_copy_title,
                ),
                subtitle = stringResource(R.string.quick_copy_sub),
                enabled = !copying,
                accent = LocalAzfExtended.current.secondaryFixedDim,
                onClick = onCopyPrevious,
                modifier = Modifier.weight(1f),
            )
            Spacer(Modifier.width(12.dp))
            QuickAction(
                icon = Icons.Outlined.RestaurantMenu,
                title = stringResource(R.string.quick_meal_plan_title),
                subtitle = stringResource(R.string.quick_meal_plan_sub),
                accent = LocalAzfExtended.current.secondaryFixedDim,
                onClick = onMealPlan,
                modifier = Modifier.weight(1f),
            )
        }
    }
}

/** One meal-type block of the timeline: header, logs (or a tap-to-add row). */
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
            Icon(
                imageVector = NutritionFormat.mealIcon(mealType),
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(20.dp),
            )
            Text(
                text = label,
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier
                    .padding(start = 8.dp)
                    .weight(1f),
            )
            if (logs.isNotEmpty()) {
                Text(
                    text = stringResource(
                        R.string.kcal_value,
                        NutritionFormat.fmtInt(logs.sumOf { it.kcal }),
                    ),
                    style = DataSmall,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
            IconButton(
                onClick = onAdd,
                modifier = Modifier.size(AzfSpacing.TouchTarget),
            ) {
                Icon(
                    imageVector = Icons.Outlined.AddCircleOutline,
                    contentDescription = stringResource(R.string.timeline_add_to, label),
                    tint = MaterialTheme.colorScheme.primary,
                )
            }
        }
        Spacer(Modifier.height(8.dp))
        if (logs.isEmpty()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(AzfShapes.Inner)
                    .background(MaterialTheme.colorScheme.surfaceContainerLow)
                    .border(
                        BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                        AzfShapes.Inner,
                    )
                    .clickable(onClick = onAdd)
                    .padding(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    modifier = Modifier
                        .size(48.dp)
                        .clip(AzfShapes.Inner)
                        .background(MaterialTheme.colorScheme.surfaceContainerHighest),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = Icons.Outlined.PhotoCamera,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.outline,
                    )
                }
                Column(modifier = Modifier.padding(start = 12.dp)) {
                    Text(
                        text = stringResource(R.string.timeline_not_logged),
                        style = MaterialTheme.typography.titleSmall,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    Text(
                        text = stringResource(R.string.timeline_tap_to_add, label.lowercase()),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        } else {
            logs.forEachIndexed { index, log ->
                if (index > 0) Spacer(Modifier.height(8.dp))
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
    AzfCard(tier = AzfCardTier.Compact, modifier = Modifier.fillMaxWidth()) {
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
                color = MaterialTheme.colorScheme.primary,
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
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 8.dp),
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
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }

                    MealSyncBadge.Pending -> Text(
                        text = stringResource(R.string.timeline_pending),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )

                    MealSyncBadge.Failed -> Text(
                        text = stringResource(R.string.timeline_failed),
                        style = MaterialTheme.typography.labelSmall,
                        color = LocalAzfExtended.current.coral,
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
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

/** Seven-day kcal bars; the selected day is lit with the CTA gradient. */
@Composable
internal fun WeeklyKcalBars(
    trend: List<DayValue>,
    selectedDate: String,
    loading: Boolean,
    modifier: Modifier = Modifier,
) {
    AzfCard(modifier = modifier.fillMaxWidth()) {
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = stringResource(R.string.weekly_title).uppercase(),
                style = MaterialTheme.typography.headlineSmall,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.weight(1f),
            )
            if (trend.isNotEmpty()) {
                Text(
                    text = stringResource(
                        R.string.weekly_avg,
                        NutritionFormat.fmtInt(trend.sumOf { it.value } / trend.size),
                    ),
                    style = DataSmall,
                    color = LocalAzfExtended.current.secondaryFixedDim,
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

            trend.isEmpty() -> Text(
                text = stringResource(R.string.weekly_empty),
                style = MaterialTheme.typography.bodySmall,
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
    Column(
        modifier = modifier.fillMaxHeight(),
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
                            Modifier.background(extended.ctaGradient)
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
            style = MaterialTheme.typography.labelSmall,
            color = if (selected) {
                MaterialTheme.colorScheme.primary
            } else {
                MaterialTheme.colorScheme.onSurfaceVariant
            },
            modifier = Modifier.padding(top = 6.dp),
        )
    }
}

// ----------------------------------------------------------------- atoms

@Composable
private fun RoundIconButton(
    icon: ImageVector,
    contentDescription: String,
    onClick: () -> Unit,
    enabled: Boolean = true,
) {
    val interaction = remember { MutableInteractionSource() }
    Box(
        modifier = Modifier
            .size(AzfSpacing.TouchTarget)
            .alpha(if (enabled) 1f else 0.4f)
            .pressScale(interaction)
            .clip(AzfShapes.Pill)
            .background(MaterialTheme.colorScheme.surfaceContainerHigh)
            .border(
                BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                AzfShapes.Pill,
            )
            .clickable(
                interactionSource = interaction,
                indication = null,
                enabled = enabled,
                onClick = onClick,
            ),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = contentDescription,
            tint = MaterialTheme.colorScheme.onSurface,
        )
    }
}

@Composable
private fun FormulaCell(
    value: String,
    label: String,
    modifier: Modifier = Modifier,
    accent: Boolean = false,
) {
    Column(modifier = modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            text = value,
            style = DataSmall,
            color = if (accent) {
                MaterialTheme.colorScheme.primary
            } else {
                MaterialTheme.colorScheme.onSurface
            },
        )
        Text(
            text = label.uppercase(),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 2.dp),
        )
    }
}

@Composable
private fun MicroRow(labelRes: Int, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = stringResource(labelRes),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.weight(1f),
        )
        Text(
            text = value,
            style = DataSmall,
            color = MaterialTheme.colorScheme.onSurface,
        )
    }
}

@Composable
private fun QuickAction(
    icon: ImageVector,
    title: String,
    subtitle: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    accent: Color = Color.Unspecified,
) {
    val interaction = remember { MutableInteractionSource() }
    val tint = if (accent == Color.Unspecified) MaterialTheme.colorScheme.primary else accent
    Column(
        modifier = modifier
            .alpha(if (enabled) 1f else 0.5f)
            .pressScale(interaction)
            .clip(AzfShapes.Card)
            .background(MaterialTheme.colorScheme.surfaceContainerLow)
            .border(
                BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f)),
                AzfShapes.Card,
            )
            .clickable(
                interactionSource = interaction,
                indication = null,
                enabled = enabled,
                onClick = onClick,
            )
            .padding(16.dp),
    ) {
        Icon(imageVector = icon, contentDescription = null, tint = tint)
        Text(
            text = title,
            style = MaterialTheme.typography.titleSmall,
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.padding(top = 8.dp),
        )
        Text(
            text = subtitle,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
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
private fun MacroCardPreview() {
    AzfTheme {
        Column(Modifier.padding(16.dp)) { MacroCard(previewNutrition) }
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
