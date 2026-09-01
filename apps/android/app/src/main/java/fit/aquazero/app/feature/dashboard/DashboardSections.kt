package fit.aquazero.app.feature.dashboard

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.Bolt
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.EmojiEvents
import androidx.compose.material.icons.outlined.FitnessCenter
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import fit.aquazero.app.R
import fit.aquazero.app.core.common.LocalDailyNutrition
import fit.aquazero.app.core.designsystem.AkinPose
import fit.aquazero.app.core.designsystem.AkinStage
import fit.aquazero.app.core.designsystem.AzfCard
import fit.aquazero.app.core.designsystem.AzfCardTier
import fit.aquazero.app.core.designsystem.AzfShapes
import fit.aquazero.app.core.designsystem.AzfSpacing
import fit.aquazero.app.core.designsystem.AzfTheme
import fit.aquazero.app.core.designsystem.DataLarge
import fit.aquazero.app.core.designsystem.DataSmall
import fit.aquazero.app.core.designsystem.LocalAzfExtended
import fit.aquazero.app.core.designsystem.PrimaryButton
import fit.aquazero.app.core.designsystem.RingProgress
import fit.aquazero.app.core.designsystem.SecondaryButton
import fit.aquazero.app.core.designsystem.Skeleton
import fit.aquazero.app.core.designsystem.Sparkline
import fit.aquazero.app.core.designsystem.pressScale
import fit.aquazero.app.core.ui.HydrationCard
import fit.aquazero.app.core.ui.MacroRow
import fit.aquazero.app.core.ui.NutritionFormat

/** Date line, greeting and the Akin mascot — the screen's personal opener. */
@Composable
internal fun GreetingHeader(
    localDate: String,
    firstName: String?,
    loading: Boolean,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = NutritionFormat.formatLocalDate(localDate),
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(2.dp))
            if (loading && firstName == null) {
                Skeleton(
                    modifier = Modifier
                        .padding(top = 4.dp)
                        .width(160.dp)
                        .height(28.dp),
                )
            } else {
                Text(
                    text = firstName
                        ?.let { stringResource(R.string.dashboard_greeting_named, it) }
                        ?: stringResource(R.string.dashboard_greeting),
                    style = MaterialTheme.typography.headlineLarge,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }
        }
        AkinStage(
            size = 88.dp,
            initialPose = AkinPose.Idle,
            modifier = Modifier.padding(start = AzfSpacing.ElementGapMedium),
        )
    }
}

/**
 * The calorie ring hero. Macro semantics are fixed and must not be
 * re-themed: protein = secondary green, carbs = primary aqua, fat = coral.
 */
@Composable
internal fun CalorieHeroCard(
    nutrition: LocalDailyNutrition,
    kcalBurned: Double = 0.0,
    proteinFirst: Boolean = false,
    onExplainTarget: (() -> Unit)? = null,
    showDerivationRow: Boolean = true,
    modifier: Modifier = Modifier,
) {
    val extended = LocalAzfExtended.current
    AzfCard(modifier = modifier.fillMaxWidth(), tier = AzfCardTier.Hero) {
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = stringResource(
                        if (proteinFirst) R.string.dashboard_protein_title else R.string.dashboard_nutrition_title,
                    ).uppercase(),
                    style = MaterialTheme.typography.headlineSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    text = stringResource(
                        if (proteinFirst) R.string.dashboard_protein_goal else R.string.dashboard_daily_goal,
                    ),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(
                    text = stringResource(
                        if (proteinFirst) R.string.dashboard_protein_consumed else R.string.dashboard_consumed,
                    ).uppercase(),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    text = if (proteinFirst) {
                        NutritionFormat.fmt1(nutrition.proteinConsumed)
                    } else {
                        NutritionFormat.fmtInt(nutrition.kcalConsumed)
                    },
                    style = DataSmall,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }
        }

        Spacer(Modifier.height(AzfSpacing.ElementGapMedium))

        val ringProgress = if (proteinFirst) {
            NutritionFormat.clampFraction(nutrition.proteinConsumed, nutrition.proteinTarget)
        } else {
            NutritionFormat.clampFraction(nutrition.kcalConsumed, nutrition.kcalTarget)
        }
        val ringRemaining = if (proteinFirst) {
            nutrition.proteinTarget - nutrition.proteinConsumed
        } else {
            nutrition.kcalRemaining
        }
        val ringDescription = if (proteinFirst) {
            stringResource(
                R.string.dashboard_protein_cd,
                NutritionFormat.fmt1(nutrition.proteinConsumed),
                NutritionFormat.fmt1(nutrition.proteinTarget),
            )
        } else {
            stringResource(
                R.string.dashboard_calories_cd,
                NutritionFormat.fmtInt(nutrition.kcalConsumed),
                NutritionFormat.fmtInt(nutrition.kcalTarget),
            )
        }
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .semantics { contentDescription = ringDescription },
            contentAlignment = Alignment.Center,
        ) {
            RingProgress(
                progress = ringProgress,
                size = 180.dp,
                strokeWidth = 8.dp,
                color = if (proteinFirst) extended.secondaryFixedDim else extended.primaryFixedDim,
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.clearAndSetSemantics { },
                ) {
                    Text(
                        text = if (proteinFirst) {
                            NutritionFormat.fmt1(ringRemaining.coerceAtLeast(0.0))
                        } else {
                            NutritionFormat.fmtInt(ringRemaining.coerceAtLeast(0.0))
                        },
                        style = DataLarge,
                        color = if (proteinFirst) extended.secondaryFixedDim else MaterialTheme.colorScheme.primary,
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = stringResource(
                            if (proteinFirst) R.string.dashboard_protein_left else R.string.dashboard_kcal_left,
                        ).uppercase(),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }

        Spacer(Modifier.height(AzfSpacing.ElementGapMedium))

        if (!proteinFirst && showDerivationRow) {
            CalorieDerivationRow(
                nutrition = nutrition,
                kcalBurned = kcalBurned,
            )
            if (onExplainTarget != null) {
                Spacer(Modifier.height(8.dp))
                TextButton(onClick = onExplainTarget) {
                    Text(
                        text = stringResource(R.string.target_explain_link),
                        style = MaterialTheme.typography.labelMedium,
                    )
                }
            }
            Spacer(Modifier.height(AzfSpacing.ElementGapMedium))
        }

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
        if (proteinFirst) {
            Spacer(Modifier.height(12.dp))
            MacroRow(
                label = stringResource(R.string.macro_calories),
                consumed = nutrition.kcalConsumed,
                target = nutrition.kcalTarget,
                color = MaterialTheme.colorScheme.primary,
            )
        }
    }
}

/** Goal minus food plus exercise equals remaining (matches Nutrition day view). */
@Composable
internal fun CalorieDerivationRow(
    nutrition: LocalDailyNutrition,
    kcalBurned: Double,
    modifier: Modifier = Modifier,
) {
    val formulaDescription = stringResource(
        R.string.nutrition_formula_cd,
        NutritionFormat.fmtInt(nutrition.kcalTarget),
        NutritionFormat.fmtInt(nutrition.kcalConsumed),
        NutritionFormat.fmtInt(kcalBurned),
        NutritionFormat.fmtInt(nutrition.kcalRemaining),
    )
    Row(
        modifier = modifier
            .fillMaxWidth()
            .semantics { contentDescription = formulaDescription },
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        DerivationCell(
            value = NutritionFormat.fmtInt(nutrition.kcalTarget),
            label = stringResource(R.string.nutrition_goal),
            modifier = Modifier.weight(1f),
        )
        DerivationCell(
            value = "− ${NutritionFormat.fmtInt(nutrition.kcalConsumed)}",
            label = stringResource(R.string.nutrition_food),
            modifier = Modifier.weight(1f),
        )
        DerivationCell(
            value = "+ ${NutritionFormat.fmtInt(kcalBurned)}",
            label = stringResource(R.string.nutrition_exercise),
            modifier = Modifier.weight(1f),
        )
        DerivationCell(
            value = NutritionFormat.fmtInt(nutrition.kcalRemaining),
            label = stringResource(R.string.nutrition_remaining),
            accent = true,
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun DerivationCell(
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

/** Today's session, or the calm rest-day card when there is nothing planned. */
@Composable
internal fun TodayWorkoutCard(
    workout: TodayWorkoutUi?,
    loading: Boolean,
    onOpenWorkout: (String?) -> Unit,
    modifier: Modifier = Modifier,
) {
    if (loading) {
        Skeleton(
            modifier = modifier
                .fillMaxWidth()
                .height(160.dp),
            shape = AzfShapes.Card,
        )
        return
    }
    if (workout == null || workout.rest) {
        AzfCard(modifier = modifier.fillMaxWidth()) {
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = stringResource(R.string.workout_rest_title).uppercase(),
                        style = MaterialTheme.typography.headlineSmall,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    Text(
                        text = stringResource(R.string.workout_rest_body),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                SecondaryButton(
                    text = stringResource(R.string.workout_explore),
                    onClick = { onOpenWorkout(null) },
                    modifier = Modifier
                        .padding(start = AzfSpacing.ElementGapMedium)
                        .width(130.dp),
                )
            }
        }
        return
    }

    AzfCard(modifier = modifier.fillMaxWidth()) {
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = stringResource(R.string.workout_today_title).uppercase(),
                    style = MaterialTheme.typography.headlineSmall,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    text = workout.focus,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            StatusPill(
                text = stringResource(
                    if (workout.completed) R.string.workout_status_done else R.string.workout_status_planned,
                ),
            )
        }

        Spacer(Modifier.height(AzfSpacing.ElementGapMedium))

        Row(verticalAlignment = Alignment.CenterVertically) {
            MetricChip(
                icon = Icons.Outlined.FitnessCenter,
                value = workout.exerciseCount.toString(),
                description = stringResource(R.string.workout_exercises_cd, workout.exerciseCount),
            )
            Spacer(Modifier.width(AzfSpacing.ElementGapMedium))
            MetricChip(
                icon = Icons.Outlined.Schedule,
                value = stringResource(R.string.workout_duration, workout.durationMinutes),
                description = stringResource(R.string.workout_duration_cd, workout.durationMinutes),
            )
            workout.kcalBurned?.let { kcal ->
                Spacer(Modifier.width(AzfSpacing.ElementGapMedium))
                MetricChip(
                    icon = Icons.Outlined.Bolt,
                    value = NutritionFormat.fmtInt(kcal),
                    description = stringResource(
                        R.string.workout_kcal_cd,
                        NutritionFormat.fmtInt(kcal),
                    ),
                )
            }
        }

        Spacer(Modifier.height(AzfSpacing.ElementGapMedium))

        PrimaryButton(
            text = stringResource(
                if (workout.completed) R.string.workout_view else R.string.workout_start,
            ),
            onClick = { onOpenWorkout(workout.sessionId) },
        )
    }
}

/**
 * The suggest-a-meal lane. Online-only by design, so its failure mode is a
 * calm inline note, never an error page — and the suggestion is never logged
 * without the explicit "add to log" tap (product invariant 1).
 */
@Composable
internal fun SuggestMealCard(
    suggestion: SuggestionUi?,
    phase: SuggestionPhase,
    onSuggest: () -> Unit,
    onLog: () -> Unit,
    modifier: Modifier = Modifier,
) {
    AzfCard(modifier = modifier.fillMaxWidth()) {
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(AzfShapes.Pill)
                    .background(LocalAzfExtended.current.ctaGradient),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.Outlined.AutoAwesome,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onPrimary,
                )
            }
            Column(modifier = Modifier.padding(start = 12.dp)) {
                Text(
                    text = stringResource(R.string.suggest_title).uppercase(),
                    style = MaterialTheme.typography.headlineSmall,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    text = stringResource(R.string.suggest_subtitle),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        if (suggestion != null) {
            Spacer(Modifier.height(AzfSpacing.ElementGapMedium))
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(AzfShapes.Inner)
                    .background(MaterialTheme.colorScheme.surfaceContainerLow)
                    .padding(16.dp),
            ) {
                Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
                    Text(
                        text = suggestion.name,
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.onSurface,
                        modifier = Modifier.weight(1f),
                    )
                    Text(
                        text = stringResource(
                            R.string.kcal_value,
                            NutritionFormat.fmtInt(suggestion.kcal),
                        ),
                        style = DataSmall,
                        color = MaterialTheme.colorScheme.primary,
                    )
                }
                Text(
                    text = stringResource(
                        R.string.macro_line,
                        NutritionFormat.fmt1(suggestion.proteinG),
                        NutritionFormat.fmt1(suggestion.carbsG),
                        NutritionFormat.fmt1(suggestion.fatG),
                    ),
                    style = DataSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 4.dp),
                )
                if (suggestion.rationale.isNotBlank()) {
                    Text(
                        text = suggestion.rationale,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                }
                Text(
                    text = stringResource(R.string.suggest_ai_disclaimer),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 8.dp),
                )
            }
        }

        if (phase == SuggestionPhase.Unavailable) {
            Text(
                text = stringResource(R.string.suggest_offline),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = AzfSpacing.ElementGapMedium),
            )
        }

        Spacer(Modifier.height(AzfSpacing.ElementGapMedium))

        Row(modifier = Modifier.fillMaxWidth()) {
            SecondaryButton(
                text = when {
                    phase == SuggestionPhase.Thinking -> stringResource(R.string.suggest_thinking)
                    suggestion != null -> stringResource(R.string.suggest_another)
                    else -> stringResource(R.string.suggest_action)
                },
                onClick = onSuggest,
                enabled = phase != SuggestionPhase.Thinking,
                modifier = Modifier.weight(1f),
            )
            if (suggestion != null) {
                Spacer(Modifier.width(12.dp))
                PrimaryButton(
                    text = when {
                        suggestion.logged -> stringResource(R.string.suggest_logged_label)
                        suggestion.logging -> stringResource(R.string.suggest_logging)
                        else -> stringResource(R.string.suggest_add)
                    },
                    onClick = onLog,
                    enabled = !suggestion.logged && !suggestion.logging,
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

/** Weight sparkline. Coral only — gain is never rendered in red. */
@Composable
internal fun WeightTrendCard(
    series: List<Double>,
    currentWeightKg: Double?,
    onViewAll: () -> Unit,
    modifier: Modifier = Modifier,
) {
    AzfCard(modifier = modifier.fillMaxWidth()) {
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = stringResource(R.string.weight_trend_title).uppercase(),
                style = MaterialTheme.typography.headlineSmall,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.weight(1f),
            )
            val interaction = remember { MutableInteractionSource() }
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .pressScale(interaction)
                    .clip(AzfShapes.Pill)
                    .clickable(
                        interactionSource = interaction,
                        indication = null,
                        onClick = onViewAll,
                    )
                    .padding(horizontal = 8.dp, vertical = 6.dp),
            ) {
                Text(
                    text = stringResource(R.string.weight_view_all),
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.primary,
                )
                Icon(
                    imageVector = Icons.Outlined.ChevronRight,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(18.dp),
                )
            }
        }

        Spacer(Modifier.height(8.dp))

        if (currentWeightKg != null) {
            Row(verticalAlignment = Alignment.Bottom) {
                Text(
                    text = NutritionFormat.fmt1(currentWeightKg),
                    style = DataLarge,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    text = stringResource(R.string.weight_unit_kg),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(start = 4.dp, bottom = 2.dp),
                )
            }
            Spacer(Modifier.height(8.dp))
        }

        if (series.size < 2) {
            Text(
                text = stringResource(R.string.weight_empty),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            val description = stringResource(
                R.string.weight_sparkline_cd,
                NutritionFormat.fmt1(series.first()),
                NutritionFormat.fmt1(series.last()),
            )
            Sparkline(
                values = series.map { it.toFloat() },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(64.dp)
                    .semantics { contentDescription = description },
            )
        }
    }
}

/** Horizontal achievement strip: locked tiles at 35% alpha, earned filled. */
@Composable
internal fun AchievementsStrip(
    achievements: List<AchievementUi>,
    loading: Boolean,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier.fillMaxWidth()) {
        Text(
            text = stringResource(R.string.achievements_title).uppercase(),
            style = MaterialTheme.typography.headlineSmall,
            color = MaterialTheme.colorScheme.onSurface,
        )
        Spacer(Modifier.height(12.dp))
        when {
            loading -> Row {
                repeat(3) {
                    Skeleton(
                        modifier = Modifier
                            .padding(end = 12.dp)
                            .size(width = 112.dp, height = 96.dp),
                        shape = AzfShapes.Card,
                    )
                }
            }

            achievements.isEmpty() -> Text(
                text = stringResource(R.string.achievements_empty),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            else -> LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                items(achievements, key = { it.id }) { achievement ->
                    AchievementTile(achievement)
                }
            }
        }
    }
}

@Composable
private fun AchievementTile(achievement: AchievementUi) {
    val description = stringResource(
        if (achievement.earned) R.string.achievement_cd_earned else R.string.achievement_cd_locked,
        achievement.name,
    )
    AzfCard(
        tier = AzfCardTier.Compact,
        modifier = Modifier
            .width(112.dp)
            .alpha(if (achievement.earned) 1f else LOCKED_ALPHA)
            .semantics { contentDescription = description },
    ) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Icon(
                imageVector = Icons.Outlined.EmojiEvents,
                contentDescription = null,
                tint = LocalAzfExtended.current.secondaryFixedDim,
                modifier = Modifier.size(28.dp),
            )
            Text(
                text = achievement.name,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurface,
                textAlign = TextAlign.Center,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(top = 6.dp),
            )
            Text(
                text = stringResource(
                    if (achievement.earned) R.string.achievement_earned else R.string.achievement_locked,
                ).uppercase(),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 2.dp),
            )
        }
    }
}

@Composable
private fun StatusPill(text: String) {
    val accent = LocalAzfExtended.current.secondaryFixedDim
    Text(
        text = text.uppercase(),
        style = MaterialTheme.typography.labelSmall,
        color = accent,
        modifier = Modifier
            .clip(AzfShapes.Pill)
            .background(accent.copy(alpha = 0.12f))
            .padding(horizontal = 10.dp, vertical = 4.dp),
    )
}

@Composable
private fun MetricChip(
    icon: ImageVector,
    value: String,
    description: String,
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.semantics { contentDescription = description },
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(16.dp),
        )
        Text(
            text = value,
            style = DataSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(start = 6.dp),
        )
    }
}

private const val LOCKED_ALPHA = 0.35f

// ----------------------------------------------------------------- previews

private val previewNutrition = LocalDailyNutrition(
    kcalTarget = 2400.0,
    kcalConsumed = 1800.0,
    kcalRemaining = 600.0,
    proteinConsumed = 92.0,
    proteinTarget = 140.0,
    carbsConsumed = 180.0,
    carbsTarget = 220.0,
    fatConsumed = 40.0,
    fatTarget = 70.0,
    waterConsumedMl = 1250,
    waterTargetMl = 2000,
)

@Preview(showBackground = true, backgroundColor = 0xFF0E1416)
@Composable
private fun CalorieHeroCardPreview() {
    AzfTheme {
        Column(Modifier.padding(16.dp)) {
            CalorieHeroCard(previewNutrition, kcalBurned = 320.0)
        }
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416)
@Composable
private fun HydrationCardPreview() {
    AzfTheme {
        Column(Modifier.padding(16.dp)) {
            HydrationCard(consumedMl = 1250, targetMl = 2000, pending = false, onLogWater = {})
        }
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416)
@Composable
private fun TodayWorkoutCardPreview() {
    AzfTheme {
        Column(Modifier.padding(16.dp)) {
            TodayWorkoutCard(
                workout = TodayWorkoutUi(
                    sessionId = "s1",
                    focus = "Upper body push",
                    exerciseCount = 6,
                    durationMinutes = 42,
                    kcalBurned = 310.0,
                    completed = false,
                    rest = false,
                ),
                loading = false,
                onOpenWorkout = {},
            )
        }
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416)
@Composable
private fun RestDayCardPreview() {
    AzfTheme {
        Column(Modifier.padding(16.dp)) {
            TodayWorkoutCard(workout = null, loading = false, onOpenWorkout = {})
        }
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416)
@Composable
private fun SuggestMealCardPreview() {
    AzfTheme {
        Column(Modifier.padding(16.dp)) {
            SuggestMealCard(
                suggestion = SuggestionUi(
                    id = "r1",
                    name = "Greek yoghurt, berries and walnuts",
                    kcal = 420.0,
                    proteinG = 31.0,
                    carbsG = 38.0,
                    fatG = 16.0,
                    rationale = "Closes today's protein gap without crowding your fat target.",
                ),
                phase = SuggestionPhase.Idle,
                onSuggest = {},
                onLog = {},
            )
        }
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416)
@Composable
private fun WeightTrendCardPreview() {
    AzfTheme {
        Column(Modifier.padding(16.dp)) {
            WeightTrendCard(
                series = listOf(82.4, 82.1, 82.2, 81.8, 81.9, 81.5, 81.2),
                currentWeightKg = 81.2,
                onViewAll = {},
            )
        }
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416)
@Composable
private fun AchievementsStripPreview() {
    AzfTheme {
        Column(Modifier.padding(16.dp)) {
            AchievementsStrip(
                achievements = listOf(
                    AchievementUi("a1", "First weigh-in", true),
                    AchievementUi("a2", "Seven active days", true),
                    AchievementUi("a3", "Hydration habit", false),
                    AchievementUi("a4", "Ten workouts", false),
                ),
                loading = false,
            )
        }
    }
}
