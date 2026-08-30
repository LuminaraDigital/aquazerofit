package fit.aquazero.app.feature.onboarding

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
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.TrendingDown
import androidx.compose.material.icons.automirrored.outlined.TrendingUp
import androidx.compose.material.icons.outlined.Balance
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.Verified
import androidx.compose.material.icons.outlined.WaterDrop
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import fit.aquazero.app.R
import fit.aquazero.app.core.designsystem.AzfAppHeader
import fit.aquazero.app.core.designsystem.AzfCard
import fit.aquazero.app.core.designsystem.AzfColors
import fit.aquazero.app.core.designsystem.AzfConsentRow
import fit.aquazero.app.core.designsystem.AzfOptionCard
import fit.aquazero.app.core.designsystem.AzfSegmentOption
import fit.aquazero.app.core.designsystem.AzfSegmented
import fit.aquazero.app.core.designsystem.AzfSpacing
import fit.aquazero.app.core.designsystem.AzfTextField
import fit.aquazero.app.core.designsystem.AzfTheme
import fit.aquazero.app.core.designsystem.PrimaryButton
import fit.aquazero.app.core.designsystem.RingProgress
import fit.aquazero.app.core.designsystem.SecondaryButton
import fit.aquazero.app.core.model.ActivityLevel
import fit.aquazero.app.core.model.DerivedTargetsDto
import fit.aquazero.app.core.model.Goal
import fit.aquazero.app.core.model.Sex
import fit.aquazero.app.core.model.UnitPreference
import fit.aquazero.app.feature.dashboard.NutritionFormat
import kotlin.math.roundToInt

/**
 * Wellness essentials — six controls, one screen, then the numbers they
 * produce.
 *
 * The form does not exist to collect a profile; it exists because a calorie
 * target cannot be computed without weight, height, age, sex, activity and
 * goal. Everything else the old wizard asked for feeds personalisation rather
 * than arithmetic, so it is deferred to Settings and said so on the reveal.
 */
@Composable
fun SetupScreen(
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: SetupViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()

    androidx.compose.runtime.LaunchedEffect(viewModel) {
        viewModel.events.collect { event ->
            when (event) {
                SetupEvent.Finished -> onBack()
            }
        }
    }

    when {
        state.loading -> SetupLoading(modifier)
        state.phase == SetupPhase.REVEAL -> TargetsReveal(
            targets = state.targets,
            onContinue = viewModel::finish,
            modifier = modifier,
        )
        else -> SetupForm(
            state = state,
            onBack = onBack,
            viewModel = viewModel,
            modifier = modifier,
        )
    }
}

@Composable
private fun SetupLoading(modifier: Modifier = Modifier) {
    Box(modifier = modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(color = AzfColors.PrimaryFixedDim)
    }
}

@Composable
private fun SetupForm(
    state: SetupUiState,
    onBack: () -> Unit,
    viewModel: SetupViewModel,
    modifier: Modifier = Modifier,
) {
    val metric = state.unit == UnitPreference.METRIC
    val activityOptions = ACTIVITY_OPTIONS.map { AzfSegmentOption(it.level, stringResource(it.labelRes)) }
    val activityHint = ACTIVITY_OPTIONS.firstOrNull { it.level == state.activityLevel }
        ?.let { stringResource(it.hintRes) }

    Scaffold(
        modifier = modifier.fillMaxSize(),
        topBar = {
            AzfAppHeader(
                title = stringResource(R.string.screen_setup),
                onBack = onBack,
            )
        },
    ) { innerPadding ->
        LazyColumn(
            modifier = Modifier
                .padding(innerPadding)
                .fillMaxSize(),
            contentPadding = PaddingValues(AzfSpacing.ContainerMargin),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            item {
                Column {
                    Text(
                        text = stringResource(R.string.setup_heading),
                        style = MaterialTheme.typography.headlineLarge,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        text = stringResource(R.string.setup_intro),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            item {
                AzfSegmented(
                    label = stringResource(R.string.setup_units),
                    options = listOf(
                        AzfSegmentOption(UnitPreference.METRIC, stringResource(R.string.setup_unit_metric)),
                        AzfSegmentOption(UnitPreference.IMPERIAL, stringResource(R.string.setup_unit_imperial)),
                    ),
                    selected = state.unit,
                    onSelect = viewModel::onUnitChange,
                )
            }

            item {
                AzfTextField(
                    value = state.age,
                    onValueChange = viewModel::onAgeChange,
                    label = stringResource(R.string.setup_age),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                )
            }

            item {
                if (metric) {
                    AzfTextField(
                        value = state.heightCm,
                        onValueChange = viewModel::onHeightCmChange,
                        label = stringResource(R.string.setup_height_cm),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    )
                } else {
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        AzfTextField(
                            value = state.heightFt,
                            onValueChange = viewModel::onHeightFtChange,
                            label = stringResource(R.string.setup_height_ft),
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            modifier = Modifier.weight(1f),
                        )
                        AzfTextField(
                            value = state.heightIn,
                            onValueChange = viewModel::onHeightInChange,
                            label = stringResource(R.string.setup_height_in),
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
            }

            item {
                AzfTextField(
                    value = state.weight,
                    onValueChange = viewModel::onWeightChange,
                    label = stringResource(
                        if (metric) R.string.setup_weight_kg else R.string.setup_weight_lb,
                    ),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                )
            }

            item {
                AzfSegmented(
                    label = stringResource(R.string.setup_sex_label),
                    options = listOf(
                        AzfSegmentOption(Sex.FEMALE, stringResource(R.string.setup_sex_female)),
                        AzfSegmentOption(Sex.MALE, stringResource(R.string.setup_sex_male)),
                        AzfSegmentOption(
                            Sex.UNSPECIFIED,
                            stringResource(R.string.setup_sex_unspecified),
                        ),
                    ),
                    selected = state.sex,
                    onSelect = viewModel::onSexChange,
                )
            }

            item {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        text = stringResource(R.string.setup_goal_label),
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(start = 4.dp),
                    )
                    AzfOptionCard(
                        title = stringResource(R.string.setup_goal_lose),
                        body = stringResource(R.string.setup_goal_lose_body),
                        selected = state.goal == Goal.LOSE,
                        onClick = { viewModel.onGoalChange(Goal.LOSE) },
                        icon = Icons.AutoMirrored.Outlined.TrendingDown,
                    )
                    AzfOptionCard(
                        title = stringResource(R.string.setup_goal_maintain),
                        body = stringResource(R.string.setup_goal_maintain_body),
                        selected = state.goal == Goal.MAINTAIN,
                        onClick = { viewModel.onGoalChange(Goal.MAINTAIN) },
                        icon = Icons.Outlined.Balance,
                    )
                    AzfOptionCard(
                        title = stringResource(R.string.setup_goal_gain),
                        body = stringResource(R.string.setup_goal_gain_body),
                        selected = state.goal == Goal.GAIN,
                        onClick = { viewModel.onGoalChange(Goal.GAIN) },
                        icon = Icons.AutoMirrored.Outlined.TrendingUp,
                    )
                }
            }

            item {
                AzfSegmented(
                    label = stringResource(R.string.setup_activity_label),
                    options = activityOptions,
                    selected = state.activityLevel,
                    onSelect = viewModel::onActivityChange,
                    hint = activityHint,
                )
            }

            if (state.isFirstSetup) {
                item {
                    AzfCard(modifier = Modifier.fillMaxWidth()) {
                        AzfConsentRow(
                            title = stringResource(R.string.consent_wellness_title),
                            body = stringResource(R.string.consent_wellness_body),
                            checked = state.consentWellness,
                            onCheckedChange = viewModel::onConsentWellnessChange,
                        )
                        AzfConsentRow(
                            title = stringResource(R.string.consent_ai_title),
                            body = stringResource(R.string.consent_ai_body),
                            checked = state.consentAi,
                            onCheckedChange = viewModel::onConsentAiChange,
                        )
                        AzfConsentRow(
                            title = stringResource(R.string.consent_analytics_title),
                            body = stringResource(R.string.consent_analytics_body),
                            checked = state.consentAnalytics,
                            onCheckedChange = viewModel::onConsentAnalyticsChange,
                        )
                        AzfConsentRow(
                            title = stringResource(R.string.consent_reminders_title),
                            body = stringResource(R.string.consent_reminders_body),
                            checked = state.consentReminders,
                            onCheckedChange = viewModel::onConsentRemindersChange,
                        )
                    }
                }
            }

            if (state.errorRes != null) {
                item {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.semantics { liveRegion = LiveRegionMode.Assertive },
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.Info,
                            contentDescription = null,
                            tint = AzfColors.TertiaryContainer,
                            modifier = Modifier.size(18.dp),
                        )
                        Spacer(modifier = Modifier.size(8.dp))
                        Text(
                            text = stringResource(state.errorRes),
                            style = MaterialTheme.typography.bodySmall,
                            color = AzfColors.TertiaryContainer,
                        )
                    }
                }
            }

            item {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    PrimaryButton(
                        text = stringResource(R.string.setup_submit),
                        onClick = viewModel::submit,
                        loading = state.saving,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    SecondaryButton(
                        text = stringResource(R.string.setup_skip),
                        onClick = onBack,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
        }
    }
}

/**
 * The payoff. Seeing the numbers appear is what justifies the six questions —
 * and the clamp advisory is part of that, not an exception buried in a toast.
 */
@Composable
private fun TargetsReveal(
    targets: DerivedTargetsDto?,
    onContinue: () -> Unit,
    modifier: Modifier = Modifier,
) {
    if (targets == null) {
        SetupLoading(modifier)
        return
    }
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(AzfSpacing.ContainerMargin),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Icon(
                    imageVector = Icons.Outlined.Verified,
                    contentDescription = null,
                    tint = AzfColors.SecondaryFixedDim,
                    modifier = Modifier.size(48.dp),
                )
                Spacer(modifier = Modifier.height(12.dp))
                Text(
                    text = stringResource(R.string.setup_reveal_heading),
                    style = MaterialTheme.typography.headlineLarge,
                    color = MaterialTheme.colorScheme.onSurface,
                    textAlign = TextAlign.Center,
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = stringResource(R.string.setup_reveal_subtitle),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                )
            }
        }

        item {
            RingProgress(
                progress = 1f,
                size = 180.dp,
                strokeWidth = 10.dp,
                center = {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            text = NutritionFormat.fmtInt(targets.kcalTarget),
                            style = MaterialTheme.typography.headlineLarge,
                            color = MaterialTheme.colorScheme.onSurface,
                        )
                        Text(
                            text = stringResource(R.string.setup_reveal_kcal_sublabel),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                },
            )
        }

        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly,
            ) {
                MacroRing(
                    grams = targets.proteinG,
                    label = stringResource(R.string.setup_reveal_protein),
                    color = AzfColors.SecondaryFixedDim,
                )
                MacroRing(
                    grams = targets.carbsG,
                    label = stringResource(R.string.setup_reveal_carbs),
                    color = AzfColors.PrimaryFixedDim,
                )
                MacroRing(
                    grams = targets.fatG,
                    label = stringResource(R.string.setup_reveal_fat),
                    color = AzfColors.Coral,
                )
            }
        }

        item {
            AzfCard(modifier = Modifier.fillMaxWidth()) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Outlined.WaterDrop,
                        contentDescription = null,
                        tint = AzfColors.PrimaryFixedDim,
                    )
                    Spacer(modifier = Modifier.size(12.dp))
                    Text(
                        text = stringResource(
                            R.string.setup_reveal_water,
                            NutritionFormat.fmtLitres(targets.waterMl.roundToInt()),
                        ),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                }
            }
        }

        if (targets.clamped) {
            item {
                AzfCard(modifier = Modifier.fillMaxWidth()) {
                    Row(verticalAlignment = Alignment.Top) {
                        Icon(
                            imageVector = Icons.Outlined.Info,
                            contentDescription = null,
                            tint = AzfColors.SecondaryFixedDim,
                        )
                        Spacer(modifier = Modifier.size(12.dp))
                        Text(
                            text = targets.clampReason?.let {
                                stringResource(R.string.setup_reveal_clamped_reason, it)
                            } ?: stringResource(R.string.setup_reveal_clamped),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }

        item {
            Text(
                text = stringResource(R.string.setup_deferred_note),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
        }

        item {
            PrimaryButton(
                text = stringResource(R.string.setup_reveal_continue),
                onClick = onContinue,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

@Composable
private fun MacroRing(
    grams: Double,
    label: String,
    color: androidx.compose.ui.graphics.Color,
) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        RingProgress(
            progress = 1f,
            size = 88.dp,
            strokeWidth = 6.dp,
            color = color,
            center = {
                Text(
                    text = stringResource(R.string.setup_reveal_grams, grams.roundToInt()),
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            },
        )
        Spacer(modifier = Modifier.height(6.dp))
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

/** Activity level with the sentence that tells someone which one they are. */
private data class ActivityOption(
    val level: ActivityLevel,
    val labelRes: Int,
    val hintRes: Int,
)

private val ACTIVITY_OPTIONS = listOf(
    ActivityOption(
        ActivityLevel.SEDENTARY,
        R.string.setup_activity_sedentary,
        R.string.setup_activity_sedentary_hint,
    ),
    ActivityOption(
        ActivityLevel.LIGHT,
        R.string.setup_activity_light,
        R.string.setup_activity_light_hint,
    ),
    ActivityOption(
        ActivityLevel.MODERATE,
        R.string.setup_activity_moderate,
        R.string.setup_activity_moderate_hint,
    ),
    ActivityOption(
        ActivityLevel.ACTIVE,
        R.string.setup_activity_active,
        R.string.setup_activity_active_hint,
    ),
    ActivityOption(
        ActivityLevel.VERY_ACTIVE,
        R.string.setup_activity_very_active,
        R.string.setup_activity_very_active_hint,
    ),
)

@Preview(showBackground = true, backgroundColor = 0xFF0E1416, heightDp = 1400)
@Composable
private fun SetupFormPreview() {
    AzfTheme {
        SetupFormPreviewBody()
    }
}

@Composable
private fun SetupFormPreviewBody() {
    // The form is previewed through its state rather than its view model, so
    // the preview needs no Hilt graph.
    val state = SetupUiState(
        loading = false,
        age = "28",
        heightCm = "175",
        weight = "75",
        goal = Goal.LOSE,
        activityLevel = ActivityLevel.MODERATE,
        consentWellness = true,
    )
    Column(modifier = Modifier.padding(AzfSpacing.ContainerMargin)) {
        Text(
            text = stringResource(R.string.setup_heading),
            style = MaterialTheme.typography.headlineLarge,
            color = MaterialTheme.colorScheme.onSurface,
        )
        Spacer(modifier = Modifier.height(12.dp))
        AzfOptionCard(
            title = stringResource(R.string.setup_goal_lose),
            body = stringResource(R.string.setup_goal_lose_body),
            selected = state.goal == Goal.LOSE,
            onClick = {},
            icon = Icons.AutoMirrored.Outlined.TrendingDown,
        )
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416, heightDp = 1000)
@Composable
private fun TargetsRevealPreview() {
    AzfTheme {
        TargetsReveal(
            targets = DerivedTargetsDto(
                userId = "u1",
                bmr = 1600.0,
                tdee = 2400.0,
                kcalTarget = 2100.0,
                proteinG = 150.0,
                carbsG = 220.0,
                fatG = 70.0,
                waterMl = 2600.0,
                clamped = true,
                clampReason = "safety floor",
                computedAt = "2026-08-27T00:00:00.000Z",
                formulaVersion = "v1",
            ),
            onContinue = {},
        )
    }
}
