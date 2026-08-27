package fit.aquazero.app.feature.training

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.BorderStroke
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.LocalFireDepartment
import androidx.compose.material.icons.outlined.SelfImprovement
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import fit.aquazero.app.R
import fit.aquazero.app.core.designsystem.AzfAppHeader
import fit.aquazero.app.core.designsystem.AzfCard
import fit.aquazero.app.core.designsystem.AzfCardTier
import fit.aquazero.app.core.designsystem.AzfChip
import fit.aquazero.app.core.designsystem.AzfShapes
import fit.aquazero.app.core.designsystem.AzfSpacing
import fit.aquazero.app.core.designsystem.AzfTheme
import fit.aquazero.app.core.designsystem.AzfTextField
import fit.aquazero.app.core.designsystem.DataSmall
import fit.aquazero.app.core.designsystem.EmptyState
import fit.aquazero.app.core.designsystem.ErrorState
import fit.aquazero.app.core.designsystem.LocalAzfExtended
import fit.aquazero.app.core.designsystem.PrimaryButton
import fit.aquazero.app.core.designsystem.SecondaryButton
import fit.aquazero.app.core.designsystem.Skeleton
import fit.aquazero.app.core.designsystem.ToastController
import fit.aquazero.app.core.designsystem.revealOnEnter
import fit.aquazero.app.core.model.Equipment
import fit.aquazero.app.core.model.PlanDayDto
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.format.TextStyle as JavaTextStyle
import java.util.Locale

/**
 * Workout library — the Workouts tab.
 *
 * Weekly plan strip, today's hero with the resolved prescription rendered
 * exactly as the web renders it ("3 × 8–10 @ 40 kg • RiR 2 • 90s rest"), a
 * filtered exercise library with CC-BY-SA attribution on every card, the
 * detail sheet, and the online-only plan-generation sheet.
 */
@Composable
fun WorkoutLibraryScreen(
    modifier: Modifier = Modifier,
    onStartSession: (String) -> Unit = {},
    viewModel: WorkoutLibraryViewModel = hiltViewModel(),
    toastController: ToastController? = null,
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current

    LaunchedEffect(viewModel, toastController) {
        if (toastController == null) return@LaunchedEffect
        viewModel.events.collect { event ->
            when (event) {
                is WorkoutLibraryEvent.PlanGenerated ->
                    toastController.success(context.getString(R.string.training_generate_done))
                is WorkoutLibraryEvent.PlanGenerationOffline ->
                    toastController.info(context.getString(R.string.training_generate_offline))
                is WorkoutLibraryEvent.PlanGenerationFailed ->
                    toastController.error(
                        event.message ?: context.getString(R.string.training_generate_failed),
                    )
            }
        }
    }

    WorkoutLibraryContent(
        state = state,
        modifier = modifier,
        onStartSession = onStartSession,
        onSearchChange = viewModel::onSearchChange,
        onCategoryChange = viewModel::onCategoryChange,
        onMuscleChange = viewModel::onMuscleChange,
        onEquipmentChange = viewModel::onEquipmentChange,
        onLoadMore = viewModel::loadMore,
        onOpenDetail = viewModel::openDetail,
        onCloseDetail = viewModel::closeDetail,
        onOpenGenerate = viewModel::openGenerateSheet,
        onCloseGenerate = viewModel::closeGenerateSheet,
        onDaysPerWeek = viewModel::setGenerateDaysPerWeek,
        onFocus = viewModel::setGenerateFocus,
        onGenerate = viewModel::generatePlan,
        onRetry = viewModel::refresh,
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun WorkoutLibraryContent(
    state: WorkoutLibraryUiState,
    modifier: Modifier = Modifier,
    onStartSession: (String) -> Unit,
    onSearchChange: (String) -> Unit,
    onCategoryChange: (String) -> Unit,
    onMuscleChange: (String) -> Unit,
    onEquipmentChange: (String) -> Unit,
    onLoadMore: () -> Unit,
    onOpenDetail: (String) -> Unit,
    onCloseDetail: () -> Unit,
    onOpenGenerate: () -> Unit,
    onCloseGenerate: () -> Unit,
    onDaysPerWeek: (Int) -> Unit,
    onFocus: (String) -> Unit,
    onGenerate: () -> Unit,
    onRetry: () -> Unit,
) {
    Scaffold(
        modifier = modifier.fillMaxSize(),
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            AzfAppHeader(title = stringResource(R.string.screen_workouts), onBack = null)
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
            // ---------- weekly plan strip ----------
            item(key = "plan-header") {
                SectionHeader(
                    title = stringResource(R.string.training_this_week),
                    trailing = state.plan?.let {
                        stringResource(R.string.training_training_days, state.trainingDays)
                    },
                    modifier = Modifier.revealOnEnter(0),
                )
            }
            item(key = "plan-strip") {
                when {
                    state.loadingPlan -> Skeleton(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(88.dp),
                        shape = AzfShapes.Card,
                    )

                    state.plan != null -> PlanWeekStrip(
                        days = state.planDays,
                        todayCompleted = state.todayCompleted,
                        modifier = Modifier.revealOnEnter(1),
                    )

                    state.planError -> ErrorState(
                        title = stringResource(R.string.training_plan_error_title),
                        message = stringResource(R.string.training_plan_error_body),
                        retryLabel = stringResource(R.string.training_refresh),
                        onRetry = onRetry,
                    )

                    else -> EmptyState(
                        title = stringResource(R.string.training_plan_empty_title),
                        message = stringResource(R.string.training_plan_empty_body),
                        actionLabel = stringResource(R.string.training_generate_plan),
                        onAction = onOpenGenerate,
                    )
                }
            }

            // ---------- today's workout hero ----------
            item(key = "today") {
                Spacer(modifier = Modifier.height(AzfSpacing.ElementGapMedium))
                when {
                    state.loadingToday -> Skeleton(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(220.dp),
                        shape = AzfShapes.Card,
                    )

                    state.todaySession != null -> {
                        val sessionId = state.todaySession.id
                        TodayHeroCard(
                            state = state,
                            onStart = { onStartSession(sessionId) },
                            modifier = Modifier.revealOnEnter(2),
                        )
                    }

                    state.todayError -> ErrorState(
                        title = stringResource(R.string.session_error_title),
                        message = stringResource(R.string.session_error_body),
                        retryLabel = stringResource(R.string.training_refresh),
                        onRetry = onRetry,
                    )

                    state.plan != null -> RestDayCard(modifier = Modifier.revealOnEnter(2))

                    else -> Spacer(modifier = Modifier.height(0.dp))
                }
            }

            // ---------- exercise library ----------
            item(key = "library-header") {
                Spacer(modifier = Modifier.height(AzfSpacing.ElementGapMedium))
                SectionHeader(
                    title = stringResource(R.string.training_library),
                    trailing = stringResource(R.string.training_library_count, state.totalMatches),
                )
            }
            item(key = "library-search") {
                AzfTextField(
                    value = state.filters.search,
                    onValueChange = onSearchChange,
                    label = stringResource(R.string.training_search_hint),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                )
            }
            item(key = "filter-category") {
                FilterChipRow(
                    label = stringResource(R.string.training_filter_category),
                    options = ExerciseFilters.categories.map { (key, res) ->
                        key to stringResource(res)
                    },
                    selected = state.filters.category,
                    onSelect = onCategoryChange,
                )
            }
            item(key = "filter-muscle") {
                FilterChipRow(
                    label = stringResource(R.string.training_filter_muscle),
                    options = ExerciseFilters.muscles.map { (key, res) ->
                        key to stringResource(res)
                    },
                    selected = state.filters.muscle,
                    onSelect = onMuscleChange,
                )
            }
            item(key = "filter-equipment") {
                FilterChipRow(
                    label = stringResource(R.string.training_filter_equipment),
                    options = buildList {
                        add("" to stringResource(R.string.equipment_all))
                        ExerciseFilters.equipment.forEach { eq ->
                            add(eq.name to stringResource(equipmentLabelRes(eq)))
                        }
                    },
                    selected = state.filters.equipment,
                    onSelect = onEquipmentChange,
                )
            }

            when {
                state.loadingLibrary && state.exercises.isEmpty() -> items(
                    count = 3,
                    key = { "library-skeleton-$it" },
                ) {
                    Skeleton(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(84.dp),
                        shape = AzfShapes.Card,
                    )
                }

                state.exercises.isEmpty() && state.catalogEmpty -> item(key = "catalog-empty") {
                    EmptyState(
                        title = stringResource(R.string.training_catalog_empty_title),
                        message = stringResource(R.string.training_catalog_empty_body),
                        actionLabel = stringResource(R.string.training_refresh),
                        onAction = onRetry,
                    )
                }

                state.exercises.isEmpty() -> item(key = "library-empty") {
                    EmptyState(
                        title = stringResource(R.string.training_no_results_title),
                        message = stringResource(R.string.training_no_results_body),
                    )
                }

                else -> {
                    items(state.exercises, key = { it.id }) { card ->
                        ExerciseListCard(card = card, onClick = { onOpenDetail(card.id) })
                    }
                    if (state.hasMore) {
                        item(key = "library-more") {
                            SecondaryButton(
                                text = stringResource(
                                    R.string.training_load_more,
                                    state.exercises.size,
                                    state.totalMatches,
                                ),
                                onClick = onLoadMore,
                            )
                        }
                    }
                }
            }
        }
    }

    val detail = state.detail
    if (detail != null) {
        ExerciseDetailSheet(detail = detail, onDismiss = onCloseDetail)
    }

    if (state.generateSheetOpen) {
        val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        ModalBottomSheet(
            onDismissRequest = onCloseGenerate,
            sheetState = sheetState,
            containerColor = MaterialTheme.colorScheme.surfaceContainerLow,
        ) {
            GeneratePlanSheetBody(
                daysPerWeek = state.generateDaysPerWeek,
                focus = state.generateFocus,
                generating = state.generating,
                onDaysPerWeek = onDaysPerWeek,
                onFocus = onFocus,
                onGenerate = onGenerate,
                onCancel = onCloseGenerate,
            )
        }
    }
}

// ---------------------------------------------------------------------------
// Sub-composables
// ---------------------------------------------------------------------------

@Composable
private fun SectionHeader(
    title: String,
    modifier: Modifier = Modifier,
    trailing: String? = null,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(top = AzfSpacing.ElementGapSmall),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.Bottom,
    ) {
        Text(
            text = title.uppercase(),
            style = MaterialTheme.typography.headlineMedium,
            color = MaterialTheme.colorScheme.onSurface,
        )
        if (trailing != null) {
            Text(
                text = trailing,
                style = DataSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

/**
 * The week strip. Days are drawn from the plan document, dated from this
 * week's Monday, with today outlined and a completed session ticked.
 */
@Composable
private fun PlanWeekStrip(
    days: List<PlanDayDto>,
    todayCompleted: Boolean,
    modifier: Modifier = Modifier,
) {
    val monday = remember { LocalDate.now().with(DayOfWeek.MONDAY) }
    val todayIndex = LocalDate.now().dayOfWeek.value - 1
    val accent = LocalAzfExtended.current.primaryFixedDim
    val todayWord = stringResource(R.string.training_day_today)
    val completedWord = stringResource(R.string.training_day_completed)
    val restWord = stringResource(R.string.training_day_rest)

    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(AzfShapes.Card)
            .background(MaterialTheme.colorScheme.surfaceContainerLow)
            .border(
                BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f)),
                AzfShapes.Card,
            )
            .padding(AzfSpacing.ElementGapMedium),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        days.take(DAYS_IN_WEEK).forEachIndexed { index, day ->
            val date = monday.plusDays(index.toLong())
            val isToday = index == todayIndex
            val done = isToday && todayCompleted
            val stateWord = when {
                done -> completedWord
                isToday -> todayWord
                day.isRest -> restWord
                else -> date.dayOfMonth.toString()
            }
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    text = date.dayOfWeek.getDisplayName(JavaTextStyle.NARROW, Locale.getDefault()),
                    style = MaterialTheme.typography.labelMedium,
                    color = if (isToday) accent else MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(modifier = Modifier.height(4.dp))
                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .clip(AzfShapes.Pill)
                        .then(
                            when {
                                done -> Modifier.background(MaterialTheme.colorScheme.secondaryContainer)
                                isToday -> Modifier.border(BorderStroke(2.dp, accent), AzfShapes.Pill)
                                else -> Modifier.background(MaterialTheme.colorScheme.surfaceContainer)
                            },
                        )
                        .semantics {
                            contentDescription = "${day.focus.ifBlank { restWord }}, $stateWord"
                        },
                    contentAlignment = Alignment.Center,
                ) {
                    when {
                        done -> Icon(
                            imageVector = Icons.Outlined.Check,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSecondaryContainer,
                            modifier = Modifier.size(20.dp),
                        )

                        day.isRest -> Icon(
                            imageVector = Icons.Outlined.SelfImprovement,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                            modifier = Modifier.size(18.dp),
                        )

                        else -> Text(
                            text = date.dayOfMonth.toString(),
                            style = DataSmall,
                            color = if (isToday) accent else MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
    }
}

/** Today's hero: focus, estimates, the resolved prescription list, and start. */
@Composable
private fun TodayHeroCard(
    state: WorkoutLibraryUiState,
    onStart: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val session = state.todaySession ?: return
    AzfCard(tier = AzfCardTier.Hero, modifier = modifier.fillMaxWidth()) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            PillLabel(
                text = stringResource(R.string.training_today),
                color = LocalAzfExtended.current.primaryFixedDim,
            )
            PillLabel(
                text = stringResource(
                    R.string.training_minutes,
                    TrainingFormat.estimateMinutes(session),
                ),
                color = LocalAzfExtended.current.secondaryFixedDim,
            )
        }
        Spacer(modifier = Modifier.height(12.dp))
        Text(
            text = session.focus.uppercase(),
            style = MaterialTheme.typography.headlineLarge,
            color = MaterialTheme.colorScheme.onSurface,
        )
        Spacer(modifier = Modifier.height(6.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = stringResource(R.string.training_exercise_count, session.exercises.size),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(modifier = Modifier.size(12.dp))
            Icon(
                imageVector = Icons.Outlined.LocalFireDepartment,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(16.dp),
            )
            Text(
                text = stringResource(
                    R.string.training_kcal_estimate,
                    TrainingFormat.estimateKcal(session),
                ),
                style = DataSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(start = 4.dp),
            )
        }

        state.todayEntries.take(HERO_PREVIEW_ROWS).forEach { entry ->
            Spacer(modifier = Modifier.height(12.dp))
            Column {
                Text(
                    text = entry.name,
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = TrainingFormat.targetLine(entry),
                    style = DataSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        Spacer(modifier = Modifier.height(AzfSpacing.ElementGapMedium))
        PrimaryButton(text = stringResource(R.string.training_start_workout), onClick = onStart)
    }
}

@Composable
private fun RestDayCard(modifier: Modifier = Modifier) {
    AzfCard(modifier = modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Icon(
                imageVector = Icons.Outlined.SelfImprovement,
                contentDescription = null,
                tint = LocalAzfExtended.current.secondaryFixedDim,
                modifier = Modifier.size(32.dp),
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = stringResource(R.string.training_rest_day_title).uppercase(),
                style = MaterialTheme.typography.headlineSmall,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Text(
                text = stringResource(R.string.training_rest_day_body),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun PillLabel(text: String, color: androidx.compose.ui.graphics.Color) {
    Text(
        text = text.uppercase(),
        style = MaterialTheme.typography.labelSmall,
        color = color,
        modifier = Modifier
            .clip(AzfShapes.Pill)
            .background(color.copy(alpha = 0.12f))
            .border(BorderStroke(1.dp, color.copy(alpha = 0.3f)), AzfShapes.Pill)
            .padding(horizontal = 10.dp, vertical = 4.dp),
    )
}

@Composable
private fun FilterChipRow(
    label: String,
    options: List<Pair<String, String>>,
    selected: String,
    onSelect: (String) -> Unit,
) {
    LazyRow(
        modifier = Modifier
            .fillMaxWidth()
            .semantics { contentDescription = label },
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        items(options, key = { it.first.ifEmpty { "all-$label" } }) { (key, text) ->
            AzfChip(text = text, selected = selected == key, onClick = { onSelect(key) })
        }
    }
}

/**
 * One library row. The attribution line is part of the card by construction —
 * there is no variant of this composable without it.
 */
@Composable
private fun ExerciseListCard(card: ExerciseCard, onClick: () -> Unit) {
    val openLabel = stringResource(R.string.training_open_exercise, card.name)
    val equipment = card.equipmentNames
        .mapNotNull { name -> Equipment.entries.firstOrNull { it.name == name } }
    AzfCard(
        tier = AzfCardTier.Compact,
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .semantics { contentDescription = openLabel },
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            ExercisePlaceholder(
                equipment = equipment.firstOrNull() ?: Equipment.NONE,
                modifier = Modifier.size(56.dp),
            )
            Column(
                modifier = Modifier
                    .weight(1f)
                    .padding(start = 12.dp),
            ) {
                Text(
                    text = card.name,
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = listOfNotNull(
                        card.primaryMuscle?.replaceFirstChar { it.uppercase() },
                        card.difficulty.replaceFirstChar { it.uppercase() },
                    ).joinToString(" • "),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                // CC-BY-SA: required on every exercise card (plan §5.6).
                ExerciseAttribution
                    .exerciseCredit(card.licenceAuthor, card.licence)
                    ?.let { credit ->
                        Text(
                            text = credit,
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.75f),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
            }
            equipment.take(2).forEach { eq ->
                Icon(
                    imageVector = equipmentIcon(eq),
                    contentDescription = stringResource(equipmentLabelRes(eq)),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier
                        .padding(start = 6.dp)
                        .size(18.dp),
                )
            }
        }
    }
}

@Composable
private fun GeneratePlanSheetBody(
    daysPerWeek: Int,
    focus: String,
    generating: Boolean,
    onDaysPerWeek: (Int) -> Unit,
    onFocus: (String) -> Unit,
    onGenerate: () -> Unit,
    onCancel: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = AzfSpacing.ContainerMargin)
            .padding(bottom = AzfSpacing.SectionGap),
    ) {
        Text(
            text = stringResource(R.string.training_generate_title).uppercase(),
            style = MaterialTheme.typography.headlineMedium,
            color = MaterialTheme.colorScheme.onSurface,
        )
        Spacer(modifier = Modifier.height(AzfSpacing.ElementGapMedium))
        Text(
            text = stringResource(R.string.training_generate_days).uppercase(),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(modifier = Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            DAYS_OPTIONS.forEach { option ->
                AzfChip(
                    text = option.toString(),
                    selected = daysPerWeek == option,
                    onClick = { onDaysPerWeek(option) },
                )
            }
        }
        Spacer(modifier = Modifier.height(AzfSpacing.ElementGapMedium))
        Text(
            text = stringResource(R.string.training_generate_focus).uppercase(),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(modifier = Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf(
                WorkoutLibraryUiState.FOCUS_GENERAL to R.string.training_focus_general,
                WorkoutLibraryUiState.FOCUS_WEIGHT_LOSS to R.string.training_focus_weight_loss,
                WorkoutLibraryUiState.FOCUS_STRENGTH to R.string.training_focus_strength,
            ).forEach { (key, res) ->
                AzfChip(
                    text = stringResource(res),
                    selected = focus == key,
                    onClick = { onFocus(key) },
                )
            }
        }
        Spacer(modifier = Modifier.height(AzfSpacing.SectionGap))
        PrimaryButton(
            text = if (generating) {
                stringResource(R.string.training_generating)
            } else {
                stringResource(R.string.training_generate_plan)
            },
            onClick = onGenerate,
            loading = generating,
        )
        Spacer(modifier = Modifier.height(12.dp))
        SecondaryButton(
            text = stringResource(R.string.action_back),
            onClick = onCancel,
            enabled = !generating,
        )
    }
}

private const val DAYS_IN_WEEK = 7
private const val HERO_PREVIEW_ROWS = 3
private val DAYS_OPTIONS = listOf(2, 3, 4, 5, 6)

@Preview(showBackground = true, backgroundColor = 0xFF0E1416)
@Composable
private fun WorkoutLibraryPreview() {
    AzfTheme {
        WorkoutLibraryContent(
            state = WorkoutLibraryUiState(
                loadingPlan = false,
                loadingToday = false,
                loadingLibrary = false,
                exercises = listOf(
                    ExerciseCard(
                        id = "ex_bench",
                        name = "Barbell bench press",
                        primaryMuscle = "chest",
                        difficulty = "intermediate",
                        equipmentNames = listOf("BARBELL", "BENCH"),
                        licence = "CC-BY-SA 4.0",
                        licenceAuthor = "wger contributors",
                    ),
                ),
                totalMatches = 1,
            ),
            onStartSession = {},
            onSearchChange = {},
            onCategoryChange = {},
            onMuscleChange = {},
            onEquipmentChange = {},
            onLoadMore = {},
            onOpenDetail = {},
            onCloseDetail = {},
            onOpenGenerate = {},
            onCloseGenerate = {},
            onDaysPerWeek = {},
            onFocus = {},
            onGenerate = {},
            onRetry = {},
        )
    }
}
