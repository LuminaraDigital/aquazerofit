package fit.aquazero.app.feature.dashboard

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.PhotoCamera
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
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
import fit.aquazero.app.core.designsystem.AzfAppHeader
import fit.aquazero.app.core.designsystem.AzfSpacing
import fit.aquazero.app.core.designsystem.AzfTheme
import fit.aquazero.app.core.designsystem.ErrorState
import fit.aquazero.app.core.designsystem.LocalAzfExtended
import fit.aquazero.app.core.designsystem.revealOnEnter

/**
 * Home. A port of `apps/web/src/pages/dashboard/Dashboard.tsx`, with the
 * mobile-specific choices called out in the sub-composables:
 * one-tap optimistic hydration, the Akin mascot in the greeting, and a
 * camera FAB that opens photo meal logging.
 */
@Composable
fun DashboardScreen(
    modifier: Modifier = Modifier,
    onCaptureMeal: () -> Unit = {},
    onOpenWorkout: (String?) -> Unit = {},
    onOpenProgress: () -> Unit = {},
    viewModel: DashboardViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val resources = LocalResources.current
    val toasts = rememberToastSink()

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

    DashboardContent(
        state = state,
        onRetry = viewModel::refresh,
        onLogWater = { viewModel.logWater() },
        onSuggestMeal = viewModel::suggestMeal,
        onLogSuggestion = viewModel::logSuggestion,
        onCaptureMeal = onCaptureMeal,
        onOpenWorkout = onOpenWorkout,
        onOpenProgress = onOpenProgress,
        modifier = modifier,
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
    modifier: Modifier = Modifier,
) {
    Scaffold(
        modifier = modifier.fillMaxSize(),
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            AzfAppHeader(title = stringResource(R.string.screen_dashboard).uppercase())
        },
        floatingActionButton = {
            FloatingActionButton(
                onClick = onCaptureMeal,
                containerColor = LocalAzfExtended.current.primaryFixedDim,
                contentColor = MaterialTheme.colorScheme.onPrimary,
                modifier = Modifier.size(56.dp),
            ) {
                Icon(
                    imageVector = Icons.Outlined.PhotoCamera,
                    contentDescription = stringResource(R.string.fab_capture_meal),
                )
            }
        },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .padding(innerPadding)
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(
                    PaddingValues(
                        start = AzfSpacing.ContainerMargin,
                        end = AzfSpacing.ContainerMargin,
                        top = AzfSpacing.ElementGapMedium,
                        bottom = AzfSpacing.SectionGap,
                    ),
                ),
        ) {
            GreetingHeader(
                localDate = state.today,
                firstName = state.firstName,
                loading = state.phase == DashboardPhase.Loading,
                modifier = Modifier.revealOnEnter(0),
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
                    CardSkeleton(height = 320.dp, modifier = Modifier.revealOnEnter(1))
                    Spacer(Modifier.height(AzfSpacing.Gutter))
                    CardSkeleton(height = 180.dp, modifier = Modifier.revealOnEnter(2))
                }

                else -> {
                    CalorieHeroCard(
                        nutrition = state.nutrition,
                        modifier = Modifier.revealOnEnter(1),
                    )
                    Spacer(Modifier.height(AzfSpacing.Gutter))
                    HydrationCard(
                        consumedMl = state.waterConsumedMl,
                        targetMl = state.nutrition.waterTargetMl,
                        pending = state.waterPending,
                        onLogWater = onLogWater,
                        modifier = Modifier.revealOnEnter(2),
                    )
                }
            }

            Spacer(Modifier.height(AzfSpacing.Gutter))

            TodayWorkoutCard(
                workout = state.workout,
                loading = state.workoutLoading,
                onOpenWorkout = onOpenWorkout,
                modifier = Modifier.revealOnEnter(3),
            )

            Spacer(Modifier.height(AzfSpacing.Gutter))

            SuggestMealCard(
                suggestion = state.suggestion,
                phase = state.suggestionPhase,
                onSuggest = onSuggestMeal,
                onLog = onLogSuggestion,
                modifier = Modifier.revealOnEnter(4),
            )

            Spacer(Modifier.height(AzfSpacing.Gutter))

            WeightTrendCard(
                series = state.weightSeries,
                currentWeightKg = state.currentWeightKg,
                onViewAll = onOpenProgress,
                modifier = Modifier.revealOnEnter(5),
            )

            Spacer(Modifier.height(AzfSpacing.SectionGap))

            AchievementsStrip(
                achievements = state.achievements,
                loading = state.achievementsLoading,
                modifier = Modifier.revealOnEnter(6),
            )

            // Clears the FAB and the bottom bar.
            Spacer(Modifier.height(96.dp))
        }
    }
}

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
