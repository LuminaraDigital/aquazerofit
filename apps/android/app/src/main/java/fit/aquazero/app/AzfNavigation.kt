package fit.aquazero.app

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.navigation3.runtime.NavKey
import androidx.navigation3.runtime.entryProvider
import androidx.navigation3.runtime.rememberNavBackStack
import androidx.navigation3.ui.NavDisplay
import dagger.hilt.android.lifecycle.HiltViewModel
import fit.aquazero.app.core.auth.AuthState
import fit.aquazero.app.core.data.AuthRepository
import fit.aquazero.app.core.designsystem.AzfBottomNav
import fit.aquazero.app.core.designsystem.AzfTab
import fit.aquazero.app.core.designsystem.ToastController
import fit.aquazero.app.core.designsystem.ToastHost
import fit.aquazero.app.feature.challenges.ChallengesScreen
import fit.aquazero.app.feature.coach.CoachScreen
import fit.aquazero.app.feature.coach.CoachSelectScreen
import fit.aquazero.app.feature.dashboard.DashboardScreen
import fit.aquazero.app.feature.nutrition.AnalysisResultsScreen
import fit.aquazero.app.feature.nutrition.CaptureMealScreen
import fit.aquazero.app.feature.nutrition.MealPlanScreen
import fit.aquazero.app.feature.nutrition.NutritionScreen
import fit.aquazero.app.feature.nutrition.RecipeDetailScreen
import fit.aquazero.app.feature.onboarding.FirstRunScreen
import fit.aquazero.app.feature.onboarding.SetupScreen
import fit.aquazero.app.feature.onboarding.SignInScreen
import fit.aquazero.app.feature.onboarding.WelcomeScreen
import fit.aquazero.app.feature.progress.LogWeightScreen
import fit.aquazero.app.feature.progress.ProgressScreen
import fit.aquazero.app.feature.settings.MemoryScreen
import fit.aquazero.app.feature.settings.NotificationSettingsScreen
import fit.aquazero.app.feature.settings.PlanEntitlementsScreen
import fit.aquazero.app.feature.settings.SettingsScreen
import fit.aquazero.app.feature.training.WorkoutLibraryScreen
import fit.aquazero.app.feature.training.WorkoutSessionScreen
import javax.inject.Inject
import kotlinx.coroutines.launch

/** Root-level session holder: restores the session once at process start. */
@HiltViewModel
class RootViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    val toastController: ToastController,
) : ViewModel() {

    /** Session state driving the root graph choice. */
    val authState = authRepository.authState

    init {
        viewModelScope.launch { authRepository.restore() }
    }
}

/**
 * Auth-gated Navigation 3 root: Unknown holds the splash surface,
 * SignedOut shows the pre-auth flow, SignedIn shows the 5-tab shell with
 * full-screen destinations pushed above the scaffold.
 */
@Composable
fun AzfNavigation(rootViewModel: RootViewModel = hiltViewModel()) {
    val authState by rootViewModel.authState.collectAsStateWithLifecycle()
    Box(modifier = Modifier.fillMaxSize()) {
        when (authState) {
            is AuthState.Unknown -> Box(modifier = Modifier.fillMaxSize())
            is AuthState.SignedOut -> PreAuthFlow()
            is AuthState.SignedIn -> MainShell()
        }
        ToastHost(controller = rootViewModel.toastController)
    }
}

/** Welcome → SignIn. */
@Composable
private fun PreAuthFlow() {
    val backStack = rememberNavBackStack(WelcomeKey)
    NavDisplay(
        backStack = backStack,
        onBack = { backStack.removeLastOrNull() },
        entryProvider = entryProvider {
            entry<WelcomeKey> {
                WelcomeScreen(
                    onGetStarted = { backStack.add(SignInKey(register = true)) },
                    onSignIn = { backStack.add(SignInKey(register = false)) },
                )
            }
            entry<SignInKey> { key ->
                SignInScreen(
                    startInRegisterMode = key.register,
                    onBack = { backStack.removeLastOrNull() },
                )
            }
        },
    )
}

/**
 * The authed shell. One root back stack: the bottom entry is always a
 * [TabKey]; full-screen destinations are pushed above it and render WITHOUT
 * the bottom bar, exactly as the web renders them outside `AppLayout`.
 */
@Composable
private fun MainShell() {
    val backStack = rememberNavBackStack(DashboardKey)
    val currentKey = backStack.lastOrNull()
    val onTab = currentKey is TabKey
    val selectedTab = when (currentKey) {
        is DashboardKey -> AzfTab.Home
        is NutritionKey -> AzfTab.Nutrition
        is WorkoutLibraryKey -> AzfTab.Workouts
        is ProgressKey -> AzfTab.Progress
        is CoachKey -> AzfTab.Coach
        else -> AzfTab.Home
    }

    fun switchTab(tab: AzfTab) {
        val key: NavKey = when (tab) {
            AzfTab.Home -> DashboardKey
            AzfTab.Nutrition -> NutritionKey
            AzfTab.Workouts -> WorkoutLibraryKey
            AzfTab.Progress -> ProgressKey
            AzfTab.Coach -> CoachKey
        }
        backStack.clear()
        backStack.add(key)
    }

    fun pop() {
        backStack.removeLastOrNull()
    }

    Scaffold(
        containerColor = androidx.compose.material3.MaterialTheme.colorScheme.background,
        bottomBar = {
            if (onTab) {
                AzfBottomNav(selected = selectedTab, onSelect = ::switchTab)
            }
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(bottom = if (onTab) padding.calculateBottomPadding() else 0.dp),
        ) {
            NavDisplay(
                backStack = backStack,
                onBack = { backStack.removeLastOrNull() },
                entryProvider = entryProvider {
                    // ----- tab roots -----
                    entry<DashboardKey> { DashboardScreen() }
                    entry<NutritionKey> { NutritionScreen() }
                    entry<WorkoutLibraryKey> { WorkoutLibraryScreen() }
                    entry<ProgressKey> { ProgressScreen() }
                    entry<CoachKey> { CoachScreen() }

                    // ----- onboarding interstitials -----
                    entry<FirstRunKey> { FirstRunScreen() }
                    entry<SetupKey> { SetupScreen(onBack = ::pop) }

                    // ----- full-screen destinations above the tabs -----
                    entry<CaptureMealKey> { CaptureMealScreen(onBack = ::pop) }
                    entry<AnalysisResultsKey> { key ->
                        AnalysisResultsScreen(jobId = key.jobId, onBack = ::pop)
                    }
                    entry<MealPlanKey> { MealPlanScreen(onBack = ::pop) }
                    entry<RecipeDetailKey> { key ->
                        RecipeDetailScreen(recipeId = key.recipeId, onBack = ::pop)
                    }
                    entry<WorkoutSessionKey> { key ->
                        WorkoutSessionScreen(sessionId = key.sessionId, onBack = ::pop)
                    }
                    entry<LogWeightKey> { LogWeightScreen(onBack = ::pop) }
                    entry<CoachSelectKey> { CoachSelectScreen(onBack = ::pop) }
                    entry<ChallengesKey> { ChallengesScreen(onBack = ::pop) }
                    entry<SettingsKey> { SettingsScreen(onBack = ::pop) }
                    entry<NotificationSettingsKey> { NotificationSettingsScreen(onBack = ::pop) }
                    entry<MemoryKey> { MemoryScreen(onBack = ::pop) }
                    entry<PlanEntitlementsKey> { PlanEntitlementsScreen(onBack = ::pop) }
                },
            )
        }
    }
}
