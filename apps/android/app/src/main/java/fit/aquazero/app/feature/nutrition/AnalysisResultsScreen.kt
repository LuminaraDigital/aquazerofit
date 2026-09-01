package fit.aquazero.app.feature.nutrition

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AddCircleOutline
import androidx.compose.material.icons.outlined.CenterFocusWeak
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import fit.aquazero.app.R
import fit.aquazero.app.core.common.MealTrust
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
import fit.aquazero.app.core.designsystem.ErrorState
import fit.aquazero.app.core.designsystem.FatCautionBanner
import fit.aquazero.app.core.designsystem.GramsStepper
import fit.aquazero.app.core.designsystem.LocalAzfExtended
import fit.aquazero.app.core.designsystem.PrimaryButton
import fit.aquazero.app.core.designsystem.SecondaryButton
import fit.aquazero.app.core.designsystem.Skeleton
import fit.aquazero.app.core.designsystem.rememberReducedMotion
import fit.aquazero.app.core.model.FoodDto
import fit.aquazero.app.core.model.MealType
import fit.aquazero.app.core.ui.NutritionFormat

/**
 * The confirmation gate.
 *
 * Predictions arrive, the user edits them, and **nothing reaches the log until
 * they tap "Looks right, log it"** (product invariant 1). Gram edits recompute
 * from the per-gram ratios captured at seed time — the model is never asked a
 * second time — and the list is seeded exactly once so a late poll can never
 * discard an edit.
 */
@Composable
fun AnalysisResultsScreen(
    jobId: String,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    onLogged: (String?) -> Unit = { onBack() },
    onLogManually: () -> Unit = onBack,
    onRetakePhoto: () -> Unit = onBack,
    viewModel: AnalysisResultsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    LaunchedEffect(jobId) { viewModel.start(jobId) }

    LaunchedEffect(viewModel) {
        viewModel.eventFlow.collect { event ->
            when (event) {
                is AnalysisEvent.Logged -> onLogged(event.mealLogId)
            }
        }
    }

    Scaffold(
        modifier = modifier.fillMaxSize(),
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            AzfAppHeader(
                title = stringResource(R.string.analysis_title),
                onBack = onBack,
            )
        },
    ) { innerPadding ->
        AnalysisContent(
            state = state,
            modifier = Modifier.padding(innerPadding),
            onRename = viewModel::renameItem,
            onGramsChange = viewModel::setGrams,
            onRemove = viewModel::removeItem,
            onAddItem = viewModel::openAddSheet,
            onAddCookingFat = viewModel::addCookingFatPreset,
            onConfirm = viewModel::confirm,
            onRetry = viewModel::retry,
            onRetakePhoto = onRetakePhoto,
            onLogManually = onLogManually,
        )
    }

    state.addSheet?.let { sheet ->
        AddItemSheet(
            sheet = sheet,
            onDismiss = viewModel::closeAddSheet,
            onTermChange = viewModel::setSearchTerm,
            onSelectFood = viewModel::selectFood,
            onClearSelection = viewModel::clearSelectedFood,
            onGramsChange = viewModel::setAddGrams,
            onConfirm = viewModel::confirmAddItem,
        )
    }
}

/** Phase switch. Camera-free and state-driven, so every branch previews. */
@Composable
internal fun AnalysisContent(
    state: AnalysisUiState,
    modifier: Modifier = Modifier,
    onRename: (String, String) -> Unit = { _, _ -> },
    onGramsChange: (String, Int) -> Unit = { _, _ -> },
    onRemove: (String) -> Unit = {},
    onAddItem: () -> Unit = {},
    onAddCookingFat: (MealTrust.CookingFatPreset) -> Unit = {},
    onConfirm: () -> Unit = {},
    onRetry: () -> Unit = {},
    onRetakePhoto: () -> Unit = {},
    onLogManually: () -> Unit = {},
) {
    when (state.phase) {
        AnalysisPhase.Scanning -> ScanningState(modifier = modifier)

        AnalysisPhase.LoadError -> Column(
            modifier = modifier
                .fillMaxSize()
                .padding(horizontal = AzfSpacing.ContainerMargin),
            verticalArrangement = Arrangement.Center,
        ) {
            ErrorState(
                title = stringResource(R.string.analysis_load_error_title),
                message = state.banner?.message
                    ?: stringResource(R.string.analysis_load_error_body),
                retryLabel = stringResource(R.string.action_retry),
                onRetry = onRetry,
            )
        }

        AnalysisPhase.Failed -> Column(
            modifier = modifier
                .fillMaxSize()
                .padding(horizontal = AzfSpacing.ContainerMargin),
            verticalArrangement = Arrangement.Center,
        ) {
            ErrorState(
                title = stringResource(R.string.analysis_failed_title),
                message = state.jobErrorMessage
                    ?: stringResource(R.string.analysis_failed_body),
                retryLabel = stringResource(R.string.analysis_failed_retake),
                onRetry = onRetakePhoto,
            )
            SecondaryButton(
                text = stringResource(R.string.analysis_failed_manual),
                onClick = onLogManually,
                modifier = Modifier.padding(top = AzfSpacing.ElementGapMedium),
            )
        }

        AnalysisPhase.Review -> ReviewList(
            state = state,
            modifier = modifier,
            onRename = onRename,
            onGramsChange = onGramsChange,
            onRemove = onRemove,
            onAddItem = onAddItem,
            onAddCookingFat = onAddCookingFat,
            onConfirm = onConfirm,
        )
    }
}

@Composable
private fun ScanningState(modifier: Modifier = Modifier) {
    val reducedMotion = rememberReducedMotion()
    val accent = LocalAzfExtended.current.primaryFixedDim
    val transition = rememberInfiniteTransition(label = "scanning")
    // Deliberately NOT `by`: reading the animated value into a composition
    // scope would invalidate this whole Column — the icon, both Text nodes and
    // their `stringResource` lookups — at the animation's frame rate, for the
    // entire analysis wait. Held as a State and read inside the
    // `graphicsLayer` lambda below, the pulse only re-runs the draw phase.
    val pulse = transition.animateFloat(
        initialValue = 0.35f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = PULSE_MILLIS, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "pulse",
    )

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = AzfSpacing.ContainerMargin)
            .semantics { liveRegion = LiveRegionMode.Polite },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Box(
            modifier = Modifier
                .size(128.dp)
                .graphicsLayer { alpha = if (reducedMotion) REDUCED_MOTION_ALPHA else pulse.value }
                .clip(CircleShape)
                .border(2.dp, accent.copy(alpha = 0.5f), CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Outlined.CenterFocusWeak,
                contentDescription = null,
                tint = accent,
                modifier = Modifier.size(48.dp),
            )
        }
        Text(
            text = stringResource(R.string.analysis_scanning_title),
            style = MaterialTheme.typography.titleLarge,
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.padding(top = 24.dp),
        )
        Text(
            text = stringResource(R.string.analysis_scanning_body),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 4.dp, bottom = 24.dp),
        )
        repeat(3) {
            Skeleton(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp)
                    .padding(bottom = 12.dp),
            )
        }
    }
}

@Composable
private fun ReviewList(
    state: AnalysisUiState,
    modifier: Modifier = Modifier,
    onRename: (String, String) -> Unit,
    onGramsChange: (String, Int) -> Unit,
    onRemove: (String) -> Unit,
    onAddItem: () -> Unit,
    onAddCookingFat: (MealTrust.CookingFatPreset) -> Unit,
    onConfirm: () -> Unit,
) {
    val showFatCaution = AnalysisReview.shouldShowFatCaution(state.items)
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(
            start = AzfSpacing.ContainerMargin,
            end = AzfSpacing.ContainerMargin,
            top = AzfSpacing.ElementGapMedium,
            bottom = AzfSpacing.SectionGap,
        ),
        verticalArrangement = Arrangement.spacedBy(AzfSpacing.ElementGapSmall),
    ) {
        // A contentType per slot: the summary card, the section header, the
        // item cards and the gate are structurally unrelated, and the notice
        // slots come and go. Without one Compose reuses a slot's
        // subcomposition for the next kind that lands there and rebuilds it.
        item(key = "summary", contentType = "summary") {
            AnalysisSummaryCard(totals = state.totals, mealType = state.mealType)
        }

        if (showFatCaution) {
            item(key = "fat-caution", contentType = "notice") {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    FatCautionBanner()
                    Text(
                        text = stringResource(R.string.trust_add_cooking_fat),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        MealTrust.cookingFatPresets.forEach { preset ->
                            AzfChip(
                                text = preset.label,
                                selected = false,
                                onClick = { onAddCookingFat(preset) },
                            )
                        }
                    }
                }
            }
        }

        item(key = "header", contentType = "header") {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = AzfSpacing.ElementGapMedium),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = stringResource(R.string.analysis_breakdown),
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.weight(1f),
                )
                TextButton(onClick = onAddItem, enabled = !state.confirmed) {
                    Icon(
                        imageVector = Icons.Outlined.AddCircleOutline,
                        contentDescription = null,
                        tint = LocalAzfExtended.current.primaryFixedDim,
                        modifier = Modifier.size(18.dp),
                    )
                    Spacer(modifier = Modifier.size(6.dp))
                    Text(
                        text = stringResource(R.string.analysis_add_item),
                        color = LocalAzfExtended.current.primaryFixedDim,
                        style = MaterialTheme.typography.labelLarge,
                    )
                }
            }
        }

        if (state.items.isEmpty()) {
            item(key = "empty", contentType = "empty") {
                AzfCard(tier = AzfCardTier.Compact) {
                    Text(
                        text = stringResource(R.string.analysis_no_items),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
        }

        items(state.items, key = { it.key }, contentType = { "review-item" }) { item ->
            ReviewItemCard(
                item = item,
                editable = !state.confirmed,
                onRename = { onRename(item.key, it) },
                onGramsChange = { onGramsChange(item.key, it) },
                onRemove = { onRemove(item.key) },
            )
        }

        if (state.unlinkedItemCount > 0) {
            item(key = "unlinked", contentType = "notice") {
                InlineNotice(
                    text = stringResource(R.string.analysis_unlinked_items),
                    tone = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        state.banner?.let { banner ->
            item(key = "banner", contentType = "notice") {
                InlineNotice(
                    text = banner.message ?: banner.messageRes?.let { stringResource(it) }.orEmpty(),
                    tone = MaterialTheme.colorScheme.error,
                    assertive = true,
                )
            }
        }

        item(key = "gate", contentType = "gate") {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .navigationBarsPadding()
                    .padding(top = AzfSpacing.ElementGapMedium),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                // The gate copy, verbatim. This sentence is the product promise.
                Text(
                    text = stringResource(R.string.analysis_gate_copy),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                )
                Text(
                    text = stringResource(R.string.analysis_ai_disclaimer),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(top = 6.dp, bottom = 16.dp),
                )
                PrimaryButton(
                    text = stringResource(
                        when {
                            state.confirmed -> R.string.analysis_already_logged
                            state.confirming -> R.string.analysis_saving
                            else -> R.string.analysis_confirm_cta
                        },
                    ),
                    onClick = onConfirm,
                    enabled = state.canConfirm,
                    loading = state.confirming,
                )
            }
        }
    }
}

@Composable
private fun AnalysisSummaryCard(totals: ReviewTotals, mealType: MealType) {
    AzfCard(tier = AzfCardTier.Hero) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = stringResource(R.string.analysis_estimated_calories),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    text = stringResource(
                        R.string.analysis_kcal_value,
                        NutritionFormat.fmtInt(totals.kcal),
                    ),
                    style = DataLarge,
                    color = LocalAzfExtended.current.primaryFixedDim,
                )
                Text(
                    text = stringResource(NutritionFormat.mealLabelRes(mealType)),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Column(horizontalAlignment = Alignment.End) {
                MacroLine(R.string.macro_protein, totals.proteinG)
                MacroLine(R.string.macro_carbs, totals.carbsG)
                MacroLine(R.string.macro_fat, totals.fatG)
            }
        }
    }
}

@Composable
private fun MacroLine(labelRes: Int, grams: Double) {
    Text(
        text = stringResource(
            R.string.analysis_macro_line,
            stringResource(labelRes),
            NutritionFormat.fmt1(grams),
        ),
        style = DataSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

@Composable
private fun ReviewItemCard(
    item: ReviewItem,
    editable: Boolean,
    onRename: (String) -> Unit,
    onGramsChange: (Int) -> Unit,
    onRemove: () -> Unit,
) {
    val computed = AnalysisReview.toMealLogItem(item)
    AzfCard(tier = AzfCardTier.Standard) {
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
            AzfTextField(
                value = item.name,
                onValueChange = onRename,
                label = stringResource(R.string.analysis_item_name),
                enabled = editable,
                modifier = Modifier.weight(1f),
            )
            IconButton(onClick = onRemove, enabled = editable) {
                Icon(
                    imageVector = Icons.Outlined.DeleteOutline,
                    contentDescription = stringResource(R.string.analysis_remove_item, item.name),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = AzfSpacing.ElementGapSmall),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            GramsStepper(grams = item.grams, onGramsChange = onGramsChange)
            Text(
                text = stringResource(
                    R.string.analysis_kcal_value,
                    NutritionFormat.fmtInt(computed.kcal),
                ),
                style = DataSmall,
                color = LocalAzfExtended.current.primaryFixedDim,
            )
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = AzfSpacing.ElementGapSmall),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                text = stringResource(
                    R.string.analysis_macro_row,
                    NutritionFormat.fmt1(computed.proteinG),
                    NutritionFormat.fmt1(computed.carbsG),
                    NutritionFormat.fmt1(computed.fatG),
                ),
                style = DataSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            item.confidence?.let { ConfidenceChip(confidence = it) }
        }
    }
}

/** Per-item confidence: ≥75% green High, ≥50% aqua Medium, else coral Low. */
@Composable
private fun ConfidenceChip(confidence: Double) {
    val extended = LocalAzfExtended.current
    val tier = AnalysisReview.tierOf(confidence)
    val accent = when (tier) {
        ConfidenceTier.High -> extended.secondaryFixedDim
        ConfidenceTier.Medium -> extended.primaryFixedDim
        ConfidenceTier.Low -> extended.coral
    }
    val tierLabel = stringResource(
        when (tier) {
            ConfidenceTier.High -> R.string.analysis_confidence_high
            ConfidenceTier.Medium -> R.string.analysis_confidence_medium
            ConfidenceTier.Low -> R.string.analysis_confidence_low
        },
    )
    val label = stringResource(
        R.string.analysis_confidence_pct,
        tierLabel,
        AnalysisReview.percent(confidence),
    )
    Text(
        text = label,
        style = MaterialTheme.typography.labelSmall,
        color = accent,
        modifier = Modifier
            .clip(AzfShapes.Pill)
            .background(accent.copy(alpha = 0.15f))
            .border(1.dp, accent.copy(alpha = 0.6f), AzfShapes.Pill)
            .padding(horizontal = 10.dp, vertical = 4.dp),
    )
}

@Composable
private fun InlineNotice(text: String, tone: Color, assertive: Boolean = false) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(AzfShapes.Inner)
            .border(1.dp, tone.copy(alpha = 0.5f), AzfShapes.Inner)
            .background(tone.copy(alpha = 0.08f))
            .padding(horizontal = 14.dp, vertical = 10.dp)
            .semantics {
                liveRegion = if (assertive) LiveRegionMode.Assertive else LiveRegionMode.Polite
            },
    ) {
        Text(text = text, style = MaterialTheme.typography.bodySmall, color = tone)
    }
}

/** Food search for an item the model missed. Adds to the list — never logs. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AddItemSheet(
    sheet: AddItemUi,
    onDismiss: () -> Unit,
    onTermChange: (String) -> Unit,
    onSelectFood: (FoodDto) -> Unit,
    onClearSelection: () -> Unit,
    onGramsChange: (Int) -> Unit,
    onConfirm: () -> Unit,
) {
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
            verticalArrangement = Arrangement.spacedBy(AzfSpacing.ElementGapSmall),
        ) {
            Text(
                text = stringResource(R.string.analysis_add_sheet_title),
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onSurface,
            )

            val selected = sheet.selected
            if (selected == null) {
                AzfTextField(
                    value = sheet.term,
                    onValueChange = onTermChange,
                    label = stringResource(R.string.analysis_add_sheet_search),
                )
                if (sheet.searching) {
                    repeat(3) {
                        Skeleton(modifier = Modifier.fillMaxWidth().height(48.dp))
                    }
                }
                sheet.results.take(MAX_RESULTS).forEach { food ->
                    AzfCard(tier = AzfCardTier.Compact) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = food.name,
                                    style = MaterialTheme.typography.bodyLarge,
                                    color = MaterialTheme.colorScheme.onSurface,
                                )
                                Text(
                                    text = stringResource(
                                        R.string.analysis_per_100g,
                                        NutritionFormat.fmtInt(food.per100g.kcal),
                                    ),
                                    style = DataSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            TextButton(onClick = { onSelectFood(food) }) {
                                Text(
                                    text = stringResource(R.string.analysis_add_sheet_pick),
                                    color = LocalAzfExtended.current.primaryFixedDim,
                                )
                            }
                        }
                    }
                }
            } else {
                Text(
                    text = selected.name,
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                GramsStepper(grams = sheet.grams, onGramsChange = onGramsChange)
                val preview = AnalysisReview.toMealLogItem(
                    AnalysisReview.fromFood(selected, sheet.grams, "preview"),
                )
                Text(
                    text = stringResource(
                        R.string.analysis_add_sheet_preview,
                        NutritionFormat.fmtInt(preview.kcal),
                        NutritionFormat.fmt1(preview.proteinG),
                        NutritionFormat.fmt1(preview.carbsG),
                        NutritionFormat.fmt1(preview.fatG),
                    ),
                    style = DataSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                PrimaryButton(
                    text = stringResource(R.string.analysis_add_sheet_add),
                    onClick = onConfirm,
                )
                SecondaryButton(
                    text = stringResource(R.string.analysis_add_sheet_back),
                    onClick = onClearSelection,
                )
            }
        }
    }
}

private const val MAX_RESULTS = 12
private const val PULSE_MILLIS = 1200
private const val REDUCED_MOTION_ALPHA = 0.7f

// ---------------------------------------------------------------------------
// Previews
// ---------------------------------------------------------------------------

private fun previewItems(): List<ReviewItem> = listOf(
    ReviewItem(
        key = "pred-0",
        foodId = "food-salmon",
        name = "Grilled salmon",
        grams = 180,
        perGram = PerGram(2.08, 0.2, 0.0, 0.13),
        confidence = 0.86,
    ),
    ReviewItem(
        key = "pred-1",
        foodId = "food-rice",
        name = "Brown rice",
        grams = 150,
        perGram = PerGram(1.11, 0.026, 0.23, 0.009),
        confidence = 0.62,
    ),
    ReviewItem(
        key = "pred-2",
        foodId = null,
        name = "Side salad",
        grams = 80,
        perGram = PerGram(0.2, 0.012, 0.03, 0.005),
        confidence = 0.41,
    ),
)

@Preview(showBackground = true, backgroundColor = 0xFF0E1416, heightDp = 900)
@Composable
private fun AnalysisReviewPreview() {
    AzfTheme {
        AnalysisContent(
            state = AnalysisUiState(
                jobId = "vj-preview",
                phase = AnalysisPhase.Review,
                mealType = MealType.DINNER,
                items = previewItems(),
                seeded = true,
            ),
        )
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416, heightDp = 640)
@Composable
private fun AnalysisScanningPreview() {
    AzfTheme {
        AnalysisContent(state = AnalysisUiState(jobId = "vj-preview"))
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416, heightDp = 640)
@Composable
private fun AnalysisFailedPreview() {
    AzfTheme {
        AnalysisContent(
            state = AnalysisUiState(
                jobId = "vj-preview",
                phase = AnalysisPhase.Failed,
                jobErrorMessage = "We could not analyse this photo. You can still log the meal manually.",
            ),
        )
    }
}
