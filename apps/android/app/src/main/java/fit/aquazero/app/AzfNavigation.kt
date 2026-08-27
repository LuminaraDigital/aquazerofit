package fit.aquazero.app

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
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
import fit.aquazero.app.core.data.AccountRepository
import fit.aquazero.app.core.data.AuthRepository
import fit.aquazero.app.core.designsystem.AzfBottomNav
import fit.aquazero.app.core.designsystem.AzfColors
import fit.aquazero.app.core.designsystem.AzfTab
import fit.aquazero.app.core.designsystem.ToastController
import fit.aquazero.app.core.designsystem.ToastHost
import fit.aquazero.app.core.model.ApiResult
import fit.aquazero.app.feature.challenges.ChallengesScreen
import fit.aquazero.app.feature.coach.CoachScreen
import fit.aquazero.app.feature.coach.CoachSelectScreen
import fit.aquazero.app.feature.dashboard.DashboardScreen
import fit.aquazero.app.feature.nutrition.AnalysisResultsScreen
import fit.aquazero.app.feature.nutrition.CaptureMealScreen
import fit.aquazero.app.feature.nutrition.MealPlanScreen
import fit.aquazero.app.feature.nutrition.NutritionScreen
import fit.aquazero.app.feature.nutrition.RecipeDetailScreen
import fit.aquazero.app.feature.nutrition.barcode.BarcodeScannerSheet
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
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
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
 * Does this account have a wellness profile yet?
 *
 * The answer decides what the Home tab is. With no profile there is no
 * defensible daily target, so Home is the first-run surface that says so,
 * rather than a dashboard of rings with nothing behind them. Null means "not
 * known yet" and is held rather than guessed — flashing the wrong home for a
 * frame is worse than a moment of spinner.
 */
@HiltViewModel
class ShellViewModel @Inject constructor(
    private val accountRepository: AccountRepository,
) : ViewModel() {

    private val _hasProfile = MutableStateFlow<Boolean?>(null)
    val hasProfile: StateFlow<Boolean?> = _hasProfile.asStateFlow()

    init {
        viewModelScope.launch {
            accountRepository.profile().collect { profile ->
                if (profile != null) _hasProfile.value = true
            }
        }
        viewModelScope.launch {
            // The server is the authority: a profile deleted elsewhere must not
            // leave a stale Room row claiming Home is a dashboard.
            val result = accountRepository.refreshProfile()
            if (result is ApiResult.Success) {
                _hasProfile.value = result.data != null
            } else if (_hasProfile.value == null) {
                // Offline with nothing cached: the honest answer is "not set up".
                _hasProfile.value = false
            }
        }
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
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        when (authState) {
            is AuthState.Unknown -> CircularProgressIndicator(color = AzfColors.PrimaryFixedDim)
            is AuthState.SignedOut -> PreAuthFlow()
            is AuthState.SignedIn -> MainShell(toastController = rootViewModel.toastController)
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
private fun MainShell(
    toastController: ToastController? = null,
    shellViewModel: ShellViewModel = hiltViewModel(),
) {
    val backStack = rememberNavBackStack(DashboardKey)
    val hasProfile by shellViewModel.hasProfile.collectAsStateWithLifecycle()
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

    /** Return to the nutrition day view, dropping whatever sits above it. */
    fun toNutritionDay() {
        switchTab(AzfTab.Nutrition)
    }

    Box(modifier = Modifier.fillMaxSize()) {
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
                    entry<DashboardKey> {
                        when (hasProfile) {
                            null -> Box(
                                modifier = Modifier.fillMaxSize(),
                                contentAlignment = Alignment.Center,
                            ) {
                                CircularProgressIndicator(color = AzfColors.PrimaryFixedDim)
                            }
                            false -> FirstRunScreen(
                                onSetUpTargets = { backStack.add(SetupKey) },
                                onBrowseWorkouts = { switchTab(AzfTab.Workouts) },
                                onAskCoach = { switchTab(AzfTab.Coach) },
                                onLogWeight = { backStack.add(LogWeightKey) },
                            )
                            true -> DashboardScreen(
                                onCaptureMeal = { backStack.add(CaptureMealKey) },
                                onOpenWorkout = { sessionId ->
                                    if (sessionId != null) {
                                        backStack.add(WorkoutSessionKey(sessionId))
                                    } else {
                                        switchTab(AzfTab.Workouts)
                                    }
                                },
                                onOpenProgress = { switchTab(AzfTab.Progress) },
                            )
                        }
                    }
                    entry<NutritionKey> {
                        NutritionScreen(
                            onNavigateToCapture = { backStack.add(CaptureMealKey) },
                            onNavigateToMealPlan = { backStack.add(MealPlanKey) },
                            onNavigateToBarcode = { backStack.add(BarcodeKey) },
                        )
                    }
                    entry<WorkoutLibraryKey> {
                        WorkoutLibraryScreen(
                            onStartSession = { sessionId ->
                                backStack.add(WorkoutSessionKey(sessionId))
                            },
                            toastController = toastController,
                        )
                    }
                    entry<ProgressKey> {
                        ProgressScreen(
                            onLogWeight = { backStack.add(LogWeightKey) },
                            toastController = toastController,
                        )
                    }
                    entry<CoachKey> {
                        CoachScreen(
                            onOpenCoachSelect = { backStack.add(CoachSelectKey) },
                            onOpenManualLogging = ::toNutritionDay,
                        )
                    }

                    // ----- onboarding interstitials -----
                    entry<FirstRunKey> {
                        FirstRunScreen(
                            onSetUpTargets = { backStack.add(SetupKey) },
                            onBrowseWorkouts = { switchTab(AzfTab.Workouts) },
                            onAskCoach = { switchTab(AzfTab.Coach) },
                            onLogWeight = { backStack.add(LogWeightKey) },
                        )
                    }
                    entry<SetupKey> { SetupScreen(onBack = ::pop) }

                    // ----- full-screen destinations above the tabs -----
                    entry<CaptureMealKey> {
                        CaptureMealScreen(
                            onBack = ::pop,
                            onNavigateToAnalysis = { jobId ->
                                backStack.removeLastOrNull() // remove capture
                                backStack.add(AnalysisResultsKey(jobId))
                            },
                        )
                    }
                    entry<AnalysisResultsKey> { key ->
                        AnalysisResultsScreen(
                            jobId = key.jobId,
                            onBack = ::pop,
                            // A confirmed photo log lands on the day view, where
                            // the entry it just created is visible.
                            onLogged = { toNutritionDay() },
                            onLogManually = ::toNutritionDay,
                            onRetakePhoto = {
                                backStack.removeLastOrNull()
                                backStack.add(CaptureMealKey)
                            },
                        )
                    }
                    entry<BarcodeKey> {
                        BarcodeScannerSheet(
                            onDismiss = ::pop,
                            onLogged = { toNutritionDay() },
                        )
                    }
                    entry<MealPlanKey> {
                        MealPlanScreen(
                            onBack = ::pop,
                            onOpenRecipe = { recipeId ->
                                backStack.add(RecipeDetailKey(recipeId))
                            },
                        )
                    }
                    entry<RecipeDetailKey> { key ->
                        RecipeDetailScreen(
                            recipeId = key.recipeId,
                            onBack = ::pop,
                            onLogged = ::toNutritionDay,
                        )
                    }
                    entry<WorkoutSessionKey> { key ->
                        WorkoutSessionScreen(
                            sessionId = key.sessionId,
                            onBack = ::pop,
                            toastController = toastController,
                        )
                    }
                    entry<LogWeightKey> {
                        LogWeightScreen(onBack = ::pop, toastController = toastController)
                    }
                    entry<CoachSelectKey> { CoachSelectScreen(onBack = ::pop) }
                    entry<ChallengesKey> { ChallengesScreen(onBack = ::pop) }
                    entry<SettingsKey> {
                        SettingsScreen(
                            onBack = ::pop,
                            onOpenNotifications = { backStack.add(NotificationSettingsKey) },
                            onOpenMemory = { backStack.add(MemoryKey) },
                            onOpenPlan = { backStack.add(PlanEntitlementsKey) },
                            onOpenChallenges = { backStack.add(ChallengesKey) },
                            onEditBiometrics = { backStack.add(SetupKey) },
                        )
                    }
                    entry<NotificationSettingsKey> { NotificationSettingsScreen(onBack = ::pop) }
                    entry<MemoryKey> {
                        MemoryScreen(
                            onBack = ::pop,
                            // The consent that pauses memory lives in Settings,
                            // so "review consent settings" goes there rather
                            // than dropping the user back where they started.
                            onReviewConsents = {
                                backStack.removeLastOrNull()
                                if (backStack.lastOrNull() !is SettingsKey) {
                                    backStack.add(SettingsKey)
                                }
                            },
                        )
                    }
                    entry<PlanEntitlementsKey> { PlanEntitlementsScreen(onBack = ::pop) }
                },
            )
        }
    }

    // Settings is a Play compliance surface — account deletion, consents and
    // the AGPL source link all live behind it — so it must be reachable from
    // anywhere in the app, not only from one tab. The action sits in the
    // header's trailing position on the tab roots, drawn by the shell so no
    // individual tab screen has to own it. Coach is the exception: it already
    // puts its own control there, and two overlapping icons is worse than one
    // tab that reaches Settings via any of the other four.
    if (onTab && currentKey !is CoachKey) {
        Box(
            modifier = Modifier
                .align(Alignment.TopEnd)
                .statusBarsPadding()
                .padding(horizontal = 8.dp, vertical = 8.dp),
        ) {
            IconButton(onClick = { backStack.add(SettingsKey) }) {
                Icon(
                    imageVector = Icons.Outlined.Settings,
                    contentDescription = stringResource(R.string.shell_open_settings),
                    tint = AzfColors.OnSurfaceVariant,
                )
            }
        }
    }
    }
}
