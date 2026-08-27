package fit.aquazero.app.feature.settings

import androidx.compose.foundation.background
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
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import fit.aquazero.app.R
import fit.aquazero.app.core.designsystem.AzfAppHeader
import fit.aquazero.app.core.designsystem.AzfCard
import fit.aquazero.app.core.designsystem.AzfChip
import fit.aquazero.app.core.designsystem.AzfColors
import fit.aquazero.app.core.designsystem.AzfSectionHeading
import fit.aquazero.app.core.designsystem.AzfShapes
import fit.aquazero.app.core.designsystem.AzfSpacing
import fit.aquazero.app.core.designsystem.AzfTheme
import fit.aquazero.app.core.designsystem.ErrorState
import fit.aquazero.app.core.designsystem.Skeleton
import fit.aquazero.app.core.model.EntitlementsDto
import fit.aquazero.app.core.model.UserTier

/**
 * Your plan.
 *
 * Read-only by construction — there is no purchase UI anywhere in this app.
 * The position leads: tier, and the credit balance that can actually be spent
 * today. What premium changes comes from the server's `premiumLanes` and
 * `costs` maps, so a lane the server adds and this screen has not heard of
 * still renders, described generically rather than dropped.
 */
@Composable
fun PlanEntitlementsScreen(
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: PlanEntitlementsViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()

    Scaffold(
        modifier = modifier.fillMaxSize(),
        topBar = {
            AzfAppHeader(title = stringResource(R.string.plan_title), onBack = onBack)
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
            val entitlements = state.entitlements
            when {
                state.loading && entitlements == null -> {
                    item {
                        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            Skeleton(modifier = Modifier.fillMaxWidth().height(160.dp))
                            Skeleton(modifier = Modifier.fillMaxWidth().height(120.dp))
                        }
                    }
                }
                state.failed || entitlements == null -> {
                    item {
                        ErrorState(
                            title = stringResource(R.string.plan_title),
                            message = stringResource(R.string.plan_error),
                            retryLabel = stringResource(R.string.memory_retry),
                            onRetry = viewModel::refresh,
                        )
                    }
                }
                else -> {
                    item { PositionCard(entitlements, state.creditFraction) }

                    item {
                        AzfSectionHeading(
                            stringResource(
                                if (state.premium) {
                                    R.string.plan_difference_heading_premium
                                } else {
                                    R.string.plan_difference_heading
                                },
                            ),
                        )
                    }

                    if (entitlements.premiumLanes.isEmpty()) {
                        item {
                            AzfCard(modifier = Modifier.fillMaxWidth()) {
                                Text(
                                    text = stringResource(R.string.plan_no_lanes),
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    } else {
                        items(entitlements.premiumLanes) { lane ->
                            LaneCard(lane = lane, premium = state.premium)
                        }
                        item {
                            Text(
                                text = stringResource(R.string.plan_difference_footnote),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(horizontal = 4.dp),
                            )
                        }
                    }

                    if (state.costRows.isNotEmpty()) {
                        item { AzfSectionHeading(stringResource(R.string.plan_costs_heading)) }
                        item {
                            AzfCard(modifier = Modifier.fillMaxWidth()) {
                                state.costRows.forEach { (task, cost) ->
                                    CostRow(task = task, cost = cost)
                                }
                            }
                        }
                    }

                    if (!state.premium) {
                        item { NoPurchaseCard() }
                    } else {
                        item {
                            Text(
                                text = stringResource(R.string.plan_premium_note),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(horizontal = 4.dp),
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PositionCard(entitlements: EntitlementsDto, fraction: Float) {
    val premium = entitlements.tier == UserTier.PREMIUM
    AzfCard(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = stringResource(R.string.plan_current).uppercase(),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            AzfChip(
                text = stringResource(
                    if (premium) R.string.plan_tier_premium else R.string.plan_tier_free,
                ),
                selected = premium,
                onClick = {},
            )
        }
        Spacer(modifier = Modifier.height(16.dp))
        Row(verticalAlignment = Alignment.Bottom) {
            Text(
                text = entitlements.creditsRemaining.toString(),
                style = MaterialTheme.typography.headlineLarge,
                color = AzfColors.PrimaryFixedDim,
            )
            Spacer(modifier = Modifier.size(8.dp))
            Text(
                text = stringResource(
                    if (entitlements.creditsRemaining == 1) {
                        R.string.plan_credit_available_one
                    } else {
                        R.string.plan_credits_available
                    },
                ),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(bottom = 4.dp),
            )
        }
        Spacer(modifier = Modifier.height(12.dp))
        // Decorative: the numbers above already say it, so the bar is hidden
        // from screen readers rather than announced as an unlabelled shape.
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(8.dp)
                .background(AzfColors.RingTrack, AzfShapes.Pill)
                .clearAndSetSemantics { },
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(fraction)
                    .height(8.dp)
                    .background(AzfColors.PrimaryFixedDim, AzfShapes.Pill),
            )
        }
        Spacer(modifier = Modifier.height(12.dp))
        Text(
            text = if (entitlements.dailyCredits == 1) {
                stringResource(R.string.plan_credits_explainer_one)
            } else {
                stringResource(R.string.plan_credits_explainer, entitlements.dailyCredits)
            },
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun LaneCard(lane: String, premium: Boolean) {
    AzfCard(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.Top,
        ) {
            Text(
                text = laneTitle(lane),
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.weight(1f),
            )
            Spacer(modifier = Modifier.size(8.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = if (premium) Icons.Outlined.CheckCircle else Icons.Outlined.Lock,
                    contentDescription = null,
                    tint = if (premium) {
                        AzfColors.SecondaryFixedDim
                    } else {
                        MaterialTheme.colorScheme.onSurfaceVariant
                    },
                    modifier = Modifier.size(16.dp),
                )
                Spacer(modifier = Modifier.size(4.dp))
                // The state is spelled out, never carried by the icon alone.
                Text(
                    text = stringResource(
                        if (premium) R.string.plan_lane_on else R.string.plan_lane_locked,
                    ),
                    style = MaterialTheme.typography.labelSmall,
                    color = if (premium) {
                        AzfColors.SecondaryFixedDim
                    } else {
                        MaterialTheme.colorScheme.onSurfaceVariant
                    },
                )
            }
        }
        Spacer(modifier = Modifier.height(6.dp))
        Text(
            text = laneBody(lane),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun CostRow(task: String, cost: Int) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(
            text = taskLabel(task),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.weight(1f),
        )
        Text(
            text = if (cost == 1) {
                stringResource(R.string.plan_cost_value_one)
            } else {
                stringResource(R.string.plan_cost_value, cost)
            },
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun NoPurchaseCard() {
    AzfCard(modifier = Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                imageVector = Icons.Outlined.Schedule,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(20.dp),
            )
            Spacer(modifier = Modifier.size(8.dp))
            Text(
                text = stringResource(R.string.plan_no_purchase_heading).uppercase(),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
        }
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = stringResource(R.string.plan_no_purchase_body),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = stringResource(R.string.plan_no_purchase_body_2),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

// ---------------------------------------------------------------------------
// Server-keyed labels
// ---------------------------------------------------------------------------

/** A lane the app has copy for; anything else keeps the server's own id. */
@Composable
private fun laneTitle(lane: String): String = when (lane) {
    "insightBatch" -> stringResource(R.string.plan_lane_insight_title)
    else -> lane
}

@Composable
private fun laneBody(lane: String): String = when (lane) {
    "insightBatch" -> stringResource(R.string.plan_lane_insight_body)
    else -> stringResource(R.string.plan_lane_generic_body)
}

@Composable
private fun taskLabel(task: String): String = when (task) {
    "chatTurn" -> stringResource(R.string.plan_task_chat_turn)
    "mealPhoto" -> stringResource(R.string.plan_task_meal_photo)
    "mealRecommendation" -> stringResource(R.string.plan_task_meal_recommendation)
    "planGeneration" -> stringResource(R.string.plan_task_plan_generation)
    "recipeGeneration" -> stringResource(R.string.plan_task_recipe_generation)
    "progressInsight" -> stringResource(R.string.plan_task_progress_insight)
    else -> task
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416, heightDp = 900)
@Composable
private fun PlanPreview() {
    AzfTheme {
        Column(
            modifier = Modifier.padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            PositionCard(
                entitlements = EntitlementsDto(
                    tier = UserTier.FREE,
                    dailyCredits = 50,
                    creditsRemaining = 32,
                    costs = mapOf("chatTurn" to 1, "mealPhoto" to 3),
                    premiumLanes = listOf("insightBatch"),
                ),
                fraction = 0.64f,
            )
            LaneCard(lane = "insightBatch", premium = false)
            NoPurchaseCard()
        }
    }
}
