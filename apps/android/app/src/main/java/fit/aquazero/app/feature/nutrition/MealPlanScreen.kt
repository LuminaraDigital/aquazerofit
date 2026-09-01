package fit.aquazero.app.feature.nutrition

import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.ThumbDown
import androidx.compose.material.icons.outlined.ThumbUp
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
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import fit.aquazero.app.R
import fit.aquazero.app.core.data.SuggestionFeedback
import fit.aquazero.app.core.designsystem.AzfAppHeader
import fit.aquazero.app.core.designsystem.AzfCard
import fit.aquazero.app.core.designsystem.AzfColors
import fit.aquazero.app.core.designsystem.AzfNavigationRow
import fit.aquazero.app.core.designsystem.AzfSectionHeading
import fit.aquazero.app.core.designsystem.AzfSpacing
import fit.aquazero.app.core.designsystem.AzfTheme
import fit.aquazero.app.core.designsystem.PrimaryButton
import fit.aquazero.app.core.designsystem.SecondaryButton
import fit.aquazero.app.core.designsystem.Skeleton
import fit.aquazero.app.core.designsystem.ToastKind
import fit.aquazero.app.core.model.MealRecommendationDto
import fit.aquazero.app.core.model.MealType
import fit.aquazero.app.core.ui.NutritionFormat
import fit.aquazero.app.core.ui.rememberToastSink
import kotlin.math.roundToInt

/**
 * The AI meal plan: four suggestions built around what is left of today.
 *
 * Online-only, and honest about it — when nothing can be fetched the screen
 * says the suggestions come from the server rather than showing four identical
 * failures. Below the plan sits the cached recipe library, which does work
 * offline, so the screen still has something to offer with no connection.
 */
@Composable
fun MealPlanScreen(
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    onOpenRecipe: (String) -> Unit = {},
    viewModel: MealPlanViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val resources = LocalResources.current
    val toasts = rememberToastSink()

    LaunchedEffect(viewModel) {
        viewModel.events.collect { event ->
            when (event) {
                is MealPlanEvent.Message -> toasts.show(
                    resources.getString(event.messageRes),
                    if (event.isError) ToastKind.Error else ToastKind.Success,
                )
            }
        }
    }

    Scaffold(
        modifier = modifier.fillMaxSize(),
        topBar = {
            AzfAppHeader(
                title = stringResource(R.string.screen_meal_plan),
                onBack = onBack,
                trailing = {
                    IconButton(onClick = viewModel::regenerateAll) {
                        Icon(
                            imageVector = Icons.Outlined.Refresh,
                            contentDescription = stringResource(
                                R.string.meal_plan_regenerate_all,
                            ),
                            tint = AzfColors.SecondaryFixedDim,
                        )
                    }
                },
            )
        },
    ) { innerPadding ->
        LazyColumn(
            modifier = Modifier
                .padding(innerPadding)
                .fillMaxSize(),
            contentPadding = PaddingValues(
                start = AzfSpacing.ContainerMargin,
                end = AzfSpacing.ContainerMargin,
                top = AzfSpacing.ContainerMargin,
                bottom = 40.dp,
            ),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Column {
                    Text(
                        text = stringResource(R.string.meal_plan_heading),
                        style = MaterialTheme.typography.headlineMedium,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        text = stringResource(R.string.meal_plan_intro),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            item { PlannedTotals(state) }

            if (state.offline && state.readyCount == 0) {
                item {
                    AzfCard(modifier = Modifier.fillMaxWidth()) {
                        Text(
                            text = stringResource(R.string.meal_plan_offline_title).uppercase(),
                            style = MaterialTheme.typography.labelMedium,
                            color = AzfColors.SecondaryFixedDim,
                        )
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(
                            text = stringResource(R.string.meal_plan_offline_body),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        SecondaryButton(
                            text = stringResource(R.string.meal_plan_slot_retry),
                            onClick = viewModel::regenerateAll,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                }
            } else {
                items(state.slots, key = { it.mealType.name }) { slot ->
                    SlotCard(
                        slot = slot,
                        onRegenerate = { viewModel.generate(slot.mealType) },
                        onLog = { viewModel.logSuggestion(slot.mealType) },
                        onFeedback = { viewModel.sendFeedback(slot.mealType, it) },
                    )
                }
            }

            item { AzfSectionHeading(stringResource(R.string.meal_plan_recipes_heading)) }
            item {
                Text(
                    text = stringResource(R.string.meal_plan_recipes_body),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = 4.dp),
                )
            }
            if (state.recipes.isEmpty()) {
                item {
                    Text(
                        text = stringResource(R.string.meal_plan_recipes_empty),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(horizontal = 4.dp, vertical = 8.dp),
                    )
                }
            } else {
                items(state.recipes, key = { it.id }) { recipe ->
                    AzfNavigationRow(
                        title = recipe.name,
                        body = recipe.tagsCsv.replace(",", " · ").ifBlank {
                            stringResource(R.string.meal_plan_recipes_body)
                        },
                        onClick = { onOpenRecipe(recipe.id) },
                        trailing = Icons.AutoMirrored.Outlined.KeyboardArrowRight,
                    )
                }
            }
        }
    }
}

@Composable
private fun PlannedTotals(state: MealPlanUiState) {
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        TotalCard(
            label = stringResource(R.string.meal_plan_planned_kcal),
            value = NutritionFormat.fmtInt(state.plannedKcal),
            secondary = state.kcalTarget?.let {
                stringResource(R.string.meal_plan_of_target, NutritionFormat.fmtInt(it))
            },
            color = AzfColors.PrimaryFixedDim,
            modifier = Modifier.weight(1f),
        )
        TotalCard(
            label = stringResource(R.string.meal_plan_planned_protein),
            value = stringResource(
                R.string.recipe_grams,
                state.plannedProteinG.roundToInt(),
            ),
            secondary = state.proteinTarget?.let {
                stringResource(
                    R.string.meal_plan_of_target,
                    stringResource(R.string.recipe_grams, it.roundToInt()),
                )
            },
            color = AzfColors.SecondaryFixedDim,
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun TotalCard(
    label: String,
    value: String,
    secondary: String?,
    color: androidx.compose.ui.graphics.Color,
    modifier: Modifier = Modifier,
) {
    AzfCard(modifier = modifier) {
        Text(
            text = label.uppercase(),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(modifier = Modifier.height(4.dp))
        Text(
            text = value,
            style = MaterialTheme.typography.headlineMedium,
            color = color,
        )
        if (secondary != null) {
            Text(
                text = secondary,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun SlotCard(
    slot: MealPlanSlot,
    onRegenerate: () -> Unit,
    onLog: () -> Unit,
    onFeedback: (SuggestionFeedback) -> Unit,
) {
    val mealLabel = stringResource(NutritionFormat.mealLabelRes(slot.mealType))
    AzfCard(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = NutritionFormat.mealIcon(slot.mealType),
                    contentDescription = null,
                    tint = AzfColors.PrimaryFixedDim,
                    modifier = Modifier.size(20.dp),
                )
                Spacer(modifier = Modifier.size(8.dp))
                Text(
                    text = mealLabel.uppercase(),
                    style = MaterialTheme.typography.labelMedium,
                    color = AzfColors.PrimaryFixedDim,
                )
            }
            IconButton(onClick = onRegenerate) {
                Icon(
                    imageVector = Icons.Outlined.Refresh,
                    contentDescription = stringResource(
                        R.string.meal_plan_regenerate_one,
                        mealLabel,
                    ),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        Spacer(modifier = Modifier.height(8.dp))

        when {
            slot.loading -> {
                Skeleton(modifier = Modifier.fillMaxWidth().height(24.dp))
                Spacer(modifier = Modifier.height(8.dp))
                Skeleton(modifier = Modifier.fillMaxWidth().height(48.dp))
            }
            slot.failed || slot.recommendation == null -> {
                Text(
                    text = stringResource(R.string.meal_plan_slot_failed),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(modifier = Modifier.height(12.dp))
                SecondaryButton(
                    text = stringResource(R.string.meal_plan_slot_retry),
                    onClick = onRegenerate,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            else -> SuggestionBody(
                slot = slot,
                recommendation = slot.recommendation,
                onLog = onLog,
                onFeedback = onFeedback,
            )
        }
    }
}

@Composable
private fun SuggestionBody(
    slot: MealPlanSlot,
    recommendation: MealRecommendationDto,
    onLog: () -> Unit,
    onFeedback: (SuggestionFeedback) -> Unit,
) {
    Text(
        text = recommendation.name,
        style = MaterialTheme.typography.titleMedium,
        color = MaterialTheme.colorScheme.onSurface,
    )
    Spacer(modifier = Modifier.height(4.dp))
    Text(
        text = stringResource(
            R.string.meal_plan_kcal,
            NutritionFormat.fmtInt(recommendation.kcal),
        ),
        style = MaterialTheme.typography.titleSmall,
        color = AzfColors.SecondaryFixedDim,
    )
    Text(
        text = stringResource(
            R.string.meal_plan_macros,
            recommendation.proteinG.roundToInt(),
            recommendation.carbsG.roundToInt(),
            recommendation.fatG.roundToInt(),
        ),
        style = MaterialTheme.typography.labelSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    if (recommendation.rationale.isNotBlank()) {
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = recommendation.rationale,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
    if (slot.deterministic) {
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = stringResource(R.string.meal_plan_deterministic_note),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
    Spacer(modifier = Modifier.height(16.dp))
    Row(verticalAlignment = Alignment.CenterVertically) {
        PrimaryButton(
            text = stringResource(
                if (slot.logged) R.string.meal_plan_logged else R.string.meal_plan_log_cta,
            ),
            onClick = onLog,
            enabled = !slot.logged && !slot.logging,
            loading = slot.logging,
            modifier = Modifier.weight(1f),
        )
        Spacer(modifier = Modifier.size(8.dp))
        IconButton(onClick = { onFeedback(SuggestionFeedback.UP) }) {
            Icon(
                imageVector = Icons.Outlined.ThumbUp,
                contentDescription = stringResource(R.string.meal_plan_feedback_up),
                tint = if (slot.feedback == SuggestionFeedback.UP) {
                    AzfColors.SecondaryFixedDim
                } else {
                    MaterialTheme.colorScheme.onSurfaceVariant
                },
            )
        }
        IconButton(onClick = { onFeedback(SuggestionFeedback.DOWN) }) {
            Icon(
                imageVector = Icons.Outlined.ThumbDown,
                contentDescription = stringResource(R.string.meal_plan_feedback_down),
                // Coral, never red: a "not for me" is a preference, not a fault.
                tint = if (slot.feedback == SuggestionFeedback.DOWN) {
                    AzfColors.Coral
                } else {
                    MaterialTheme.colorScheme.onSurfaceVariant
                },
            )
        }
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416, heightDp = 700)
@Composable
private fun MealPlanPreview() {
    AzfTheme {
        Column(
            modifier = Modifier.padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            SlotCard(
                slot = MealPlanSlot(
                    mealType = MealType.LUNCH,
                    loading = false,
                    recommendation = MealRecommendationDto(
                        id = "r1",
                        name = "Mediterranean chicken bowl",
                        mealType = MealType.LUNCH,
                        kcal = 520.0,
                        proteinG = 42.0,
                        carbsG = 50.0,
                        fatG = 14.0,
                        rationale = "Fits the protein you have left today.",
                    ),
                ),
                onRegenerate = {},
                onLog = {},
                onFeedback = {},
            )
        }
    }
}
