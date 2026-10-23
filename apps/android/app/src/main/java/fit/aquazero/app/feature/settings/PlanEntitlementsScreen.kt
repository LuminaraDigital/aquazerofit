package fit.aquazero.app.feature.settings

import androidx.activity.compose.LocalActivity
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.WorkspacePremium
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import fit.aquazero.app.R
import fit.aquazero.app.core.data.PlanPeriod
import fit.aquazero.app.core.data.PremiumOffer
import fit.aquazero.app.core.data.PremiumOffers
import fit.aquazero.app.core.designsystem.AzfAppHeader
import fit.aquazero.app.core.designsystem.AzfCard
import fit.aquazero.app.core.designsystem.AzfChip
import fit.aquazero.app.core.designsystem.AzfColors
import fit.aquazero.app.core.designsystem.AzfSectionHeading
import fit.aquazero.app.core.designsystem.AzfShapes
import fit.aquazero.app.core.designsystem.AzfSpacing
import fit.aquazero.app.core.designsystem.AzfTheme
import fit.aquazero.app.core.designsystem.ErrorState
import fit.aquazero.app.core.designsystem.PrimaryButton
import fit.aquazero.app.core.designsystem.SecondaryButton
import fit.aquazero.app.core.designsystem.Skeleton
import fit.aquazero.app.core.designsystem.ToastKind
import fit.aquazero.app.core.model.EntitlementsDto
import fit.aquazero.app.core.model.UserTier
import fit.aquazero.app.core.ui.rememberToastSink

/**
 * Your plan, and the one thing this app sells.
 *
 * The premium subscription is bought through Google Play. Nothing here decides
 * a tier: a purchase produces a token, the server verifies it, and this screen
 * then re-reads `/me/entitlements` and renders whatever came back.
 */
@Composable
fun PlanEntitlementsScreen(
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: PlanEntitlementsViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val toastSink = rememberToastSink()
    val resources = LocalResources.current
    val context = LocalContext.current
    val activity = LocalActivity.current

    LaunchedEffect(Unit) {
        viewModel.events.collect { event ->
            when (event) {
                is PlanEvent.Message -> toastSink.show(
                    message = resources.getString(event.messageRes),
                    kind = if (event.isError) ToastKind.Error else ToastKind.Info,
                )
            }
        }
    }

    Scaffold(
        topBar = {
            AzfAppHeader(
                title = stringResource(R.string.plan_title),
                onBack = onBack,
            )
        },
        containerColor = MaterialTheme.colorScheme.background,
        modifier = modifier.fillMaxSize(),
    ) { padding ->
        when {
            state.loading -> {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(padding),
                    contentPadding = PaddingValues(
                        start = AzfSpacing.ContainerMargin,
                        end = AzfSpacing.ContainerMargin,
                        top = AzfSpacing.ContainerMargin,
                        bottom = 40.dp,
                    ),
                    verticalArrangement = Arrangement.spacedBy(AzfSpacing.ElementGapMedium),
                ) {
                    item { Skeleton(modifier = Modifier.fillMaxWidth().height(160.dp)) }
                    item { Skeleton(modifier = Modifier.fillMaxWidth().height(80.dp)) }
                    item { Skeleton(modifier = Modifier.fillMaxWidth().height(120.dp)) }
                }
            }

            state.failed -> {
                ErrorState(
                    title = stringResource(R.string.plan_title),
                    message = stringResource(R.string.plan_error),
                    retryLabel = stringResource(R.string.memory_retry),
                    onRetry = viewModel::refresh,
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(padding),
                )
            }

            state.entitlements != null -> {
                val entitlements = state.entitlements!!
                LazyColumn(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(padding),
                    contentPadding = PaddingValues(
                        start = AzfSpacing.ContainerMargin,
                        end = AzfSpacing.ContainerMargin,
                        top = AzfSpacing.ContainerMargin,
                        bottom = 40.dp,
                    ),
                    verticalArrangement = Arrangement.spacedBy(AzfSpacing.ElementGapMedium),
                ) {
                    item {
                        PositionCard(
                            entitlements = entitlements,
                            fraction = state.creditFraction,
                        )
                    }

                    item {
                        AzfSectionHeading(
                            text = stringResource(
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
                        items(
                            items = entitlements.premiumLanes,
                            key = { it },
                            contentType = { "lane" },
                        ) { lane ->
                            LaneCard(lane = lane, premium = state.premium)
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
                        item {
                            UpgradeCard(
                                offers = state.offers,
                                selectedPeriod = state.selectedPeriod,
                                onSelectPeriod = viewModel::selectPeriod,
                                offerLoading = state.offerLoading,
                                purchasing = state.purchasing,
                                onUpgrade = { activity?.let(viewModel::upgrade) },
                            )
                        }
                    } else {
                        item {
                            Column(modifier = Modifier.padding(horizontal = 4.dp)) {
                                Text(
                                    text = stringResource(R.string.plan_premium_note),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                                Spacer(modifier = Modifier.height(AzfSpacing.ElementGapMedium))
                                SecondaryButton(
                                    text = stringResource(R.string.plan_manage_subscription),
                                    onClick = { context.openPlaySubscriptions() },
                                )
                            }
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
            text = creditsExplainer(entitlements),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun creditsExplainer(entitlements: EntitlementsDto): String = when {
    entitlements.maxBankedCredits <= 0 -> if (entitlements.dailyCredits == 1) {
        stringResource(R.string.plan_credits_explainer_uncapped_one)
    } else {
        stringResource(R.string.plan_credits_explainer_uncapped, entitlements.dailyCredits)
    }
    entitlements.dailyCredits == 1 -> stringResource(
        R.string.plan_credits_explainer_one,
        entitlements.maxBankedCredits,
    )
    else -> stringResource(
        R.string.plan_credits_explainer,
        entitlements.dailyCredits,
        entitlements.maxBankedCredits,
    )
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
                    modifier = Modifier.size(18.dp),
                )
                Spacer(modifier = Modifier.size(4.dp))
                Text(
                    text = stringResource(
                        if (premium) {
                            R.string.plan_lane_on
                        } else {
                            R.string.plan_lane_locked
                        },
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
        Spacer(modifier = Modifier.height(8.dp))
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

/**
 * The upgrade offer card with interactive Annual vs Monthly selection and 7-day free trial.
 */
@Composable
private fun UpgradeCard(
    offers: PremiumOffers?,
    selectedPeriod: PlanPeriod,
    onSelectPeriod: (PlanPeriod) -> Unit,
    offerLoading: Boolean,
    purchasing: Boolean,
    onUpgrade: () -> Unit,
) {
    AzfCard(modifier = Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                imageVector = Icons.Outlined.WorkspacePremium,
                contentDescription = null,
                tint = AzfColors.SecondaryFixedDim,
                modifier = Modifier.size(20.dp),
            )
            Spacer(modifier = Modifier.size(8.dp))
            Text(
                text = stringResource(R.string.plan_upgrade_heading).uppercase(),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
        }
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = stringResource(R.string.plan_upgrade_body),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = stringResource(R.string.plan_upgrade_coaches),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(modifier = Modifier.height(16.dp))

        when {
            offerLoading -> Skeleton(modifier = Modifier.fillMaxWidth().height(140.dp))
            offers == null || (offers.annual == null && offers.monthly == null) -> Text(
                text = stringResource(R.string.plan_upgrade_unavailable),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            else -> {
                val annualOffer = offers.annual
                val monthlyOffer = offers.monthly
                val savings = offers.annualSavingsPercent ?: 50

                if (annualOffer != null) {
                    PlanOptionCard(
                        title = stringResource(R.string.plan_period_annual),
                        priceText = stringResource(
                            R.string.plan_period_annual_price_sub,
                            annualOffer.formattedPrice,
                        ),
                        badgeText = stringResource(R.string.plan_period_annual_discount, savings),
                        subBadgeText = if (annualOffer.hasFreeTrial) {
                            stringResource(R.string.plan_period_trial_badge)
                        } else {
                            null
                        },
                        selected = selectedPeriod == PlanPeriod.ANNUAL,
                        onClick = { onSelectPeriod(PlanPeriod.ANNUAL) },
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                }

                if (monthlyOffer != null) {
                    PlanOptionCard(
                        title = stringResource(R.string.plan_period_monthly),
                        priceText = stringResource(
                            R.string.plan_period_monthly_price_sub,
                            monthlyOffer.formattedPrice,
                        ),
                        badgeText = null,
                        subBadgeText = null,
                        selected = selectedPeriod == PlanPeriod.MONTHLY,
                        onClick = { onSelectPeriod(PlanPeriod.MONTHLY) },
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                }

                val activeOffer = offers.offerFor(selectedPeriod)
                val ctaText = when {
                    selectedPeriod == PlanPeriod.ANNUAL &&
                        (activeOffer?.hasFreeTrial == true || annualOffer?.hasFreeTrial == true) ->
                        stringResource(R.string.plan_upgrade_cta_trial)
                    selectedPeriod == PlanPeriod.ANNUAL && activeOffer != null ->
                        stringResource(R.string.plan_upgrade_cta_annual, activeOffer.formattedPrice)
                    selectedPeriod == PlanPeriod.MONTHLY && activeOffer != null ->
                        stringResource(R.string.plan_upgrade_cta_monthly, activeOffer.formattedPrice)
                    else ->
                        stringResource(
                            R.string.plan_upgrade_cta,
                            activeOffer?.formattedPrice.orEmpty(),
                        )
                }

                PrimaryButton(
                    text = ctaText,
                    onClick = onUpgrade,
                    loading = purchasing,
                )
                Spacer(modifier = Modifier.height(8.dp))

                val termsText = if (selectedPeriod == PlanPeriod.ANNUAL && annualOffer != null) {
                    stringResource(R.string.plan_upgrade_terms_annual, annualOffer.formattedPrice)
                } else if (monthlyOffer != null) {
                    stringResource(R.string.plan_upgrade_terms_monthly, monthlyOffer.formattedPrice)
                } else {
                    stringResource(R.string.plan_upgrade_terms)
                }

                Text(
                    text = termsText,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun PlanOptionCard(
    title: String,
    priceText: String,
    badgeText: String?,
    subBadgeText: String?,
    selected: Boolean,
    onClick: () -> Unit,
) {
    val borderColor = if (selected) {
        AzfColors.PrimaryFixedDim
    } else {
        MaterialTheme.colorScheme.outlineVariant
    }
    val containerColor = if (selected) {
        AzfColors.PrimaryContainer.copy(alpha = 0.25f)
    } else {
        MaterialTheme.colorScheme.surfaceContainerLow
    }

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(AzfShapes.Card)
            .border(
                width = if (selected) 2.dp else 1.dp,
                color = borderColor,
                shape = AzfShapes.Card,
            )
            .background(containerColor, AzfShapes.Card)
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 12.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = title,
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    if (badgeText != null) {
                        Spacer(modifier = Modifier.size(8.dp))
                        Box(
                            modifier = Modifier
                                .background(AzfColors.SecondaryContainer, AzfShapes.Pill)
                                .padding(horizontal = 8.dp, vertical = 2.dp),
                        ) {
                            Text(
                                text = badgeText,
                                style = MaterialTheme.typography.labelSmall,
                                color = AzfColors.SecondaryFixedDim,
                            )
                        }
                    }
                }
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = priceText,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (subBadgeText != null) {
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        text = "• $subBadgeText",
                        style = MaterialTheme.typography.labelSmall,
                        color = AzfColors.PrimaryFixedDim,
                    )
                }
            }
            if (selected) {
                Icon(
                    imageVector = Icons.Outlined.CheckCircle,
                    contentDescription = null,
                    tint = AzfColors.PrimaryFixedDim,
                    modifier = Modifier.size(22.dp),
                )
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Server-keyed labels
// ---------------------------------------------------------------------------

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
    "exerciseSwap" -> stringResource(R.string.plan_task_exercise_swap)
    "memoryExtraction" -> stringResource(R.string.plan_task_memory_extraction)
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
                    maxBankedCredits = 100,
                    costs = mapOf("chatTurn" to 1, "mealPhoto" to 3, "exerciseSwap" to 1),
                    premiumLanes = listOf("insightBatch"),
                ),
                fraction = 0.64f,
            )
            LaneCard(lane = "insightBatch", premium = false)
            UpgradeCard(
                offers = PremiumOffers(
                    annual = PremiumOffer(
                        productId = "azf_premium_annual",
                        period = PlanPeriod.ANNUAL,
                        formattedPrice = "$59.99",
                        priceAmountMicros = 59990000L,
                        currencyCode = "USD",
                        hasFreeTrial = true,
                    ),
                    monthly = PremiumOffer(
                        productId = "azf_premium_monthly",
                        period = PlanPeriod.MONTHLY,
                        formattedPrice = "$9.99",
                        priceAmountMicros = 9990000L,
                        currencyCode = "USD",
                        hasFreeTrial = false,
                    ),
                ),
                selectedPeriod = PlanPeriod.ANNUAL,
                onSelectPeriod = {},
                offerLoading = false,
                purchasing = false,
                onUpgrade = {},
            )
        }
    }
}
