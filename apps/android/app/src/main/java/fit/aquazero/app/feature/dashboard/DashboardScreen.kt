package fit.aquazero.app.feature.dashboard

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import fit.aquazero.app.R
import fit.aquazero.app.core.common.LocalDailyNutrition
import fit.aquazero.app.core.designsystem.AquaAura
import fit.aquazero.app.core.designsystem.AzfSpacing
import fit.aquazero.app.core.designsystem.AzfTheme
import fit.aquazero.app.core.designsystem.ErrorState
import fit.aquazero.app.core.designsystem.ReadinessChip
import fit.aquazero.app.core.designsystem.revealOnEnter
import fit.aquazero.app.core.gamification.CelebrationHost
import fit.aquazero.app.core.ui.CardSkeleton
import fit.aquazero.app.core.ui.CoachRoster
import fit.aquazero.app.core.ui.HydrationCard
import fit.aquazero.app.core.ui.TargetExplainSheet
import fit.aquazero.app.core.ui.rememberToastSink

/**
 * Home: the day as a loop. The first screen answers three questions in order
 * (how is today going, what is next, what is left), each answerable with one
 * thumb; the deeper cards sit below for anyone who wants to scroll on. Logging
 * starts from the loop itself or from the dock's quick-log button.
 *
 * [seasonCard] is a slot the app shell fills with Fight Record's card, so
 * this feature reserves a place after the coach card and imports nothing
 * from that one. It receives the dashboard's spacing as a modifier, so a card
 * that renders nothing leaves no gap behind.
 */
@Composable
fun DashboardScreen(
    modifier: Modifier = Modifier,
    onCaptureMeal: () -> Unit = {},
    onOpenWorkout: (String?) -> Unit = {},
    onOpenProgress: () -> Unit = {},
    onOpenCoach: (String?) -> Unit = {},
    onLogWeight: () -> Unit = {},
    seasonCard: @Composable (Modifier) -> Unit = {},
    viewModel: DashboardViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val resources = LocalResources.current
    val toasts = rememberToastSink()
    var showTargetExplain by remember { mutableStateOf(false) }

    // The day can roll over while this screen sits in the back stack. The
    // ViewModel no longer caches "today", but nothing re-reads the clock on
    // its own, so a returning user would keep seeing yesterday until their
    // next interaction. Cheap: a no-op when the date has not changed.
    LifecycleResumeEffect(viewModel) {
        viewModel.onResumed()
        onPauseOrDispose { }
    }

    LaunchedEffect(viewModel) {
        viewModel.events.collect { event ->
            when (event) {
                is DashboardEvent.Message -> toasts.show(
                    resources.getString(event.messageRes),
                    event.kind,
                )
            }
        }
    }

    Box(modifier = modifier.fillMaxSize()) {
        DashboardContent(
            state = state,
            onRetry = viewModel::refresh,
            onLogWater = { viewModel.logWater() },
            onSuggestMeal = viewModel::suggestMeal,
            onLogSuggestion = viewModel::logSuggestion,
            onCaptureMeal = onCaptureMeal,
            onOpenWorkout = onOpenWorkout,
            onOpenProgress = onOpenProgress,
            onOpenCoach = onOpenCoach,
            onLogWeight = onLogWeight,
            onExplainTarget = if (state.targets != null) {
                { showTargetExplain = true }
            } else {
                null
            },
            modifier = Modifier.fillMaxSize(),
            seasonCard = seasonCard,
        )
        CelebrationHost()
    }

    TargetExplainSheet(
        targets = state.targets,
        visible = showTargetExplain,
        onDismiss = { showTargetExplain = false },
    )
}

/** Stateless dashboard body — everything previewable lives here. */
@Composable
fun DashboardContent(
    state: DashboardUiState,
    onRetry: () -> Unit,
    onLogWater: () -> Unit,
    onSuggestMeal: () -> Unit,
    onLogSuggestion: () -> Unit,
    onCaptureMeal: () -> Unit,
    onOpenWorkout: (String?) -> Unit,
    onOpenProgress: () -> Unit,
    onOpenCoach: (String?) -> Unit = {},
    onLogWeight: () -> Unit = {},
    onExplainTarget: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
    seasonCard: @Composable (Modifier) -> Unit = {},
) {
    val reflectPrompt = stringResource(R.string.home_ask_coach_day)
    Box(modifier = modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        AquaAura()
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .statusBarsPadding()
                .padding(
                    PaddingValues(
                        start = AzfSpacing.ContainerMargin,
                        end = AzfSpacing.ContainerMargin,
                        top = AzfSpacing.ElementGapSmall,
                        bottom = AzfSpacing.Gutter,
                    ),
                ),
        ) {
            HomeGreeting(
                firstName = state.firstName,
                hour = state.hour,
                localDate = state.today,
                persona = state.coachAmbient?.persona ?: defaultCoach,
                modifier = Modifier.revealOnEnter(0),
            )

            Spacer(Modifier.height(AzfSpacing.Gutter))

            WeekStrip(
                localDate = state.today,
                loggedDays = state.loggedThisWeek,
                activeDays = state.consistency?.activeDays,
                windowDays = state.consistency?.windowDays ?: DEFAULT_CONSISTENCY_WINDOW,
                onOpenProgress = onOpenProgress,
                modifier = Modifier.revealOnEnter(1),
            )

            Spacer(Modifier.height(AzfSpacing.Gutter))

            when {
                state.phase == DashboardPhase.Error && !state.hasContent -> {
                    ErrorState(
                        title = stringResource(R.string.dashboard_error_title),
                        message = stringResource(R.string.dashboard_error_message),
                        retryLabel = stringResource(R.string.action_retry),
                        onRetry = onRetry,
                    )
                }

                state.nutrition == null -> {
                    CardSkeleton(height = 220.dp, modifier = Modifier.revealOnEnter(2))
                    Spacer(Modifier.height(AzfSpacing.Gutter))
                    CardSkeleton(height = 120.dp, modifier = Modifier.revealOnEnter(3))
                }

                else -> {
                    val loop = state.dayLoop
                    val onStep: (DayStepKind) -> Unit = { kind ->
                        when (kind) {
                            DayStepKind.Breakfast, DayStepKind.Lunch, DayStepKind.Dinner -> onCaptureMeal()
                            DayStepKind.Water -> onLogWater()
                            DayStepKind.Workout -> onOpenWorkout(state.workout?.sessionId)
                            DayStepKind.WeighIn -> onLogWeight()
                        }
                    }
                    TodayHero(
                        nutrition = state.nutrition,
                        proteinFirst = state.proteinFirst,
                        loop = loop,
                        modifier = Modifier.revealOnEnter(2),
                    ) {
                        if (state.proteinFirst) {
                            CalorieHeroCard(
                                nutrition = state.nutrition,
                                kcalBurned = state.effectiveKcalBurned,
                                proteinFirst = true,
                                onExplainTarget = onExplainTarget,
                                showDerivationRow = true,
                            )
                        } else {
                            DailyEnergyLoopCard(
                                nutrition = state.nutrition,
                                kcalBurned = state.effectiveKcalBurned,
                                targets = state.targets,
                                onExplainTarget = onExplainTarget,
                            )
                        }
                        Spacer(Modifier.height(AzfSpacing.Gutter))
                        HydrationCard(
                            consumedMl = state.waterConsumedMl,
                            targetMl = state.nutrition.waterTargetMl,
                            pending = state.waterPending,
                            onLogWater = onLogWater,
                        )
                    }
                    Spacer(Modifier.height(AzfSpacing.Gutter))
                    NextStepCard(
                        loop = loop,
                        hour = state.hour,
                        workoutFocus = state.workout?.focus?.takeIf(String::isNotBlank),
                        waterPending = state.waterPending,
                        onStep = onStep,
                        onReflect = { onOpenCoach(reflectPrompt) },
                        modifier = Modifier.revealOnEnter(3),
                    )
                    Spacer(Modifier.height(AzfSpacing.Gutter))
                    DayLoopList(
                        loop = loop,
                        waterConsumedMl = state.waterConsumedMl,
                        waterTargetMl = state.nutrition.waterTargetMl,
                        onStep = onStep,
                        modifier = Modifier.revealOnEnter(4),
                    )
                }
            }

            ReadinessChip(
                readiness = state.readiness,
                loading = state.readinessLoading,
                modifier = Modifier
                    .padding(top = AzfSpacing.Gutter)
                    .revealOnEnter(5),
            )

            if (state.hasContent || state.coachAmbientLoading) {
                Spacer(Modifier.height(AzfSpacing.Gutter))
                DashboardCoachCard(
                    ambient = state.coachAmbient,
                    loading = state.coachAmbientLoading,
                    onOpenCoach = onOpenCoach,
                    modifier = Modifier.revealOnEnter(5),
                )
            }

            seasonCard(
                Modifier
                    .padding(top = AzfSpacing.Gutter)
                    .revealOnEnter(5),
            )

            Spacer(Modifier.height(AzfSpacing.Gutter))

            TodayWorkoutCard(
                workout = state.workout,
                loading = state.workoutLoading,
                onOpenWorkout = onOpenWorkout,
                modifier = Modifier.revealOnEnter(6),
            )

            Spacer(Modifier.height(AzfSpacing.Gutter))

            SuggestMealCard(
                suggestion = state.suggestion,
                phase = state.suggestionPhase,
                onSuggest = onSuggestMeal,
                onLog = onLogSuggestion,
                modifier = Modifier.revealOnEnter(6),
            )

            Spacer(Modifier.height(AzfSpacing.Gutter))

            WeightTrendCard(
                series = state.weightSeries,
                currentWeightKg = state.currentWeightKg,
                onViewAll = onOpenProgress,
                modifier = Modifier.revealOnEnter(6),
            )

            Spacer(Modifier.height(AzfSpacing.SectionGap))

            AchievementsStrip(
                achievements = state.achievements,
                loading = state.achievementsLoading,
                modifier = Modifier.revealOnEnter(6),
            )
        }
    }
}

private const val DEFAULT_CONSISTENCY_WINDOW = 28
private val defaultCoach = CoachRoster.personas.first { it.id == CoachRoster.DEFAULT_ID }

@Preview(showBackground = true, backgroundColor = 0xFF0E1416, heightDp = 1400)
@Composable
private fun DashboardContentPreview() {
    AzfTheme {
        DashboardContent(
            state = DashboardUiState(
                today = "2026-08-27",
                phase = DashboardPhase.Ready,
                firstName = "Ada",
                nutrition = LocalDailyNutrition(
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
                ),
                weightSeries = listOf(82.4, 82.1, 82.2, 81.8, 81.9, 81.5, 81.2),
                currentWeightKg = 81.2,
                achievements = listOf(
                    AchievementUi("a1", "First weigh-in", true),
                    AchievementUi("a2", "Seven active days", false),
                ),
                achievementsLoading = false,
                workoutLoading = false,
                workout = TodayWorkoutUi(
                    sessionId = "s1",
                    focus = "Upper body push",
                    exerciseCount = 6,
                    durationMinutes = 42,
                    kcalBurned = 310.0,
                    completed = false,
                    rest = false,
                ),
            ),
            onRetry = {},
            onLogWater = {},
            onSuggestMeal = {},
            onLogSuggestion = {},
            onCaptureMeal = {},
            onOpenWorkout = {},
            onOpenProgress = {},
        )
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416, heightDp = 900)
@Composable
private fun DashboardSkeletonPreview() {
    AzfTheme {
        DashboardContent(
            state = DashboardUiState(today = "2026-08-27"),
            onRetry = {},
            onLogWater = {},
            onSuggestMeal = {},
            onLogSuggestion = {},
            onCaptureMeal = {},
            onOpenWorkout = {},
            onOpenProgress = {},
        )
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416, heightDp = 900)
@Composable
private fun DashboardErrorPreview() {
    AzfTheme {
        DashboardContent(
            state = DashboardUiState(today = "2026-08-27", phase = DashboardPhase.Error),
            onRetry = {},
            onLogWater = {},
            onSuggestMeal = {},
            onLogSuggestion = {},
            onCaptureMeal = {},
            onOpenWorkout = {},
            onOpenProgress = {},
        )
    }
}
