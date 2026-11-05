package fit.aquazero.app.feature.training

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.content.pm.PackageManager
import android.content.res.Resources
import android.os.Build
import android.view.WindowManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Remove
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import fit.aquazero.app.R
import fit.aquazero.app.core.designsystem.AzfAppHeader
import fit.aquazero.app.core.designsystem.AzfCard
import fit.aquazero.app.core.designsystem.AzfCardTier
import fit.aquazero.app.core.designsystem.AzfHeroSurface
import fit.aquazero.app.core.designsystem.AzfMotion
import fit.aquazero.app.core.designsystem.AzfSectionHeading
import fit.aquazero.app.core.designsystem.AzfShapes
import fit.aquazero.app.core.designsystem.AzfSpacing
import fit.aquazero.app.core.designsystem.AzfTheme
import fit.aquazero.app.core.designsystem.DataMedium
import fit.aquazero.app.core.designsystem.DataSmall
import fit.aquazero.app.core.designsystem.EmptyState
import fit.aquazero.app.core.designsystem.ErrorState
import fit.aquazero.app.core.designsystem.LocalAzfExtended
import fit.aquazero.app.core.designsystem.PrimaryButton
import fit.aquazero.app.core.designsystem.SecondaryButton
import fit.aquazero.app.core.designsystem.Skeleton
import fit.aquazero.app.core.designsystem.StatLabel
import fit.aquazero.app.core.designsystem.TabularNumbers
import fit.aquazero.app.core.designsystem.ToastController
import fit.aquazero.app.core.designsystem.rememberReducedMotion
import fit.aquazero.app.core.model.WorkoutSessionDto
import fit.aquazero.app.core.service.WorkoutLiveService
import fit.aquazero.app.core.service.WorkoutLiveService.LiveWorkoutAction
import fit.aquazero.app.core.ui.CoachRoster

/**
 * The guided workout session: overview → work → rest → … → summary.
 *
 * Three mobile upgrades over the web original: the display is held awake for
 * the whole guided run, every phase transition is announced to assistive tech,
 * and the session survives process death (see [WorkoutSessionViewModel]).
 */
@Composable
fun WorkoutSessionScreen(
    sessionId: String,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    onAskCoach: (String) -> Unit = {},
    viewModel: WorkoutSessionViewModel = hiltViewModel(),
    toastController: ToastController? = null,
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val resources = LocalResources.current
    val view = LocalView.current

    LaunchedEffect(sessionId) { viewModel.start(sessionId) }

    LaunchedEffect(viewModel) {
        WorkoutLiveService.actionEvents.collect { action ->
            when (val event = action) {
                is LiveWorkoutAction.AddRest -> viewModel.addRestSeconds(event.seconds)
                LiveWorkoutAction.SkipRest -> viewModel.skipRest()
                null -> return@collect
            }
            WorkoutLiveService.resetAction()
        }
    }

    // Hold the display awake while a set or a rest timer is running, and
    // release it the moment the session leaves those phases.
    val activity = remember(context) { context.findActivity() }
    DisposableEffect(activity, state.keepScreenOn) {
        val window = activity?.window
        if (state.keepScreenOn) {
            window?.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        } else {
            window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
        onDispose { window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) }
    }

    // Phase transitions are spoken, mirroring the web's aria-live region.
    // `announceForAccessibility` is the one-shot equivalent; a Compose live
    // region would re-announce on every recomposition of the host node, which
    // during a rest countdown would talk over the user once a second.
    val announcement = state.announcement
    @Suppress("DEPRECATION")
    LaunchedEffect(announcement?.id) {
        val slot = announcement ?: return@LaunchedEffect
        view.announceForAccessibility(resources.announcementText(slot.announcement))
    }

    LaunchedEffect(viewModel, toastController) {
        if (toastController == null) return@LaunchedEffect
        viewModel.events.collect { event ->
            when (event) {
                is WorkoutSessionEvent.Completed -> {
                    toastController.success(resources.getString(R.string.session_saved))
                    onBack()
                }

                is WorkoutSessionEvent.CompleteOffline ->
                    toastController.info(resources.getString(R.string.session_save_offline))

                is WorkoutSessionEvent.CompleteFailed ->
                    toastController.error(
                        event.message ?: resources.getString(R.string.session_save_failed),
                    )
            }
        }
    }

    // The ongoing rest-timer notification runs in a `health` foreground
    // service, and the platform only grants that type to callers holding one
    // of its prerequisite permissions (see AndroidManifest.xml). Asked here,
    // on the tap that starts a live workout, rather than at launch — it is the
    // only moment where the reason for asking is on screen.
    //
    // The session starts either way. A denial costs the lock-screen surface,
    // not the workout, so the two toasts below say so: a plain "not now", and
    // a blocked permission where Android has stopped showing the dialog and
    // the prompt would otherwise never appear again with no explanation.
    val activityDenied = stringResource(R.string.session_activity_denied)
    val activityBlocked = stringResource(R.string.session_activity_blocked)

    // InlinedApi: `ACTIVITY_RECOGNITION` is an API 29 field, and minSdk is 26.
    // It is a compile-time String constant, so it inlines and can never raise
    // NoSuchFieldError — and this callback is only reachable after the
    // launcher fired, which the SDK_INT guard in `onStartSession` below
    // confines to API 29+. Lint cannot follow that, hence the suppression.
    @Suppress("InlinedApi")
    val activityPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
    ) { granted ->
        if (!granted) {
            val canAskAgain = activity?.shouldShowRequestPermissionRationale(
                Manifest.permission.ACTIVITY_RECOGNITION,
            ) ?: false
            toastController?.info(if (canAskAgain) activityDenied else activityBlocked)
        }
        viewModel.startSession()
    }

    val onStartSession: () -> Unit = {
        val needsPermission = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.ACTIVITY_RECOGNITION,
            ) != PackageManager.PERMISSION_GRANTED
        if (needsPermission) {
            activityPermissionLauncher.launch(Manifest.permission.ACTIVITY_RECOGNITION)
        } else {
            viewModel.startSession()
        }
    }

    WorkoutSessionContent(
        state = state,
        durationMinutes = viewModel.durationMinutes(),
        modifier = modifier,
        onBack = onBack,
        onStart = onStartSession,
        onCompleteSet = viewModel::completeSet,
        onSkipExercise = viewModel::skipExercise,
        onSkipRest = viewModel::skipRest,
        onWeightChange = viewModel::onWeightChange,
        onRepsChange = viewModel::onRepsChange,
        onRirChange = viewModel::onRirChange,
        onDecrementSets = viewModel::decrementSets,
        onIncrementSets = viewModel::incrementSets,
        onBackToWorkout = viewModel::backToWorkout,
        onFinish = viewModel::completeWorkout,
        onAskCoach = onAskCoach,
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun WorkoutSessionContent(
    state: WorkoutSessionUiState,
    durationMinutes: Int,
    modifier: Modifier = Modifier,
    onBack: () -> Unit,
    onStart: () -> Unit,
    onCompleteSet: () -> Unit,
    onSkipExercise: () -> Unit,
    onSkipRest: () -> Unit,
    onWeightChange: (String) -> Unit,
    onRepsChange: (String) -> Unit,
    onRirChange: (String) -> Unit,
    onDecrementSets: (Int) -> Unit,
    onIncrementSets: (Int) -> Unit,
    onBackToWorkout: () -> Unit,
    onFinish: () -> Unit,
    onAskCoach: (String) -> Unit,
) {
    Scaffold(
        modifier = modifier.fillMaxSize(),
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            AzfAppHeader(
                title = stringResource(R.string.screen_workout_session),
                onBack = onBack,
            )
        },
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .padding(innerPadding)
                .fillMaxSize(),
        ) {
            when {
                state.loading -> LoadingBody()
                state.loadError -> ErrorState(
                    title = stringResource(R.string.session_error_title),
                    message = stringResource(R.string.session_error_body),
                    retryLabel = stringResource(R.string.session_back_to_training),
                    onRetry = onBack,
                )

                state.session == null || state.entries.isEmpty() -> EmptyState(
                    title = stringResource(R.string.session_empty_title),
                    message = stringResource(R.string.session_empty_body),
                    actionLabel = stringResource(R.string.session_back_to_training),
                    onAction = onBack,
                )

                state.phase == SessionPhase.OVERVIEW -> OverviewBody(
                    state = state,
                    onStart = onStart,
                )

                else -> GuidedBody(
                    state = state,
                    onCompleteSet = onCompleteSet,
                    onSkipExercise = onSkipExercise,
                    onSkipRest = onSkipRest,
                    onWeightChange = onWeightChange,
                    onRepsChange = onRepsChange,
                    onRirChange = onRirChange,
                )
            }
        }
    }

    if (state.phase == SessionPhase.SUMMARY) {
        val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        ModalBottomSheet(
            onDismissRequest = onBackToWorkout,
            sheetState = sheetState,
            containerColor = MaterialTheme.colorScheme.surfaceContainerLow,
        ) {
            SummaryBody(
                state = state,
                durationMinutes = durationMinutes,
                onDecrementSets = onDecrementSets,
                onIncrementSets = onIncrementSets,
                onBackToWorkout = onBackToWorkout,
                onFinish = onFinish,
                onAskCoach = onAskCoach,
            )
        }
    }
}

// ---------------------------------------------------------------------------
// Phases
// ---------------------------------------------------------------------------

@Composable
private fun LoadingBody() {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(AzfSpacing.ContainerMargin),
        verticalArrangement = Arrangement.spacedBy(AzfSpacing.Gutter),
    ) {
        Skeleton(modifier = Modifier.fillMaxWidth().height(140.dp), shape = AzfShapes.Card)
        Skeleton(modifier = Modifier.fillMaxWidth().height(72.dp), shape = AzfShapes.Card)
        Skeleton(modifier = Modifier.fillMaxWidth().height(72.dp), shape = AzfShapes.Card)
    }
}

/** Pre-start overview: estimates, the full circuit, and the start CTA. */
@Composable
private fun OverviewBody(
    state: WorkoutSessionUiState,
    onStart: () -> Unit,
) {
    val session = state.session ?: return
    Column(modifier = Modifier.fillMaxSize()) {
        LazyColumn(
            modifier = Modifier.weight(1f),
            contentPadding = PaddingValues(
                start = AzfSpacing.ContainerMargin,
                end = AzfSpacing.ContainerMargin,
                bottom = AzfSpacing.ElementGapMedium,
            ),
            verticalArrangement = Arrangement.spacedBy(AzfSpacing.Gutter),
        ) {
            item(key = "hero") {
                AzfHeroSurface(modifier = Modifier.fillMaxWidth()) {
                    Text(
                        text = session.focus.uppercase(),
                        style = MaterialTheme.typography.headlineLarge,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    Spacer(modifier = Modifier.height(AzfSpacing.Gutter))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        MetaStat(
                            value = stringResource(
                                R.string.training_minutes,
                                TrainingFormat.estimateMinutes(session),
                            ),
                            label = stringResource(R.string.session_duration_label),
                        )
                        MetaStat(
                            value = TrainingFormat.estimateKcal(session).toString(),
                            label = stringResource(R.string.session_kcal_label),
                        )
                        MetaStat(
                            value = state.totalSets.toString(),
                            label = stringResource(R.string.session_total_sets),
                        )
                    }
                }
            }
            if (state.restoredFromDraft) {
                item(key = "restored") {
                    Text(
                        text = stringResource(R.string.session_resumed),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            item(key = "circuit-header") {
                AzfSectionHeading(text = stringResource(R.string.session_circuit))
            }
            itemsIndexed(state.entries, key = { _, entry -> entry.exerciseId }) { index, entry ->
                AzfCard(tier = AzfCardTier.Compact, modifier = Modifier.fillMaxWidth()) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = (index + 1).toString(),
                            style = DataSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(20.dp),
                            textAlign = TextAlign.Center,
                        )
                        Column(modifier = Modifier.padding(start = 8.dp)) {
                            Text(
                                text = entry.name,
                                style = MaterialTheme.typography.titleMedium,
                                color = MaterialTheme.colorScheme.onSurface,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            Text(
                                text = TrainingFormat.targetLine(entry),
                                style = DataSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }
        }
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(horizontal = AzfSpacing.ContainerMargin)
                .padding(bottom = AzfSpacing.ElementGapMedium),
        ) {
            PrimaryButton(
                text = if (state.restoredFromDraft) {
                    stringResource(R.string.session_resume)
                } else {
                    stringResource(R.string.session_start)
                },
                onClick = onStart,
            )
        }
    }
}

private const val PHASE_ENTER_SCALE = 0.97f

/** Work + rest phases share the progress header and the "next up" footer. */
@Composable
private fun GuidedBody(
    state: WorkoutSessionUiState,
    onCompleteSet: () -> Unit,
    onSkipExercise: () -> Unit,
    onSkipRest: () -> Unit,
    onWeightChange: (String) -> Unit,
    onRepsChange: (String) -> Unit,
    onRirChange: (String) -> Unit,
) {
    val entry = state.current ?: return
    val guidedLabel = stringResource(R.string.session_guided)
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = AzfSpacing.ContainerMargin)
            .padding(bottom = AzfSpacing.SectionGap)
            .semantics { contentDescription = guidedLabel },
    ) {
        SessionProgressHeader(state = state)
        Spacer(modifier = Modifier.height(AzfSpacing.ElementGapMedium))

        val reducedMotion = rememberReducedMotion()
        AnimatedContent(
            targetState = state.phase == SessionPhase.WORK,
            transitionSpec = {
                val enter = if (reducedMotion) 0 else AzfMotion.ScreenEnterMs
                val exit = if (reducedMotion) 0 else AzfMotion.ScreenExitMs
                (fadeIn(tween(enter)) + scaleIn(tween(enter), initialScale = PHASE_ENTER_SCALE)) togetherWith
                    fadeOut(tween(exit))
            },
            label = "sessionPhase",
        ) { working ->
            if (working) {
                WorkCard(
                    state = state,
                    entry = entry,
                    onCompleteSet = onCompleteSet,
                    onSkipExercise = onSkipExercise,
                    onWeightChange = onWeightChange,
                    onRepsChange = onRepsChange,
                    onRirChange = onRirChange,
                )
            } else {
                RestCard(state = state, entry = entry, onSkipRest = onSkipRest)
            }
        }

        state.nextUp?.let { next ->
            Spacer(modifier = Modifier.height(AzfSpacing.ElementGapMedium))
            AzfCard(tier = AzfCardTier.Compact, modifier = Modifier.fillMaxWidth()) {
                AzfSectionHeading(text = stringResource(R.string.session_next_up))
                Text(
                    text = next.name,
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = TrainingFormat.targetLine(next),
                    style = DataSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun SummaryBody(
    state: WorkoutSessionUiState,
    durationMinutes: Int,
    onDecrementSets: (Int) -> Unit,
    onIncrementSets: (Int) -> Unit,
    onBackToWorkout: () -> Unit,
    onFinish: () -> Unit,
    onAskCoach: (String) -> Unit,
) {
    val persona = CoachRoster.resolve(state.coachId)
    val coachPrompt = stringResource(R.string.session_coach_summary_prompt, persona.firstName)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .navigationBarsPadding()
            .padding(horizontal = AzfSpacing.ContainerMargin)
            .padding(bottom = AzfSpacing.SectionGap),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = stringResource(R.string.session_summary_title).uppercase(),
                style = MaterialTheme.typography.headlineMedium,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.weight(1f),
            )
            IconButton(onClick = onBackToWorkout, enabled = !state.completing) {
                Icon(
                    imageVector = Icons.Outlined.Close,
                    contentDescription = stringResource(R.string.action_close),
                )
            }
        }
        Spacer(modifier = Modifier.height(AzfSpacing.ElementGapMedium))
        AzfCard(modifier = Modifier.fillMaxWidth()) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                MetaStat(
                    value = stringResource(R.string.training_minutes, durationMinutes),
                    label = stringResource(R.string.session_duration_label),
                )
                MetaStat(
                    value = stringResource(
                        R.string.session_progress_sets,
                        state.completedSets,
                        state.totalSets,
                    ),
                    label = stringResource(R.string.session_sets_completed),
                )
            }
        }

        state.entries.forEachIndexed { index, entry ->
            Spacer(modifier = Modifier.height(AzfSpacing.Gutter))
            val logs = state.setLogs.getOrElse(index) { emptyList() }
            val done = state.setsDone.getOrElse(index) { 0 }
            AzfCard(tier = AzfCardTier.Compact, modifier = Modifier.fillMaxWidth()) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = entry.name,
                            style = MaterialTheme.typography.titleMedium,
                            color = MaterialTheme.colorScheme.onSurface,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text(
                            text = if (state.skipped.getOrElse(index) { false }) {
                                stringResource(R.string.session_skipped)
                            } else {
                                stringResource(R.string.session_sets_of, done, entry.sets)
                            },
                            style = DataSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        if (logs.isNotEmpty()) {
                            val last = logs.last()
                            Text(
                                text = stringResource(
                                    R.string.session_logged_line,
                                    last.weightKg?.let { "${TrainingFormat.number(it)} kg" }
                                        ?: stringResource(R.string.session_bodyweight),
                                    logs.size,
                                ),
                                style = DataSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                    IconButton(onClick = { onDecrementSets(index) }) {
                        Icon(
                            imageVector = Icons.Outlined.Remove,
                            contentDescription = stringResource(
                                R.string.session_decrease_cd,
                                entry.name,
                            ),
                            tint = MaterialTheme.colorScheme.onSurface,
                        )
                    }
                    Text(
                        text = done.toString(),
                        style = DataSmall,
                        color = MaterialTheme.colorScheme.onSurface,
                        modifier = Modifier.size(20.dp),
                        textAlign = TextAlign.Center,
                    )
                    IconButton(onClick = { onIncrementSets(index) }) {
                        Icon(
                            imageVector = Icons.Outlined.Add,
                            contentDescription = stringResource(
                                R.string.session_increase_cd,
                                entry.name,
                            ),
                            tint = MaterialTheme.colorScheme.onSurface,
                        )
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(AzfSpacing.SectionGap))
        SecondaryButton(
            text = stringResource(R.string.session_ask_coach, persona.firstName),
            onClick = { onAskCoach(coachPrompt) },
            enabled = !state.completing,
        )
        Spacer(modifier = Modifier.height(AzfSpacing.Gutter))
        PrimaryButton(
            text = if (state.completing) {
                stringResource(R.string.session_saving)
            } else {
                stringResource(R.string.session_finish_save)
            },
            onClick = onFinish,
            loading = state.completing,
        )
        Spacer(modifier = Modifier.height(12.dp))
        SecondaryButton(
            text = stringResource(R.string.session_back_to_workout),
            onClick = onBackToWorkout,
            enabled = !state.completing,
        )
    }
}

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

@Composable
private fun MetaStat(value: String, label: String) {
    Column(horizontalAlignment = Alignment.Start) {
        Text(
            text = label.uppercase(),
            style = StatLabel,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = value,
            style = DataMedium,
            color = MaterialTheme.colorScheme.onSurface,
        )
    }
}

@Composable
internal fun ActualField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    description: String,
    decimal: Boolean,
    modifier: Modifier = Modifier,
    placeholder: String? = null,
) {
    Column(modifier = modifier) {
        Text(
            text = label.uppercase(),
            style = StatLabel,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            singleLine = true,
            placeholder = placeholder?.let {
                {
                    Text(
                        text = it,
                        style = DataSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f),
                    )
                }
            },
            textStyle = DataSmall.copy(
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
                fontFeatureSettings = TabularNumbers,
            ),
            keyboardOptions = KeyboardOptions(
                keyboardType = if (decimal) KeyboardType.Decimal else KeyboardType.Number,
            ),
            shape = AzfShapes.Inner,
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = LocalAzfExtended.current.primaryFixedDim,
                unfocusedBorderColor = MaterialTheme.colorScheme.outlineVariant,
                focusedContainerColor = MaterialTheme.colorScheme.surfaceContainer,
                unfocusedContainerColor = MaterialTheme.colorScheme.surfaceContainer,
            ),
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 4.dp)
                .semantics { contentDescription = description },
        )
    }
}

/** Resolve an announcement payload to its localized sentence. */
private fun Resources.announcementText(announcement: SessionAnnouncement): String =
    when (announcement) {
        is SessionAnnouncement.Started ->
            getString(R.string.session_announce_started, announcement.exerciseName)

        is SessionAnnouncement.NextExercise ->
            getString(R.string.session_announce_next, announcement.exerciseName)

        is SessionAnnouncement.SetDone -> getString(
            R.string.session_announce_set_done,
            announcement.setNumber,
            announcement.totalSets,
            announcement.restSeconds,
        )

        SessionAnnouncement.RestComplete ->
            getString(R.string.session_announce_rest_complete)

        SessionAnnouncement.RestSkipped ->
            getString(R.string.session_announce_rest_skipped)

        SessionAnnouncement.Finished ->
            getString(R.string.session_announce_finished)

        is SessionAnnouncement.PrAchieved ->
            "New personal record! Plus %.1f kg estimated max.".format(announcement.deltaKg)

        is SessionAnnouncement.Restored -> getString(
            R.string.session_announce_restored,
            announcement.exerciseNumber,
            announcement.total,
        )
    }

/** Unwrap the hosting Activity so the session can hold the display awake. */
private fun Context.findActivity(): Activity? {
    var context: Context? = this
    while (context is ContextWrapper) {
        if (context is Activity) return context
        context = context.baseContext
    }
    return null
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416)
@Composable
private fun WorkoutSessionWorkPreview() {
    val entries = listOf(
        ResolvedEntry("ex1", "Barbell bench press", 3, 8, 10, 40.0, 2.0, 90),
        ResolvedEntry("ex2", "Bent-over row", 3, 10, null, 35.0, 2.0, 75),
    )
    AzfTheme {
        WorkoutSessionContent(
            state = WorkoutSessionUiState(
                loading = false,
                session = WorkoutSessionDto(id = "s1", userId = "u1", focus = "Upper body"),
                entries = entries,
                phase = SessionPhase.WORK,
                setsDone = listOf(1, 0),
                skipped = listOf(false, false),
                setLogs = listOf(emptyList(), emptyList()),
                actual = ActualInput(weightKg = "40", reps = "8", rir = "2"),
            ),
            durationMinutes = 12,
            onBack = {},
            onStart = {},
            onCompleteSet = {},
            onSkipExercise = {},
            onSkipRest = {},
            onWeightChange = {},
            onRepsChange = {},
            onRirChange = {},
            onDecrementSets = {},
            onIncrementSets = {},
            onBackToWorkout = {},
            onFinish = {},
            onAskCoach = {},
        )
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416)
@Composable
private fun WorkoutSessionRestPreview() {
    val entries = listOf(ResolvedEntry("ex1", "Barbell bench press", 3, 8, 10, 40.0, 2.0, 90))
    AzfTheme {
        WorkoutSessionContent(
            state = WorkoutSessionUiState(
                loading = false,
                session = WorkoutSessionDto(id = "s1", userId = "u1", focus = "Upper body"),
                entries = entries,
                phase = SessionPhase.REST,
                setsDone = listOf(1),
                skipped = listOf(false),
                setLogs = listOf(emptyList()),
                restLeftSeconds = 62,
                restTotalSeconds = 90,
            ),
            durationMinutes = 4,
            onBack = {},
            onStart = {},
            onCompleteSet = {},
            onSkipExercise = {},
            onSkipRest = {},
            onWeightChange = {},
            onRepsChange = {},
            onRirChange = {},
            onDecrementSets = {},
            onIncrementSets = {},
            onBackToWorkout = {},
            onFinish = {},
            onAskCoach = {},
        )
    }
}
