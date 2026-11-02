package fit.aquazero.app.feature.dashboard

import androidx.annotation.StringRes
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.togetherWith
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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowForward
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.DinnerDining
import androidx.compose.material.icons.outlined.EggAlt
import androidx.compose.material.icons.outlined.FitnessCenter
import androidx.compose.material.icons.outlined.KeyboardArrowDown
import androidx.compose.material.icons.outlined.LunchDining
import androidx.compose.material.icons.outlined.MonitorWeight
import androidx.compose.material.icons.outlined.WaterDrop
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import fit.aquazero.app.R
import fit.aquazero.app.core.common.LocalDailyNutrition
import fit.aquazero.app.core.designsystem.AzfCard
import fit.aquazero.app.core.designsystem.AzfCardTier
import fit.aquazero.app.core.designsystem.AzfColors
import fit.aquazero.app.core.designsystem.AzfHeroSurface
import fit.aquazero.app.core.designsystem.AzfMotion
import fit.aquazero.app.core.designsystem.AzfShapes
import fit.aquazero.app.core.designsystem.GlowFrame
import fit.aquazero.app.core.designsystem.LocalAzfExtended
import fit.aquazero.app.core.designsystem.PrimaryButton
import fit.aquazero.app.core.designsystem.currentLocale
import fit.aquazero.app.core.designsystem.pressScale
import fit.aquazero.app.core.designsystem.rememberReducedMotion
import fit.aquazero.app.core.ui.CoachAvatar
import fit.aquazero.app.core.ui.CoachPersona
import fit.aquazero.app.core.ui.FuelRing
import fit.aquazero.app.core.ui.MacroMiniBars
import fit.aquazero.app.core.ui.NutritionFormat
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.format.TextStyle

private const val MORNING_END_HOUR = 12
private const val AFTERNOON_END_HOUR = 18
private const val DAYS_IN_WEEK = 7L
private const val ML_PER_LITRE = 1000.0

/** Greeting that knows the time of day, opposite the shell's settings button. */
@Composable
internal fun HomeGreeting(
    firstName: String?,
    hour: Int,
    localDate: String,
    persona: CoachPersona,
    modifier: Modifier = Modifier,
) {
    val greeting = when {
        hour < MORNING_END_HOUR -> firstName?.let { stringResource(R.string.home_greeting_morning_named, it) }
            ?: stringResource(R.string.home_greeting_morning)
        hour < AFTERNOON_END_HOUR -> firstName?.let { stringResource(R.string.home_greeting_afternoon_named, it) }
            ?: stringResource(R.string.home_greeting_afternoon)
        else -> firstName?.let { stringResource(R.string.home_greeting_evening_named, it) }
            ?: stringResource(R.string.home_greeting_evening)
    }
    Row(modifier = modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        CoachAvatar(persona = persona, size = 52.dp)
        Spacer(Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f).padding(end = 48.dp)) {
            Text(
                text = greeting,
                style = MaterialTheme.typography.headlineMedium,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
            )
            Text(
                text = NutritionFormat.formatLocalDate(localDate),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

/**
 * This week at a glance. Past days with no log are simply plain: nothing marks
 * an absence. The headline is the rolling active-day count, which is monotonic
 * in effort and cannot fall to zero after a gap (see `ConsistencyCopy`).
 */
@Composable
internal fun WeekStrip(
    localDate: String,
    loggedDays: Set<String>,
    activeDays: Int?,
    windowDays: Int,
    onOpenProgress: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val today = remember(localDate) { LocalDate.parse(localDate) }
    val monday = remember(today) { today.with(DayOfWeek.MONDAY) }
    val interaction = remember { MutableInteractionSource() }
    val description = stringResource(R.string.home_week_open_progress_cd, activeDays ?: 0, windowDays)
    Column(
        modifier = modifier
            .fillMaxWidth()
            .pressScale(interaction)
            .clip(AzfShapes.Card)
            .clickable(interactionSource = interaction, indication = null, role = Role.Button, onClick = onOpenProgress)
            .semantics(mergeDescendants = true) { contentDescription = description },
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().clearAndSetSemantics { },
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            for (offset in 0 until DAYS_IN_WEEK) {
                val day = monday.plusDays(offset)
                DayCell(day = day, isToday = day == today, logged = day.toString() in loggedDays)
            }
        }
        if (activeDays != null && activeDays > 0) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(top = 8.dp).clearAndSetSemantics { },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.End,
            ) {
                Text(
                    text = stringResource(R.string.home_week_active, activeDays, windowDays),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.width(4.dp))
                Icon(
                    imageVector = Icons.AutoMirrored.Outlined.ArrowForward,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(14.dp),
                )
            }
        }
    }
}

@Composable
private fun DayCell(day: LocalDate, isToday: Boolean, logged: Boolean) {
    val extended = LocalAzfExtended.current
    Column(
        modifier = Modifier
            .width(42.dp)
            .clip(AzfShapes.Pill)
            .then(
                if (isToday) {
                    Modifier.background(extended.ctaGradient)
                } else {
                    Modifier.background(MaterialTheme.colorScheme.surfaceContainerLow)
                },
            )
            .padding(vertical = 10.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        val ink = if (isToday) AzfColors.OnPrimary else MaterialTheme.colorScheme.onSurfaceVariant
        Text(
            text = day.dayOfWeek.getDisplayName(TextStyle.NARROW, currentLocale()),
            style = MaterialTheme.typography.labelSmall,
            color = ink,
        )
        Text(
            text = day.dayOfMonth.toString(),
            style = MaterialTheme.typography.titleMedium,
            color = if (isToday) AzfColors.OnPrimary else MaterialTheme.colorScheme.onSurface,
        )
        Spacer(Modifier.height(4.dp))
        Box(
            modifier = Modifier
                .size(5.dp)
                .clip(CircleShape)
                .background(
                    when {
                        !logged -> Color.Transparent
                        isToday -> AzfColors.OnPrimary
                        else -> extended.secondaryFixedDim
                    },
                ),
        )
    }
}

/**
 * The day in one card: fuel left, macros and loop progress, with the full
 * derivation one tap away in [details]. The arithmetic stays where it was;
 * this only decides how much of it greets the user first.
 */
@Composable
internal fun TodayHero(
    nutrition: LocalDailyNutrition,
    proteinFirst: Boolean,
    loop: DayLoop,
    modifier: Modifier = Modifier,
    details: @Composable () -> Unit,
) {
    var expanded by rememberSaveable { mutableStateOf(false) }
    val reducedMotion = rememberReducedMotion()
    val chevron by animateFloatAsState(
        targetValue = if (expanded) 180f else 0f,
        animationSpec = tween(if (reducedMotion) 0 else AzfMotion.ConfirmDurationMs),
        label = "heroChevron",
    )
    Column(modifier = modifier.fillMaxWidth()) {
        AzfHeroSurface(onClick = { expanded = !expanded }) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                FuelRing(nutrition = nutrition, proteinFirst = proteinFirst)
                Spacer(Modifier.width(20.dp))
                MacroMiniBars(nutrition = nutrition, modifier = Modifier.weight(1f))
            }
            Spacer(Modifier.height(12.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = stringResource(R.string.home_loop_count, loop.doneCount, loop.steps.size),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.weight(1f),
                )
                Text(
                    text = stringResource(
                        if (expanded) R.string.home_hero_details_hide else R.string.home_hero_details_show,
                    ),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Icon(
                    imageVector = Icons.Outlined.KeyboardArrowDown,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(18.dp).rotate(chevron),
                )
            }
        }
        AnimatedVisibility(
            visible = expanded,
            enter = expandVertically() + fadeIn(),
            exit = shrinkVertically() + fadeOut(),
        ) {
            Column(modifier = Modifier.padding(top = 12.dp)) { details() }
        }
    }
}

/** The one thing worth doing now, in the coach's voice, with its button. */
@Composable
internal fun NextStepCard(
    loop: DayLoop,
    hour: Int,
    workoutFocus: String?,
    waterPending: Boolean,
    onStep: (DayStepKind) -> Unit,
    onReflect: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val next = loop.next
    val closed = loop.closed
    GlowFrame(
        active = next != null,
        shape = AzfShapes.Card,
        modifier = modifier
            .fillMaxWidth()
            .clip(AzfShapes.Card)
            .background(MaterialTheme.colorScheme.surfaceContainerLow),
    ) {
        AnimatedContent(
            targetState = next to closed,
            transitionSpec = {
                (fadeIn(tween(AzfMotion.ScreenEnterMs)) + scaleIn(initialScale = 0.97f)) togetherWith
                    fadeOut(tween(AzfMotion.ScreenExitMs))
            },
            label = "nextStep",
        ) { (step, isClosed) ->
            Column(modifier = Modifier.fillMaxWidth().padding(16.dp)) {
                Text(
                    text = stringResource(R.string.home_next_label),
                    style = MaterialTheme.typography.labelMedium,
                    color = LocalAzfExtended.current.primaryFixedDim,
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    text = nextLine(step, isClosed, hour, workoutFocus),
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                if (step != null) {
                    Spacer(Modifier.height(12.dp))
                    PrimaryButton(
                        text = stringResource(step.actionRes()),
                        onClick = { onStep(step) },
                        loading = step == DayStepKind.Water && waterPending,
                    )
                } else if (isClosed) {
                    Spacer(Modifier.height(12.dp))
                    PrimaryButton(text = stringResource(R.string.home_action_reflect), onClick = onReflect)
                }
            }
        }
    }
}

@Composable
private fun nextLine(step: DayStepKind?, closed: Boolean, hour: Int, workoutFocus: String?): String = when {
    step == DayStepKind.Breakfast -> stringResource(R.string.home_next_breakfast)
    step == DayStepKind.Lunch -> stringResource(R.string.home_next_lunch)
    step == DayStepKind.Dinner -> stringResource(R.string.home_next_dinner)
    step == DayStepKind.Water -> stringResource(R.string.home_next_water)
    step == DayStepKind.WeighIn -> stringResource(R.string.home_next_weigh_in)
    step == DayStepKind.Workout -> workoutFocus?.let { stringResource(R.string.home_next_workout, it) }
        ?: stringResource(R.string.home_next_workout_plain)
    closed -> stringResource(R.string.home_closed)
    hour >= NIGHT_FROM_HOUR || hour < NIGHT_UNTIL_HOUR -> stringResource(R.string.home_night)
    else -> stringResource(R.string.home_quiet)
}

private const val NIGHT_FROM_HOUR = 22
private const val NIGHT_UNTIL_HOUR = 5

@StringRes
private fun DayStepKind.actionRes(): Int = when (this) {
    DayStepKind.Breakfast, DayStepKind.Lunch, DayStepKind.Dinner -> R.string.home_action_snap
    DayStepKind.Water -> R.string.home_action_add_glass
    DayStepKind.Workout -> R.string.home_action_start
    DayStepKind.WeighIn -> R.string.home_action_weigh
}

@StringRes
private fun DayStepKind.titleRes(): Int = when (this) {
    DayStepKind.WeighIn -> R.string.home_step_weigh_in
    DayStepKind.Breakfast -> R.string.home_step_breakfast
    DayStepKind.Lunch -> R.string.home_step_lunch
    DayStepKind.Workout -> R.string.home_step_workout
    DayStepKind.Dinner -> R.string.home_step_dinner
    DayStepKind.Water -> R.string.home_step_water
}

private fun DayStepKind.icon(): ImageVector = when (this) {
    DayStepKind.WeighIn -> Icons.Outlined.MonitorWeight
    DayStepKind.Breakfast -> Icons.Outlined.EggAlt
    DayStepKind.Lunch -> Icons.Outlined.LunchDining
    DayStepKind.Workout -> Icons.Outlined.FitnessCenter
    DayStepKind.Dinner -> Icons.Outlined.DinnerDining
    DayStepKind.Water -> Icons.Outlined.WaterDrop
}

/** Today's timeline. Each row can be done from here, without leaving Home. */
@Composable
internal fun DayLoopList(
    loop: DayLoop,
    waterConsumedMl: Int,
    waterTargetMl: Int,
    onStep: (DayStepKind) -> Unit,
    modifier: Modifier = Modifier,
) {
    val haptics = LocalHapticFeedback.current
    var wasClosed by remember { mutableStateOf(loop.closed) }
    LaunchedEffect(loop.closed) {
        if (loop.closed && !wasClosed) haptics.performHapticFeedback(HapticFeedbackType.Confirm)
        wasClosed = loop.closed
    }
    AzfCard(modifier = modifier.fillMaxWidth(), tier = AzfCardTier.Compact) {
        Text(
            text = stringResource(R.string.home_loop_title),
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.padding(start = 4.dp, top = 4.dp, bottom = 8.dp),
        )
        loop.steps.forEach { step ->
            DayStepRow(
                step = step,
                detail = if (step.kind == DayStepKind.Water) {
                    stringResource(
                        R.string.home_step_water_detail,
                        NutritionFormat.fmt1(waterConsumedMl / ML_PER_LITRE),
                        NutritionFormat.fmt1(waterTargetMl / ML_PER_LITRE),
                    )
                } else {
                    null
                },
                onClick = { onStep(step.kind) },
            )
        }
    }
}

@Composable
private fun DayStepRow(step: DayStep, detail: String?, onClick: () -> Unit) {
    val extended = LocalAzfExtended.current
    val done = step.state == DayStepState.Done
    val isNext = step.state == DayStepState.Next
    val title = stringResource(step.kind.titleRes())
    val doneDescription = stringResource(R.string.home_step_done_cd, title)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 56.dp)
            .clip(AzfShapes.Inner)
            .background(
                if (isNext) extended.primaryFixedDim.copy(alpha = 0.08f) else Color.Transparent,
            )
            .padding(horizontal = 8.dp, vertical = 6.dp)
            .then(
                if (done) {
                    Modifier.semantics(mergeDescendants = true) { contentDescription = doneDescription }
                } else {
                    Modifier
                },
            ),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(38.dp)
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.surfaceContainerHigh),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = step.kind.icon(),
                contentDescription = null,
                tint = if (done) MaterialTheme.colorScheme.onSurfaceVariant else extended.primaryFixedDim,
                modifier = Modifier.size(20.dp),
            )
        }
        Spacer(Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                style = MaterialTheme.typography.bodyMedium,
                color = if (done) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface,
            )
            if (detail != null) {
                Text(
                    text = detail,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        if (done) {
            DoneTick()
        } else {
            StepAction(step = step, onClick = onClick)
        }
    }
}

@Composable
private fun DoneTick() {
    val reducedMotion = rememberReducedMotion()
    var landed by remember { mutableStateOf(reducedMotion) }
    LaunchedEffect(Unit) { landed = true }
    val scale by animateFloatAsState(
        targetValue = if (landed) 1f else 0.6f,
        animationSpec = spring(dampingRatio = 0.45f, stiffness = 500f),
        label = "doneTick",
    )
    Box(
        modifier = Modifier
            .size(28.dp)
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
            }
            .clip(CircleShape)
            .background(LocalAzfExtended.current.secondaryFixedDim),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = Icons.Outlined.Check,
            contentDescription = null,
            tint = AzfColors.OnSecondary,
            modifier = Modifier.size(18.dp),
        )
    }
}

@Composable
private fun StepAction(step: DayStep, onClick: () -> Unit) {
    val extended = LocalAzfExtended.current
    val interaction = remember { MutableInteractionSource() }
    val isNext = step.state == DayStepState.Next
    val label = when (step.kind) {
        DayStepKind.Water -> R.string.home_action_add_glass
        DayStepKind.Workout -> R.string.home_action_start
        DayStepKind.WeighIn -> R.string.home_action_weigh
        else -> R.string.home_action_log
    }
    Box(
        modifier = Modifier
            .heightIn(min = 40.dp)
            .pressScale(interaction)
            .clip(AzfShapes.Pill)
            .background(if (isNext) extended.ctaGradient else SolidColor(extended.primaryFixedDim.copy(alpha = 0.14f)))
            .clickable(interactionSource = interaction, indication = null, role = Role.Button, onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = stringResource(label),
            style = MaterialTheme.typography.labelLarge,
            color = if (isNext) AzfColors.OnPrimary else extended.primaryFixedDim,
        )
    }
}
