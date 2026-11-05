package fit.aquazero.app.feature.settings

import androidx.activity.compose.LocalActivity
import androidx.annotation.StringRes
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.selection.selectable
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
import androidx.compose.ui.semantics.Role
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
import fit.aquazero.app.core.designsystem.AzfColors
import fit.aquazero.app.core.designsystem.AzfHeroSurface
import fit.aquazero.app.core.designsystem.AzfSectionHeading
import fit.aquazero.app.core.designsystem.AzfShapes
import fit.aquazero.app.core.designsystem.AzfSpacing
import fit.aquazero.app.core.designsystem.AzfStatRow
import fit.aquazero.app.core.designsystem.AzfTheme
import fit.aquazero.app.core.designsystem.DataSmall
import fit.aquazero.app.core.designsystem.ErrorState
import fit.aquazero.app.core.designsystem.PrimaryButton
import fit.aquazero.app.core.designsystem.Scoreboard
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
                        top = 8.dp,
                        bottom = AzfSpacing.SectionGap,
                    ),
                    verticalArrangement = Arrangement.spacedBy(AzfSpacing.Gutter),
                ) {
                    item { Skeleton(modifier = Modifier.fillMaxWidth().height(160.dp)) }
                    item { Skeleton(modifier = Modifier.fillMaxWidth().height(80.dp)) }
                    item { Skeleton(modifier = Modifier.fillMaxWidth().height(120.dp)) }
                }
            }

            state.failed -> {
                ErrorState(
                    title = stringResource(R.string.plan_error_title),
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
                        top = 8.dp,
                        bottom = AzfSpacing.SectionGap,
                    ),
                    verticalArrangement = Arrangement.spacedBy(AzfSpacing.Gutter),
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
                            modifier = Modifier.padding(top = 20.dp),
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
                        item {
                            AzfSectionHeading(
                                stringResource(R.string.plan_costs_heading),
                                modifier = Modifier.padding(top = 20.dp),
                            )
                        }
                        item {
                            AzfCard(modifier = Modifier.fillMaxWidth()) {
                                state.costRows.forEachIndexed { index, (task, cost) ->
                                    CostRow(task = task, cost = cost, last = index == state.costRows.lastIndex)
                                }
                            }
                        }
                    }

                    if (!state.premium) {
                        item {
                            UpgradeCard(
                                offers = state.offers,
                                premiumDailyCredits = state.entitlements?.premiumDailyCredits ?: 0,
                                playVerifyAvailable = state.playVerifyAvailable,
                                selectedPeriod = state.selectedPeriod,
                                onSelectPeriod = viewModel::selectPeriod,
                                offerLoading = state.offerLoading,
                                purchasing = state.purchasing,
                                onUpgrade = { activity?.let(viewModel::upgrade) },
                            )
                        }
                    } else {
                        item {
                            val playActive = state.entitlements?.hasActivePlaySubscription() == true
                            Column(modifier = Modifier.padding(horizontal = 4.dp)) {
                                Text(
                                    text = stringResource(
                                        if (playActive) {
                                            R.string.plan_premium_play_note
                                        } else {
                                            R.string.plan_premium_note
                                        },
                                    ),
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                                if (playActive) {
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
}

@Composable
private fun PositionCard(entitlements: EntitlementsDto, fraction: Float) {
    val premium = entitlements.tier == UserTier.PREMIUM
    AzfHeroSurface(modifier = Modifier.fillMaxWidth()) {
        AzfStatRow(
            label = stringResource(R.string.plan_current),
            value = stringResource(if (premium) R.string.plan_tier_premium else R.string.plan_tier_free),
        )
        AzfStatRow(
            label = stringResource(
                if (entitlements.creditsRemaining == 1) {
                    R.string.plan_credit_available_one
                } else {
                    R.string.plan_credits_available
                },
            ),
            value = entitlements.creditsRemaining.toString(),
            valueStyle = Scoreboard,
            divider = false,
        )
        Spacer(modifier = Modifier.height(8.dp))
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
        AzfStatRow(
            label = stringResource(R.string.plan_daily_credits_label),
            value = entitlements.dailyCredits.toString(),
            valueStyle = DataSmall,
            divider = entitlements.maxBankedCredits > 0,
        )
        if (entitlements.maxBankedCredits > 0) {
            AzfStatRow(
                label = stringResource(R.string.plan_bank_limit_label),
                value = entitlements.maxBankedCredits.toString(),
                valueStyle = DataSmall,
                divider = false,
            )
        }
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = creditsExplainer(entitlements),
            style = MaterialTheme.typography.bodyMedium,
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
                style = MaterialTheme.typography.titleMedium,
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
                    style = MaterialTheme.typography.labelMedium,
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
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun CostRow(task: String, cost: Int, last: Boolean) {
    AzfStatRow(
        label = taskLabel(task),
        value = cost.toString(),
        unit = stringResource(if (cost == 1) R.string.plan_cost_unit_one else R.string.plan_cost_unit),
        valueStyle = DataSmall,
        divider = !last,
    )
}

/**
 * The upgrade offer card with interactive Annual vs Monthly selection and 7-day free trial.
 */
@Composable
private fun UpgradeCard(
    offers: PremiumOffers?,
    premiumDailyCredits: Int,
    playVerifyAvailable: Boolean,
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
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(20.dp),
            )
            Spacer(modifier = Modifier.size(8.dp))
            AzfSectionHeading(stringResource(R.string.plan_upgrade_heading))
        }
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = if (premiumDailyCredits > 0) {
                stringResource(R.string.plan_upgrade_body, premiumDailyCredits)
            } else {
                stringResource(R.string.plan_upgrade_body_capped)
            },
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = stringResource(R.string.plan_upgrade_coaches),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(modifier = Modifier.height(16.dp))

        when {
            offerLoading -> Skeleton(modifier = Modifier.fillMaxWidth().height(140.dp))
            !playVerifyAvailable -> Text(
                text = stringResource(R.string.plan_upgrade_server_unavailable),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            offers == null || (offers.annual == null && offers.monthly == null) -> Text(
                text = stringResource(R.string.plan_upgrade_unavailable),
                style = MaterialTheme.typography.bodyMedium,
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
                    selectedPeriod == PlanPeriod.ANNUAL && annualOffer?.hasFreeTrial == true ->
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

                val termsRes = upgradeTermsRes(offers, selectedPeriod)
                val termsText = when (termsRes) {
                    R.string.plan_upgrade_terms_annual,
                    R.string.plan_upgrade_terms_annual_no_trial,
                    -> stringResource(termsRes, annualOffer?.formattedPrice.orEmpty())
                    R.string.plan_upgrade_terms_monthly ->
                        stringResource(termsRes, monthlyOffer?.formattedPrice.orEmpty())
                    else -> stringResource(termsRes)
                }

                Text(
                    text = termsText,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@StringRes
internal fun upgradeTermsRes(offers: PremiumOffers, selectedPeriod: PlanPeriod): Int {
    val annualOffer = offers.annual
    return when {
        selectedPeriod == PlanPeriod.ANNUAL && annualOffer != null && annualOffer.hasFreeTrial ->
            R.string.plan_upgrade_terms_annual
        selectedPeriod == PlanPeriod.ANNUAL && annualOffer != null ->
            R.string.plan_upgrade_terms_annual_no_trial
        offers.monthly != null ->
            R.string.plan_upgrade_terms_monthly
        else ->
            R.string.plan_upgrade_terms
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
            .selectable(selected = selected, role = Role.RadioButton, onClick = onClick)
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
                                style = MaterialTheme.typography.labelMedium,
                                color = AzfColors.SecondaryFixedDim,
                            )
                        }
                    }
                }
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = priceText,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (subBadgeText != null) {
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        text = "• $subBadgeText",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
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
                premiumDailyCredits = 60,
                playVerifyAvailable = true,
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
