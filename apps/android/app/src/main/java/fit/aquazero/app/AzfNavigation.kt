package fit.aquazero.app

import androidx.activity.compose.BackHandler
import androidx.compose.animation.ContentTransform
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.windowInsetsTopHeight
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.navigation3.rememberViewModelStoreNavEntryDecorator
import androidx.navigation3.runtime.NavEntryDecorator
import androidx.navigation3.runtime.entryProvider
import androidx.navigation3.runtime.rememberNavBackStack
import androidx.navigation3.runtime.rememberSaveableStateHolderNavEntryDecorator
import androidx.navigation3.ui.NavDisplay
import dagger.hilt.android.lifecycle.HiltViewModel
import fit.aquazero.app.core.auth.AuthState
import fit.aquazero.app.core.common.Hydration
import fit.aquazero.app.core.common.LocalDates
import fit.aquazero.app.core.data.AccountRepository
import fit.aquazero.app.core.data.AuthRepository
import fit.aquazero.app.core.data.LogsRepository
import fit.aquazero.app.core.designsystem.AzfBottomNav
import fit.aquazero.app.core.designsystem.AzfColors
import fit.aquazero.app.core.designsystem.AzfMotion
import fit.aquazero.app.core.designsystem.AzfShapes
import fit.aquazero.app.core.designsystem.AzfSpacing
import fit.aquazero.app.core.designsystem.AzfTab
import fit.aquazero.app.core.designsystem.Skeleton
import fit.aquazero.app.core.designsystem.ToastController
import fit.aquazero.app.core.designsystem.ToastHost
import fit.aquazero.app.core.designsystem.rememberReducedMotion
import fit.aquazero.app.core.model.ApiResult
import fit.aquazero.app.core.navigation.CoachPromptStore
import fit.aquazero.app.core.navigation.DeepLinkStore
import fit.aquazero.app.core.navigation.PendingDeepLink
import fit.aquazero.app.core.ui.QuickLogAction
import fit.aquazero.app.core.ui.QuickLogSheet
import fit.aquazero.app.feature.challenges.ChallengesScreen
import fit.aquazero.app.feature.coach.CoachScreen
import fit.aquazero.app.feature.coach.CoachSelectScreen
import fit.aquazero.app.feature.dashboard.DashboardScreen
import fit.aquazero.app.feature.fightrecord.FightRecordScreen
import fit.aquazero.app.feature.fightrecord.SeasonCard
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
import fit.aquazero.app.feature.settings.health.HealthConnectScreen
import fit.aquazero.app.feature.training.WorkoutLibraryScreen
import fit.aquazero.app.feature.training.WorkoutSessionScreen
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

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
 * known yet" and is held rather than guessed. Flashing the wrong home for a
 * frame is worse than a moment of spinner.
 */
@HiltViewModel
class ShellViewModel @Inject constructor(
    private val accountRepository: AccountRepository,
    private val logsRepository: LogsRepository,
    val deepLinkStore: DeepLinkStore,
    val coachPromptStore: CoachPromptStore,
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

    /** The dock's one-tap glass of water. Reports whether it landed. */
    fun logWater(onResult: (Boolean) -> Unit) {
        viewModelScope.launch {
            onResult(
                runCatching {
                    logsRepository.logWater(Hydration.WATER_INCREMENT_ML, LocalDates.today())
                }.isSuccess,
            )
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
            is AuthState.Unknown -> AuthGateSkeleton()
            is AuthState.SignedOut -> PreAuthFlow()
            is AuthState.SignedIn -> MainShell(toastController = rootViewModel.toastController)
        }
        ToastHost(controller = rootViewModel.toastController)
    }
}

@Composable
private fun AuthGateSkeleton() {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(AzfSpacing.ContainerMargin)
            .statusBarsPadding(),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Skeleton(modifier = Modifier.fillMaxWidth(0.35f).height(28.dp))
        Skeleton(modifier = Modifier.fillMaxWidth(0.55f).height(36.dp))
        Skeleton(modifier = Modifier.fillMaxWidth().height(48.dp), shape = AzfShapes.Pill)
        Skeleton(modifier = Modifier.fillMaxWidth().height(180.dp), shape = AzfShapes.Card)
        Skeleton(modifier = Modifier.fillMaxWidth().height(120.dp), shape = AzfShapes.Card)
        Skeleton(modifier = Modifier.fillMaxWidth().height(120.dp), shape = AzfShapes.Card)
    }
}

/** Welcome → SignIn. */
@Composable
private fun PreAuthFlow() {
    val backStack = rememberNavBackStack(WelcomeKey)
    NavDisplay(
        backStack = backStack,
        onBack = { backStack.removeLastOrNull() },
        entryDecorators = azfEntryDecorators(),
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
 * The authed shell. One root back stack: the bottom entry is always Home.
 * Full-screen destinations are pushed above the current tab and render
 * WITHOUT the bottom bar, exactly as the web renders them outside `AppLayout`.
 *
 * [tabRootStack] keeps Home under every other tab, so system Back from
 * Workouts, Nutrition, Coach, or Progress returns to Home instead of
 * finishing the activity. A destination pushed above a tab is still above
 * that pair, so Back pops it first. Back from Home itself leaves the app.
 * A restored stack that is only a non-home tab selects Home as well, because
 * Navigation 3 does not handle Back when the current entry has nothing under it.
 */
@Composable
private fun MainShell(
    toastController: ToastController? = null,
    shellViewModel: ShellViewModel = hiltViewModel(),
) {
    val backStack = rememberNavBackStack(DashboardKey)
    val hasProfile by shellViewModel.hasProfile.collectAsStateWithLifecycle()
    val pendingDeepLink by shellViewModel.deepLinkStore.pending.collectAsStateWithLifecycle()
    val currentKey = backStack.lastOrNull()
    val onTab = currentKey is TabKey
    var quickLogOpen by remember { mutableStateOf(false) }
    val reducedMotion = rememberReducedMotion()
    val resources = LocalResources.current
    val selectedTab = when (currentKey) {
        is DashboardKey -> AzfTab.Home
        is NutritionKey -> AzfTab.Nutrition
        is WorkoutLibraryKey -> AzfTab.Workouts
        is ProgressKey -> AzfTab.Progress
        is CoachKey -> AzfTab.Coach
        else -> AzfTab.Home
    }

    fun switchTab(tab: AzfTab) {
        val next = tabRootStack(tab)
        backStack.clear()
        next.forEach { backStack.add(it) }
    }

    /**
     * System Back. [NavDisplay] only invokes this when a previous entry
     * exists, so a lone non-home tab is also caught by [BackHandler] below.
     */
    fun onShellBack() {
        when (shellBack(backStack)) {
            ShellBack.Pop -> backStack.removeLastOrNull()
            ShellBack.SelectHome -> switchTab(AzfTab.Home)
            ShellBack.Leave -> Unit
        }
    }

    /** Switch to the coach tab, optionally queueing a pre-filled prompt. */
    fun openCoach(prompt: String? = null, autoSend: Boolean = false) {
        if (!prompt.isNullOrBlank()) {
            shellViewModel.coachPromptStore.publish(prompt, autoSend)
        }
        switchTab(AzfTab.Coach)
    }

    fun pop() {
        backStack.removeLastOrNull()
    }

    LaunchedEffect(pendingDeepLink) {
        when (val link = pendingDeepLink) {
            is PendingDeepLink.JoinChallenge -> {
                backStack.add(ChallengesKey(joinCode = link.code))
                shellViewModel.deepLinkStore.consume()
            }
            is PendingDeepLink.ShortcutDestination -> {
                when (link.destination) {
                    "nutrition" -> switchTab(AzfTab.Nutrition)
                    "workouts" -> switchTab(AzfTab.Workouts)
                    "log_weight" -> backStack.add(LogWeightKey)
                    "capture" -> backStack.add(CaptureMealKey)
                    "barcode" -> backStack.add(BarcodeKey)
                    "coach" -> openCoach()
                }
                shellViewModel.deepLinkStore.consume()
            }
            null -> Unit
        }
    }

    /** Return to the nutrition day view, dropping whatever sits above it. */
    fun toNutritionDay() {
        switchTab(AzfTab.Nutrition)
    }

    fun onQuickLog(action: QuickLogAction) {
        quickLogOpen = false
        when (action) {
            QuickLogAction.Photo -> backStack.add(CaptureMealKey)
            QuickLogAction.Barcode -> backStack.add(BarcodeKey)
            QuickLogAction.Search -> switchTab(AzfTab.Nutrition)
            QuickLogAction.Weight -> backStack.add(LogWeightKey)
            QuickLogAction.Workout -> switchTab(AzfTab.Workouts)
            QuickLogAction.Water -> shellViewModel.logWater { logged ->
                if (logged) {
                    toastController?.success(resources.getString(R.string.water_logged))
                } else {
                    toastController?.error(resources.getString(R.string.water_log_failed))
                }
            }
        }
    }

    BackHandler(enabled = shellBack(backStack) == ShellBack.SelectHome, onBack = ::onShellBack)

    Box(modifier = Modifier.fillMaxSize()) {
        Scaffold(
            containerColor = androidx.compose.material3.MaterialTheme.colorScheme.background,
            bottomBar = {
                if (onTab) {
                    AzfBottomNav(
                        selected = selectedTab,
                        onSelect = ::switchTab,
                        onQuickLog = { quickLogOpen = true },
                    )
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
                    onBack = ::onShellBack,
                    entryDecorators = azfEntryDecorators(),
                    transitionSpec = { screenForward(reducedMotion) },
                    popTransitionSpec = { screenBack(reducedMotion) },
                    entryProvider = entryProvider {
                        // ----- tab roots -----
                        entry<DashboardKey> {
                            when (hasProfile) {
                                null -> Column(
                                    modifier = Modifier
                                        .fillMaxSize()
                                        .padding(AzfSpacing.ContainerMargin),
                                    verticalArrangement = Arrangement.spacedBy(16.dp),
                                ) {
                                    Skeleton(
                                        modifier = Modifier.fillMaxWidth().height(180.dp),
                                        shape = AzfShapes.Card,
                                    )
                                    Skeleton(
                                        modifier = Modifier.fillMaxWidth().height(120.dp),
                                        shape = AzfShapes.Card,
                                    )
                                }
                                false -> FirstRunScreen(
                                    onSetUpTargets = { backStack.add(SetupKey) },
                                    onBrowseWorkouts = { switchTab(AzfTab.Workouts) },
                                    onAskCoach = { openCoach() },
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
                                    onOpenCoach = { prompt -> openCoach(prompt) },
                                    onLogWeight = { backStack.add(LogWeightKey) },
                                    seasonCard = { modifier ->
                                        SeasonCard(
                                            onOpenFightRecord = { backStack.add(FightRecordKey) },
                                            modifier = modifier,
                                        )
                                    },
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
                                onAskCoach = { openCoach() },
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
                                onOpenPlan = { backStack.add(PlanEntitlementsKey) },
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
                                onAskCoach = { prompt ->
                                    pop()
                                    openCoach(prompt)
                                },
                                toastController = toastController,
                            )
                        }
                        entry<LogWeightKey> {
                            LogWeightScreen(onBack = ::pop, toastController = toastController)
                        }
                        entry<CoachSelectKey> { CoachSelectScreen(onBack = ::pop) }
                        entry<ChallengesKey> { key ->
                            ChallengesScreen(onBack = ::pop, initialJoinCode = key.joinCode)
                        }
                        entry<FightRecordKey> { FightRecordScreen(onBack = ::pop) }
                        entry<SettingsKey> {
                            SettingsScreen(
                                onBack = ::pop,
                                onOpenNotifications = { backStack.add(NotificationSettingsKey) },
                                onOpenHealth = { backStack.add(HealthConnectKey) },
                                onOpenMemory = { backStack.add(MemoryKey) },
                                onOpenPlan = { backStack.add(PlanEntitlementsKey) },
                                onOpenChallenges = { backStack.add(ChallengesKey()) },
                                onEditBiometrics = { backStack.add(SetupKey) },
                            )
                        }
                        entry<HealthConnectKey> { HealthConnectScreen(onBack = ::pop) }
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

        // Edge-to-edge screens scroll under the status bar; without a ground
        // there the clock and icons sat on top of whatever card scrolled up.
        // The camera paints its own dark scrim over the live preview.
        if (currentKey !is CaptureMealKey) {
            Box(
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .fillMaxWidth()
                    .windowInsetsTopHeight(WindowInsets.statusBars)
                    .background(MaterialTheme.colorScheme.surface.copy(alpha = CHROME_GROUND_ALPHA)),
            )
        }

        // Settings is a Play compliance surface. Account deletion, consents and
        // the AGPL source link all live behind it, so it must be reachable from
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
                // The headers scroll away under this button, so it carries its
                // own ground: without it the gear sat on top of whatever card
                // had scrolled up beneath it.
                IconButton(
                    onClick = { backStack.add(SettingsKey) },
                    modifier = Modifier
                        .clip(CircleShape)
                        .background(MaterialTheme.colorScheme.surface.copy(alpha = CHROME_GROUND_ALPHA)),
                ) {
                    Icon(
                        imageVector = Icons.Outlined.Settings,
                        contentDescription = stringResource(R.string.shell_open_settings),
                        tint = AzfColors.OnSurfaceVariant,
                    )
                }
            }
        }

        if (quickLogOpen) {
            QuickLogSheet(
                onAction = ::onQuickLog,
                onAskCoach = {
                    quickLogOpen = false
                    openCoach()
                },
                onDismiss = { quickLogOpen = false },
            )
        }
    }
}

/**
 * Forward screen change: the new screen slides a short way in and settles, so
 * it reads as arriving on top without the whole viewport travelling.
 */
private fun screenForward(reducedMotion: Boolean): ContentTransform {
    if (reducedMotion) return fadeIn(tween(0)) togetherWith fadeOut(tween(0))
    val enter = tween<Float>(AzfMotion.ScreenEnterMs, easing = AzfMotion.RevealEasing)
    return (
        slideInHorizontally(tween(AzfMotion.ScreenEnterMs, easing = AzfMotion.RevealEasing)) {
            it / SCREEN_SHIFT_DIVISOR
        } + fadeIn(enter) + scaleIn(enter, initialScale = SCREEN_ENTER_SCALE)
        ) togetherWith fadeOut(tween(AzfMotion.ScreenExitMs))
}

/** The same move in reverse, for back. */
private fun screenBack(reducedMotion: Boolean): ContentTransform {
    if (reducedMotion) return fadeIn(tween(0)) togetherWith fadeOut(tween(0))
    return fadeIn(tween(AzfMotion.ScreenEnterMs, easing = AzfMotion.RevealEasing)) togetherWith
        (
            slideOutHorizontally(tween(AzfMotion.ScreenExitMs)) { it / SCREEN_SHIFT_DIVISOR } +
                fadeOut(tween(AzfMotion.ScreenExitMs))
            )
}

private const val SCREEN_SHIFT_DIVISOR = 12
private const val SCREEN_ENTER_SCALE = 0.98f
private const val CHROME_GROUND_ALPHA = 0.9f

/**
 * Entry decorators for every [NavDisplay] in the app.
 *
 * The ViewModel one is why this exists. Navigation 3 ships no ViewModelStore
 * decorator by default, so without it every `hiltViewModel()` resolved
 * `LocalViewModelStoreOwner` to the Activity: screen ViewModels were never
 * `onCleared()` when an entry was popped, survived `backStack.clear()` on a
 * tab switch, and two entries of one type shared a single instance. The
 * dependency was already declared and simply never wired up.
 *
 * The saveable-state decorator is NavDisplay's own default, restored by hand:
 * passing `entryDecorators` REPLACES the default list rather than adding to
 * it, so omitting it would quietly drop per-entry saveable state.
 *
 * NavDisplay's scene decorators are deliberately absent. Their factories
 * (`rememberSceneSetupNavEntryDecorator`, and the shared-element one, which
 * also needs a `SharedTransitionScope` NavDisplay owns) are `internal` to the
 * library, so no caller can supply them, which means NavDisplay applies them
 * itself around whatever this list contains. Do not try to add them.
 */
@Composable
private fun <T : Any> azfEntryDecorators(): List<NavEntryDecorator<T>> = listOf(
    rememberSaveableStateHolderNavEntryDecorator(),
    rememberViewModelStoreNavEntryDecorator(),
)
