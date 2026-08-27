package fit.aquazero.app.feature.nutrition

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.PhotoCamera
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import fit.aquazero.app.R
import fit.aquazero.app.core.common.LocalDailyNutrition
import fit.aquazero.app.core.designsystem.AzfAppHeader
import fit.aquazero.app.core.designsystem.AzfSpacing
import fit.aquazero.app.core.designsystem.AzfTheme
import fit.aquazero.app.core.designsystem.EmptyState
import fit.aquazero.app.core.designsystem.ErrorState
import fit.aquazero.app.core.designsystem.LocalAzfExtended
import fit.aquazero.app.core.designsystem.revealOnEnter
import fit.aquazero.app.core.model.FoodDto
import fit.aquazero.app.core.model.MealType
import fit.aquazero.app.feature.dashboard.CardSkeleton
import fit.aquazero.app.feature.dashboard.HydrationCard
import fit.aquazero.app.feature.dashboard.NutritionFormat
import fit.aquazero.app.feature.dashboard.rememberToastSink

/**
 * The nutrition day view — a port of `apps/web/src/pages/nutrition/Nutrition.tsx`.
 *
 * Mobile deviations, all deliberate:
 *  - the web's concentric/single macro-ring toggle is dropped in favour of a
 *    single ring plus full-width macro bars (one less control on a phone,
 *    same information);
 *  - the add-food and edit sheets are real `ModalBottomSheet`s;
 *  - "copy yesterday's" replays the source day's logs through the offline
 *    outbox rather than firing N parallel POSTs, so it works on a plane.
 */
@Composable
fun NutritionScreen(
    onNavigateToCapture: () -> Unit,
    modifier: Modifier = Modifier,
    onNavigateToMealPlan: () -> Unit = {},
    onNavigateToBarcode: (() -> Unit)? = null,
    viewModel: NutritionViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val toasts = rememberToastSink()

    LaunchedEffect(viewModel) {
        viewModel.events.collect { event ->
            when (event) {
                is NutritionEvent.Message -> toasts.show(
                    context.getString(event.messageRes),
                    event.kind,
                )
            }
        }
    }

    NutritionContent(
        state = state,
        onRetry = viewModel::refresh,
        onShiftDay = viewModel::shiftDay,
        onSelectDate = viewModel::selectDate,
        onOpenCalendar = { viewModel.setCalendarOpen(true) },
        onCloseCalendar = { viewModel.setCalendarOpen(false) },
        onToggleMicros = viewModel::toggleMicros,
        onLogWater = { viewModel.logWater() },
        onCopyPrevious = viewModel::copyPreviousDay,
        onAddFood = viewModel::openFoodSearch,
        onCloseFoodSearch = viewModel::closeFoodSearch,
        onSearchTermChange = viewModel::onSearchTermChange,
        onSelectFood = viewModel::selectFood,
        onClearSelectedFood = viewModel::clearSelectedFood,
        onGramsChange = viewModel::setGrams,
        onConfirmAddFood = viewModel::confirmAddFood,
        onStartEditing = viewModel::startEditing,
        onCancelEditing = viewModel::cancelEditing,
        onEditRowGrams = viewModel::setEditRowGrams,
        onRemoveEditRow = viewModel::removeEditRow,
        onSaveEdit = viewModel::saveEdit,
        onDeleteMeal = viewModel::deleteMeal,
        onCaptureMeal = onNavigateToCapture,
        onMealPlan = onNavigateToMealPlan,
        onScanBarcode = onNavigateToBarcode,
        modifier = modifier,
    )
}

/** Stateless nutrition body. */
@Composable
fun NutritionContent(
    state: NutritionUiState,
    onRetry: () -> Unit,
    onShiftDay: (Long) -> Unit,
    onSelectDate: (String) -> Unit,
    onOpenCalendar: () -> Unit,
    onCloseCalendar: () -> Unit,
    onToggleMicros: () -> Unit,
    onLogWater: () -> Unit,
    onCopyPrevious: () -> Unit,
    onAddFood: (MealType) -> Unit,
    onCloseFoodSearch: () -> Unit,
    onSearchTermChange: (String) -> Unit,
    onSelectFood: (FoodDto) -> Unit,
    onClearSelectedFood: () -> Unit,
    onGramsChange: (Int) -> Unit,
    onConfirmAddFood: () -> Unit,
    onStartEditing: (String) -> Unit,
    onCancelEditing: () -> Unit,
    onEditRowGrams: (Int, Int) -> Unit,
    onRemoveEditRow: (Int) -> Unit,
    onSaveEdit: () -> Unit,
    onDeleteMeal: (String) -> Unit,
    onCaptureMeal: () -> Unit,
    onMealPlan: () -> Unit,
    onScanBarcode: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    Scaffold(
        modifier = modifier.fillMaxSize(),
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            AzfAppHeader(title = stringResource(R.string.screen_nutrition).uppercase())
        },
        floatingActionButton = {
            FloatingActionButton(
                onClick = onCaptureMeal,
                containerColor = LocalAzfExtended.current.primaryFixedDim,
                contentColor = MaterialTheme.colorScheme.onPrimary,
                modifier = Modifier.size(56.dp),
            ) {
                Icon(
                    imageVector = Icons.Outlined.PhotoCamera,
                    contentDescription = stringResource(R.string.fab_capture_meal),
                )
            }
        },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .padding(innerPadding)
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(
                    PaddingValues(
                        start = AzfSpacing.ContainerMargin,
                        end = AzfSpacing.ContainerMargin,
                        top = AzfSpacing.ElementGapMedium,
                        bottom = AzfSpacing.SectionGap,
                    ),
                ),
        ) {
            DaySwitcher(
                selectedDate = state.selectedDate,
                isToday = state.isToday,
                onShiftDay = onShiftDay,
                onOpenCalendar = onOpenCalendar,
                onBackToToday = { onSelectDate(state.today) },
                modifier = Modifier.revealOnEnter(0),
            )

            Spacer(Modifier.height(AzfSpacing.Gutter))

            when {
                state.phase == NutritionPhase.Error && !state.hasContent -> {
                    ErrorState(
                        title = stringResource(R.string.nutrition_error_title),
                        message = stringResource(R.string.nutrition_error_message),
                        retryLabel = stringResource(R.string.action_retry),
                        onRetry = onRetry,
                    )
                }

                state.nutrition == null -> {
                    CardSkeleton(height = 280.dp, modifier = Modifier.revealOnEnter(1))
                    Spacer(Modifier.height(AzfSpacing.Gutter))
                    CardSkeleton(height = 180.dp, modifier = Modifier.revealOnEnter(2))
                    Spacer(Modifier.height(AzfSpacing.Gutter))
                    CardSkeleton(height = 180.dp, modifier = Modifier.revealOnEnter(3))
                }

                else -> {
                    CaloriesRemainingCard(
                        nutrition = state.nutrition,
                        kcalBurned = state.kcalBurned,
                        modifier = Modifier.revealOnEnter(1),
                    )
                    Spacer(Modifier.height(AzfSpacing.Gutter))

                    MacroCard(
                        nutrition = state.nutrition,
                        modifier = Modifier.revealOnEnter(2),
                    )
                    Spacer(Modifier.height(AzfSpacing.Gutter))

                    HydrationCard(
                        consumedMl = state.waterConsumedMl,
                        targetMl = state.nutrition.waterTargetMl,
                        pending = state.waterPending,
                        onLogWater = onLogWater,
                        modifier = Modifier.revealOnEnter(3),
                    )
                    Spacer(Modifier.height(AzfSpacing.Gutter))

                    MicronutrientCard(
                        micros = state.micronutrients,
                        expanded = state.microsExpanded,
                        onToggle = onToggleMicros,
                        modifier = Modifier.revealOnEnter(4),
                    )
                    Spacer(Modifier.height(AzfSpacing.Gutter))

                    QuickActions(
                        copying = state.copying,
                        barcodeEnabled = onScanBarcode != null,
                        onCaptureMeal = onCaptureMeal,
                        onScanBarcode = { onScanBarcode?.invoke() },
                        onCopyPrevious = onCopyPrevious,
                        onMealPlan = onMealPlan,
                        modifier = Modifier.revealOnEnter(5),
                    )
                    Spacer(Modifier.height(AzfSpacing.SectionGap))

                    MealTimeline(
                        state = state,
                        onAddFood = onAddFood,
                        onStartEditing = onStartEditing,
                        onDeleteMeal = onDeleteMeal,
                    )
                    Spacer(Modifier.height(AzfSpacing.SectionGap))

                    WeeklyKcalBars(
                        trend = state.kcalTrend,
                        selectedDate = state.selectedDate,
                        loading = state.trendLoading,
                    )
                }
            }

            // Clears the FAB and the bottom bar.
            Spacer(Modifier.height(96.dp))
        }
    }

    state.foodSearch?.let { sheet ->
        FoodSearchSheet(
            state = sheet,
            onDismiss = onCloseFoodSearch,
            onTermChange = onSearchTermChange,
            onSelectFood = onSelectFood,
            onClearSelection = onClearSelectedFood,
            onGramsChange = onGramsChange,
            onConfirm = onConfirmAddFood,
        )
    }

    state.editing?.let { editing ->
        EditMealSheet(
            state = editing,
            onDismiss = onCancelEditing,
            onGramsChange = onEditRowGrams,
            onRemoveRow = onRemoveEditRow,
            onSave = onSaveEdit,
        )
    }

    if (state.calendarOpen) {
        AquaCalendarPicker(
            selectedDate = state.selectedDate,
            today = state.today,
            loggedDates = state.kcalTrend.filter { it.value > 0 }.mapTo(mutableSetOf()) { it.date },
            onSelectDate = onSelectDate,
            onDismiss = onCloseCalendar,
        )
    }
}

/** Meal timeline: one block per meal type, with the day-level empty state. */
@Composable
private fun MealTimeline(
    state: NutritionUiState,
    onAddFood: (MealType) -> Unit,
    onStartEditing: (String) -> Unit,
    onDeleteMeal: (String) -> Unit,
) {
    Column(modifier = Modifier.revealOnEnter(6)) {
        Text(
            text = stringResource(R.string.timeline_title).uppercase(),
            style = MaterialTheme.typography.headlineSmall,
            color = MaterialTheme.colorScheme.onSurface,
        )
        Spacer(Modifier.height(AzfSpacing.ElementGapMedium))

        if (state.loggedCount == 0) {
            EmptyState(
                title = stringResource(R.string.timeline_empty_title),
                message = stringResource(
                    if (state.isToday) R.string.timeline_empty_today else R.string.timeline_empty_past,
                ),
                actionLabel = if (state.isToday) {
                    stringResource(R.string.timeline_add_meal)
                } else {
                    null
                },
                onAction = if (state.isToday) {
                    { onAddFood(NutritionFormat.mealTypeForNow()) }
                } else {
                    null
                },
            )
            Spacer(Modifier.height(AzfSpacing.ElementGapMedium))
        }

        NutritionFormat.MEAL_TYPES.forEachIndexed { index, mealType ->
            if (index > 0) Spacer(Modifier.height(AzfSpacing.ElementGapMedium))
            MealSection(
                mealType = mealType,
                logs = state.meals[mealType].orEmpty(),
                onAdd = { onAddFood(mealType) },
                onEdit = onStartEditing,
                onDelete = onDeleteMeal,
            )
        }
    }
}

// ----------------------------------------------------------------- previews

private val previewState = NutritionUiState(
    today = "2026-08-27",
    selectedDate = "2026-08-27",
    phase = NutritionPhase.Ready,
    nutrition = LocalDailyNutrition(
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
    ),
    kcalBurned = 320.0,
    micronutrients = Micronutrients(21.4, 38.0, 1450, 2100, 610, 9.2),
    trendLoading = false,
    kcalTrend = listOf(
        DayValue("2026-08-25", 1990.0),
        DayValue("2026-08-26", 2210.0),
        DayValue("2026-08-27", 1100.0),
    ),
    meals = mapOf(
        MealType.BREAKFAST to listOf(
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
                badge = MealSyncBadge.None,
                items = emptyList(),
            ),
        ),
        MealType.LUNCH to listOf(
            MealLogUi(
                localId = "2",
                mealType = MealType.LUNCH,
                title = "Chicken salad",
                itemsLine = "Chicken breast 150g · Salad 120g",
                kcal = 670.0,
                proteinG = 48.0,
                carbsG = 39.0,
                fatG = 21.0,
                fromPhoto = true,
                badge = MealSyncBadge.Pending,
                items = emptyList(),
            ),
        ),
    ),
)

@Preview(showBackground = true, backgroundColor = 0xFF0E1416, heightDp = 2200)
@Composable
private fun NutritionContentPreview() {
    AzfTheme {
        NutritionContent(
            state = previewState,
            onRetry = {},
            onShiftDay = {},
            onSelectDate = {},
            onOpenCalendar = {},
            onCloseCalendar = {},
            onToggleMicros = {},
            onLogWater = {},
            onCopyPrevious = {},
            onAddFood = {},
            onCloseFoodSearch = {},
            onSearchTermChange = {},
            onSelectFood = {},
            onClearSelectedFood = {},
            onGramsChange = {},
            onConfirmAddFood = {},
            onStartEditing = {},
            onCancelEditing = {},
            onEditRowGrams = { _, _ -> },
            onRemoveEditRow = {},
            onSaveEdit = {},
            onDeleteMeal = {},
            onCaptureMeal = {},
            onMealPlan = {},
            onScanBarcode = {},
        )
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416, heightDp = 900)
@Composable
private fun NutritionSkeletonPreview() {
    AzfTheme {
        NutritionContent(
            state = NutritionUiState(today = "2026-08-27", selectedDate = "2026-08-27"),
            onRetry = {},
            onShiftDay = {},
            onSelectDate = {},
            onOpenCalendar = {},
            onCloseCalendar = {},
            onToggleMicros = {},
            onLogWater = {},
            onCopyPrevious = {},
            onAddFood = {},
            onCloseFoodSearch = {},
            onSearchTermChange = {},
            onSelectFood = {},
            onClearSelectedFood = {},
            onGramsChange = {},
            onConfirmAddFood = {},
            onStartEditing = {},
            onCancelEditing = {},
            onEditRowGrams = { _, _ -> },
            onRemoveEditRow = {},
            onSaveEdit = {},
            onDeleteMeal = {},
            onCaptureMeal = {},
            onMealPlan = {},
            onScanBarcode = null,
        )
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416, heightDp = 900)
@Composable
private fun NutritionErrorPreview() {
    AzfTheme {
        NutritionContent(
            state = NutritionUiState(
                today = "2026-08-27",
                selectedDate = "2026-08-20",
                phase = NutritionPhase.Error,
            ),
            onRetry = {},
            onShiftDay = {},
            onSelectDate = {},
            onOpenCalendar = {},
            onCloseCalendar = {},
            onToggleMicros = {},
            onLogWater = {},
            onCopyPrevious = {},
            onAddFood = {},
            onCloseFoodSearch = {},
            onSearchTermChange = {},
            onSelectFood = {},
            onClearSelectedFood = {},
            onGramsChange = {},
            onConfirmAddFood = {},
            onStartEditing = {},
            onCancelEditing = {},
            onEditRowGrams = { _, _ -> },
            onRemoveEditRow = {},
            onSaveEdit = {},
            onDeleteMeal = {},
            onCaptureMeal = {},
            onMealPlan = {},
            onScanBarcode = null,
        )
    }
}
