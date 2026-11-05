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
import androidx.compose.ui.graphics.vector.ImageVector
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
import fit.aquazero.app.core.designsystem.AzfHeroSurface
import fit.aquazero.app.core.designsystem.AzfNavigationRow
import fit.aquazero.app.core.designsystem.AzfSectionHeading
import fit.aquazero.app.core.designsystem.AzfSpacing
import fit.aquazero.app.core.designsystem.AzfStatRow
import fit.aquazero.app.core.designsystem.AzfTheme
import fit.aquazero.app.core.designsystem.DataSmall
import fit.aquazero.app.core.designsystem.ErrorState
import fit.aquazero.app.core.designsystem.Scoreboard
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
 * Online-only, and honest about it. When nothing can be fetched the screen
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
                            tint = MaterialTheme.colorScheme.primary,
                        )
                    }
                },
            )
        },
    ) { innerPadding ->
        val intro = stringResource(R.string.meal_plan_intro)
        LazyColumn(
            modifier = Modifier
                .padding(innerPadding)
                .fillMaxSize(),
            contentPadding = PaddingValues(
                start = AzfSpacing.ContainerMargin,
                end = AzfSpacing.ContainerMargin,
                top = AzfSpacing.ElementGapSmall,
                bottom = AzfSpacing.SectionGap,
            ),
            verticalArrangement = Arrangement.spacedBy(AzfSpacing.Gutter),
        ) {
            // The header already says "Meal plan"; only a real explainer earns a line.
            if (intro.isNotBlank()) {
                item {
                    Text(
                        text = intro,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            item { PlannedTotals(state) }

            if (state.offline && state.readyCount == 0) {
                item {
                    ErrorState(
                        title = stringResource(R.string.meal_plan_offline_title),
                        message = stringResource(R.string.meal_plan_offline_body),
                        retryLabel = stringResource(R.string.meal_plan_slot_retry),
                        onRetry = viewModel::regenerateAll,
                    )
                }
            } else if (state.creditsExhausted) {
                // One notice, not a failed card per meal: a retry cannot succeed.
                item {
                    ErrorState(
                        title = stringResource(R.string.meal_plan_credits_title),
                        message = stringResource(R.string.meal_plan_slot_credits),
                    )
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
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (state.recipes.isEmpty()) {
                item {
                    Text(
                        text = stringResource(R.string.meal_plan_recipes_empty),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
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

/** The lead card: what the plan adds up to against today's target. */
@Composable
private fun PlannedTotals(state: MealPlanUiState) {
    AzfHeroSurface {
        AzfSectionHeading(stringResource(R.string.meal_plan_planned_kcal))
        Row(modifier = Modifier.padding(top = 8.dp), verticalAlignment = Alignment.Bottom) {
            Text(
                text = NutritionFormat.fmtInt(state.plannedKcal),
                style = Scoreboard,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Text(
                text = state.kcalTarget?.let {
                    stringResource(R.string.meal_plan_of_target, NutritionFormat.fmtInt(it))
                } ?: stringResource(R.string.nutrition_unit_kcal),
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(start = 8.dp, bottom = 8.dp),
            )
        }
        Spacer(modifier = Modifier.height(AzfSpacing.ElementGapSmall))
        AzfStatRow(
            label = stringResource(R.string.meal_plan_planned_protein),
            value = stringResource(R.string.recipe_grams, state.plannedProteinG.roundToInt()),
            unit = state.proteinTarget?.let {
                stringResource(
                    R.string.meal_plan_of_target,
                    stringResource(R.string.recipe_grams, it.roundToInt()),
                )
            },
            divider = false,
        )
    }
}

/** One meal: heading with its single regenerate control, then one card. */
@Composable
private fun SlotCard(
    slot: MealPlanSlot,
    onRegenerate: () -> Unit,
    onLog: () -> Unit,
    onFeedback: (SuggestionFeedback) -> Unit,
) {
    val mealLabel = stringResource(NutritionFormat.mealLabelRes(slot.mealType))
    Column(modifier = Modifier.fillMaxWidth()) {
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            AzfSectionHeading(text = mealLabel, modifier = Modifier.weight(1f))
            IconButton(onClick = onRegenerate) {
                Icon(
                    imageVector = Icons.Outlined.Refresh,
                    contentDescription = stringResource(R.string.meal_plan_regenerate_one, mealLabel),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        AzfCard(modifier = Modifier.fillMaxWidth()) {
            when {
                slot.loading -> {
                    Skeleton(modifier = Modifier.fillMaxWidth().height(24.dp))
                    Spacer(modifier = Modifier.height(8.dp))
                    Skeleton(modifier = Modifier.fillMaxWidth().height(48.dp))
                }

                slot.failed || slot.recommendation == null -> {
                    Text(
                        text = stringResource(slot.failureMessageRes),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    // Out of credits: a retry cannot succeed, so none is offered.
                    if (slot.failureMessageRes != R.string.meal_plan_slot_credits) {
                        SecondaryButton(
                            text = stringResource(R.string.meal_plan_slot_retry),
                            onClick = onRegenerate,
                            modifier = Modifier.padding(top = AzfSpacing.ElementGapMedium),
                        )
                    }
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
}

@Composable
private fun SuggestionBody(
    slot: MealPlanSlot,
    recommendation: MealRecommendationDto,
    onLog: () -> Unit,
    onFeedback: (SuggestionFeedback) -> Unit,
) {
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
        Text(
            text = recommendation.name,
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.weight(1f),
        )
        Text(
            text = stringResource(R.string.meal_plan_kcal, NutritionFormat.fmtInt(recommendation.kcal)),
            style = DataSmall,
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.padding(start = 12.dp, top = 4.dp),
        )
    }
    Text(
        text = stringResource(
            R.string.meal_plan_macros,
            recommendation.proteinG.roundToInt(),
            recommendation.carbsG.roundToInt(),
            recommendation.fatG.roundToInt(),
        ),
        style = DataSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(top = 4.dp),
    )
    if (recommendation.rationale.isNotBlank()) {
        Text(
            text = recommendation.rationale,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 8.dp),
        )
    }
    if (slot.deterministic) {
        Text(
            text = stringResource(R.string.meal_plan_deterministic_note),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 8.dp),
        )
    }
    Row(
        modifier = Modifier.padding(top = AzfSpacing.ElementGapMedium),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(AzfSpacing.ElementGapSmall),
    ) {
        SecondaryButton(
            text = stringResource(
                if (slot.logged) R.string.meal_plan_logged else R.string.meal_plan_log_cta,
            ),
            onClick = onLog,
            enabled = !slot.logged && !slot.logging,
            modifier = Modifier.weight(1f),
        )
        FeedbackControl(
            icon = Icons.Outlined.ThumbUp,
            contentDescription = stringResource(R.string.meal_plan_feedback_up),
            selected = slot.feedback == SuggestionFeedback.UP,
            onClick = { onFeedback(SuggestionFeedback.UP) },
        )
        FeedbackControl(
            icon = Icons.Outlined.ThumbDown,
            contentDescription = stringResource(R.string.meal_plan_feedback_down),
            selected = slot.feedback == SuggestionFeedback.DOWN,
            onClick = { onFeedback(SuggestionFeedback.DOWN) },
        )
    }
}

/** A chosen rating is a selection, so it takes the action colour. */
@Composable
private fun FeedbackControl(
    icon: ImageVector,
    contentDescription: String,
    selected: Boolean,
    onClick: () -> Unit,
) {
    CircleIconControl(
        icon = icon,
        contentDescription = contentDescription,
        onClick = onClick,
        tint = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
        ring = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant,
    )
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416, heightDp = 700)
@Composable
private fun MealPlanPreview() {
    AzfTheme {
        Column(
            modifier = Modifier.padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(AzfSpacing.Gutter),
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
