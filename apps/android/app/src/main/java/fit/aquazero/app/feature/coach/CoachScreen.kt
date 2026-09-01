package fit.aquazero.app.feature.coach

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.LocalActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Send
import androidx.compose.material.icons.outlined.Mic
import androidx.compose.material.icons.outlined.MicOff
import androidx.compose.material.icons.outlined.Restaurant
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import fit.aquazero.app.R
import fit.aquazero.app.core.audio.SpeechInputState
import fit.aquazero.app.core.database.ChatMessageEntity
import fit.aquazero.app.core.designsystem.AkinStage
import fit.aquazero.app.core.designsystem.AzfAppHeader
import fit.aquazero.app.core.designsystem.AzfCard
import fit.aquazero.app.core.designsystem.AzfCardTier
import fit.aquazero.app.core.designsystem.AzfChip
import fit.aquazero.app.core.designsystem.AzfShapes
import fit.aquazero.app.core.designsystem.AzfSpacing
import fit.aquazero.app.core.designsystem.AzfTextField
import fit.aquazero.app.core.designsystem.AzfTheme
import fit.aquazero.app.core.designsystem.LocalAzfExtended
import fit.aquazero.app.core.designsystem.Skeleton
import fit.aquazero.app.core.designsystem.ToastKind
import fit.aquazero.app.core.gamification.CelebrationHost
import fit.aquazero.app.core.model.ChatMealDraftDto
import fit.aquazero.app.core.ui.CoachAvatar
import fit.aquazero.app.core.ui.CoachPersona
import fit.aquazero.app.core.ui.CoachPortrait
import fit.aquazero.app.core.ui.CoachRoster
import fit.aquazero.app.core.ui.rememberToastSink
import kotlinx.coroutines.flow.conflate

/**
 * The coach conversation.
 *
 * Structure, top to bottom: header (coach avatar → character select), the
 * **persistent** wellness disclaimer, the message list, and a composer with
 * three buttons — mic (speech dictation), meal log, and send.
 *
 * The celebration layer is hosted here as well as on the dashboard, because
 * logging a meal from chat can be the thing that levels someone up, and the
 * moment should land where the action happened.
 */
@Composable
fun CoachScreen(
    modifier: Modifier = Modifier,
    onOpenCoachSelect: () -> Unit = {},
    onOpenManualLogging: () -> Unit = {},
    viewModel: CoachViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val speechState by viewModel.speechState.collectAsStateWithLifecycle()
    val speakingMessageId by viewModel.speakingMessageId.collectAsStateWithLifecycle()
    val toasts = rememberToastSink()
    val context = LocalContext.current

    val reportDone = stringResource(R.string.coach_report_done)
    val reportFailed = stringResource(R.string.coach_report_failed)
    val draftFailed = stringResource(R.string.draft_failed)
    val proposeFailed = stringResource(R.string.draft_propose_failed)
    val mealLogged = stringResource(R.string.meal_logged)
    val draftRestored = stringResource(R.string.draft_restored)
    val aiDegraded = stringResource(R.string.ai_degraded_notice)

    // rememberSaveable, not remember: dictation writes here, and losing a
    // spoken message to a backgrounded app means saying it all again.
    var input by rememberSaveable { mutableStateOf("") }

    // Denial copy is about the microphone, not the meal draft. Two distinct
    // cases: a plain "not now", and a blocked permission where Android stops
    // showing the dialog entirely — there the button would otherwise do
    // nothing at all, forever, with no explanation.
    val micDenied = stringResource(R.string.coach_mic_denied)
    val micBlocked = stringResource(R.string.coach_mic_blocked)
    val activity = LocalActivity.current

    val micPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
    ) { granted ->
        if (granted) {
            viewModel.startVoiceDictation { text ->
                input = if (input.isBlank()) text else "$input $text"
            }
        } else {
            val canAskAgain = activity?.shouldShowRequestPermissionRationale(
                Manifest.permission.RECORD_AUDIO,
            ) ?: false
            toasts.show(if (canAskAgain) micDenied else micBlocked, ToastKind.Info)
        }
    }

    val onToggleMic: () -> Unit = {
        if (speechState is SpeechInputState.Listening || speechState is SpeechInputState.Transcribing) {
            viewModel.stopVoiceDictation()
        } else {
            val hasPermission = ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.RECORD_AUDIO,
            ) == PackageManager.PERMISSION_GRANTED

            if (hasPermission) {
                viewModel.startVoiceDictation { text ->
                    input = if (input.isBlank()) text else "$input $text"
                }
            } else {
                micPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
            }
        }
    }

    LaunchedEffect(speechState) {
        if (speechState is SpeechInputState.Transcribing) {
            val partial = (speechState as SpeechInputState.Transcribing).partialText
            if (partial.isNotEmpty()) {
                input = partial
            }
        }
    }

    LaunchedEffect(viewModel) {
        viewModel.events.collect { event ->
            when (event) {
                is CoachEvent.Toast -> {
                    val message = when (event.message) {
                        CoachToast.ReportDone -> reportDone
                        CoachToast.ReportFailed -> reportFailed
                        CoachToast.DraftFailed -> draftFailed
                        CoachToast.ProposeFailed -> proposeFailed
                        CoachToast.MealLogged -> mealLogged
                        CoachToast.DraftRestored -> draftRestored
                        CoachToast.AiDegraded -> aiDegraded
                    }
                    val kind = when (event.message) {
                        CoachToast.ReportFailed,
                        CoachToast.DraftFailed,
                        CoachToast.ProposeFailed,
                        -> ToastKind.Error
                        CoachToast.DraftRestored,
                        CoachToast.AiDegraded,
                        -> ToastKind.Info
                        else -> ToastKind.Success
                    }
                    toasts.show(message, kind)
                }
                CoachEvent.MealLogged -> Unit
                is CoachEvent.PrefillPrompt -> input = event.text
            }
        }
    }

    Box(modifier = modifier.fillMaxSize()) {
        CoachContent(
            state = state,
            speechState = speechState,
            speakingMessageId = speakingMessageId,
            onSend = viewModel::send,
            onProposeMeal = viewModel::proposeMeal,
            onConfirmDraft = viewModel::confirmDraft,
            onDismissDraft = viewModel::dismissDraft,
            onReport = viewModel::report,
            onRetry = viewModel::retryLast,
            onDismissFailure = viewModel::dismissTurnFailure,
            onOpenCoachSelect = onOpenCoachSelect,
            onLogManually = onOpenManualLogging,
            onToggleMic = onToggleMic,
            onSpeakMessage = viewModel::toggleSpeakMessage,
            onExecuteAction = viewModel::executeAction,
            input = input,
            onInputChange = { input = it },
        )
        // Placed last so a level-up sits above the conversation, not under it.
        CelebrationHost()
    }
}

@Composable
fun CoachContent(
    state: CoachUiState,
    speechState: SpeechInputState = SpeechInputState.Idle,
    speakingMessageId: String? = null,
    onSend: (String) -> Unit,
    onProposeMeal: (String) -> Unit,
    onConfirmDraft: (MealDraftConfirmation) -> Unit,
    onDismissDraft: () -> Unit,
    onReport: (String) -> Unit,
    onRetry: () -> Unit,
    onDismissFailure: () -> Unit,
    onOpenCoachSelect: () -> Unit,
    onLogManually: () -> Unit,
    onToggleMic: () -> Unit = {},
    onSpeakMessage: (String, String) -> Unit = { _, _ -> },
    onExecuteAction: (ChatAction) -> Unit = {},
    modifier: Modifier = Modifier,
    // Hoisted, because voice dictation writes into it from CoachScreen.
    // A local `remember` here silently swallowed every dictated word:
    // the screen transcribed into its own copy while the field below
    // was bound to a different one. Previews keep the empty default.
    input: String = "",
    onInputChange: (String) -> Unit = {},
) {
    val listState = rememberLazyListState()

    AutoScrollToNewest(state, listState)

    Scaffold(
        modifier = modifier.fillMaxSize(),
        topBar = {
            AzfAppHeader(
                title = stringResource(R.string.coach_title, state.persona.firstName),
                onBack = null,
                trailing = {
                    val changeLabel =
                        stringResource(R.string.coach_change_cd, state.persona.name)
                    IconButton(onClick = onOpenCoachSelect) {
                        CoachAvatar(
                            persona = state.persona,
                            size = 32.dp,
                            contentDescription = changeLabel,
                        )
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            LiveRegion(state)
            WellnessDisclaimerBar(
                modifier = Modifier.padding(
                    horizontal = AzfSpacing.ContainerMargin,
                    vertical = 8.dp,
                ),
            )

            Box(modifier = Modifier.weight(1f)) {
                if (state.loading && state.messages.isEmpty()) {
                    LoadingConversation()
                } else {
                    Conversation(
                        state = state,
                        speakingMessageId = speakingMessageId,
                        listState = listState,
                        onSend = onSend,
                        onReport = onReport,
                        onConfirmDraft = onConfirmDraft,
                        onDismissDraft = onDismissDraft,
                        onRetry = onRetry,
                        onDismissFailure = onDismissFailure,
                        onLogManually = onLogManually,
                        onSpeakMessage = onSpeakMessage,
                        onExecuteAction = onExecuteAction,
                    )
                }
            }

            Composer(
                value = input,
                onValueChange = onInputChange,
                state = state,
                speechState = speechState,
                onToggleMic = onToggleMic,
                onSend = {
                    val text = input
                    onInputChange("")
                    onSend(text)
                },
                onProposeMeal = {
                    val text = input
                    onInputChange("")
                    onProposeMeal(text)
                },
            )
        }
    }
}

/**
 * Keep the newest turn in view.
 *
 * The list is [reverseLayout][LazyColumn], so **index 0 is the newest turn** —
 * the draft, the in-flight stream, the pending user line — and scrolling to 0
 * pins the conversation to the bottom of the screen.
 *
 * Two effects, deliberately, because they want different scroll calls:
 *
 * - Turn boundaries (a message committed, a draft opened, a stream starting or
 *   ending) are rare and are worth animating.
 * - Tokens are not. Keying an effect on `streamingText` restarted it on every
 *   token, cancelling the in-flight `animateScrollToItem` before it could
 *   settle — the list visibly juddered and never arrived. Tokens are followed
 *   instead by a conflated snapshot flow that jumps instantly, which no
 *   subsequent token can interrupt.
 */
@Composable
private fun AutoScrollToNewest(
    state: CoachUiState,
    listState: androidx.compose.foundation.lazy.LazyListState,
) {
    LaunchedEffect(
        listState,
        state.messages.size,
        state.pendingUserMessage,
        state.draft?.id,
        state.streaming,
    ) {
        listState.animateScrollToItem(0)
    }

    // rememberUpdatedState so the long-lived collector reads the current turn's
    // text rather than the value captured when it started.
    val current by rememberUpdatedState(state)
    LaunchedEffect(listState) {
        snapshotFlow { current.streamingText.length }
            .conflate()
            .collect { length -> if (length > 0) listState.scrollToItem(0) }
    }
}

/** Polite announcements for streaming state, invisible to sighted users. */
@Composable
private fun LiveRegion(state: CoachUiState) {
    val note = when {
        state.streaming -> stringResource(R.string.coach_replying, state.persona.firstName)
        state.turnFailure == TurnFailure.Unavailable ->
            stringResource(R.string.coach_error_unavailable)
        state.turnFailure == TurnFailure.Dropped -> stringResource(R.string.coach_error_dropped)
        else -> ""
    }
    Box(
        modifier = Modifier
            .size(1.dp)
            .semantics {
                liveRegion = LiveRegionMode.Polite
                contentDescription = note
            },
    )
}

@Composable
private fun LoadingConversation() {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(AzfSpacing.ContainerMargin),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Skeleton(modifier = Modifier.fillMaxWidth(0.75f).height(78.dp), shape = AzfShapes.Card)
        Skeleton(modifier = Modifier.fillMaxWidth(0.6f).height(52.dp), shape = AzfShapes.Card)
        Skeleton(modifier = Modifier.fillMaxWidth(0.8f).height(96.dp), shape = AzfShapes.Card)
    }
}

/**
 * Reversed list: index 0 is the newest turn, so a growing conversation stays
 * pinned to the bottom without measuring anything.
 */
@Composable
private fun Conversation(
    state: CoachUiState,
    listState: androidx.compose.foundation.lazy.LazyListState,
    speakingMessageId: String? = null,
    onSend: (String) -> Unit,
    onReport: (String) -> Unit,
    onConfirmDraft: (MealDraftConfirmation) -> Unit,
    onDismissDraft: () -> Unit,
    onRetry: () -> Unit,
    onDismissFailure: () -> Unit,
    onLogManually: () -> Unit,
    onSpeakMessage: (String, String) -> Unit = { _, _ -> },
    onExecuteAction: (ChatAction) -> Unit = {},
) {
    val conversationLabel = stringResource(R.string.coach_conversation_cd)
    LazyColumn(
        state = listState,
        modifier = Modifier
            .fillMaxSize()
            .semantics { contentDescription = conversationLabel },
        contentPadding = PaddingValues(
            horizontal = AzfSpacing.ContainerMargin,
            vertical = 12.dp,
        ),
        verticalArrangement = Arrangement.spacedBy(14.dp),
        reverseLayout = true,
    ) {
        state.draft?.let { draft ->
            item(key = "draft-${draft.id}") {
                DraftBlock(
                    draft = draft,
                    persona = state.persona,
                    pending = state.draftPending,
                    onConfirm = onConfirmDraft,
                    onDismiss = onDismissDraft,
                    onLogManually = onLogManually,
                )
            }
        }

        if (state.proposingDraft) {
            item(key = "proposing") {
                Column {
                    CoachByline(state.persona)
                    Spacer(Modifier.height(6.dp))
                    Text(
                        text = stringResource(R.string.draft_reading),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }

        state.turnFailure?.let { failure ->
            item(key = "failure") {
                TurnFailureFrame(
                    failure = failure,
                    persona = state.persona,
                    onRetry = onRetry,
                    onDismiss = onDismissFailure,
                )
            }
        }

        if (state.streaming) {
            item(key = "streaming") {
                if (state.streamingText.isEmpty()) {
                    Column {
                        CoachByline(state.persona)
                        Spacer(Modifier.height(8.dp))
                        TypingDots(
                            label = stringResource(
                                R.string.coach_typing,
                                state.persona.firstName,
                            ),
                        )
                    }
                } else {
                    AssistantBubble(
                        content = state.streamingText,
                        persona = state.persona,
                    )
                }
            }
        }

        state.pendingUserMessage?.let { pending ->
            item(key = "pending") { UserBubble(content = pending) }
        }

        items(
            count = state.messages.size,
            key = { index -> state.messages[state.messages.lastIndex - index].id },
        ) { index ->
            val message = state.messages[state.messages.lastIndex - index]
            if (message.role == "user") {
                UserBubble(content = message.content, timestamp = message.createdAt.timeOfDay())
            } else {
                val actions = remember(message.content, message.id) {
                    ChatActionExtractor.extractActions(message.content, message.id)
                }
                AssistantBubble(
                    content = message.content,
                    persona = state.persona,
                    guardrailBlocked = message.guardrailBlocked,
                    reported = message.reported,
                    timestamp = message.createdAt.timeOfDay(),
                    actions = actions,
                    isSpeaking = speakingMessageId == message.id,
                    onSpeakClick = { onSpeakMessage(message.id, message.content) },
                    onActionClick = onExecuteAction,
                    onReport = { onReport(message.id) },
                )
            }
        }

        if (state.isEmptyConversation) {
            item(key = "empty") {
                EmptyConversation(state = state, onPrompt = onSend)
            }
        }
    }
}

@Composable
private fun DraftBlock(
    draft: ChatMealDraftDto,
    persona: CoachPersona,
    pending: Boolean,
    onConfirm: (MealDraftConfirmation) -> Unit,
    onDismiss: () -> Unit,
    onLogManually: () -> Unit,
) {
    Column {
        CoachByline(persona)
        Spacer(Modifier.height(6.dp))
        MealDraftCard(
            draft = draft,
            pending = pending,
            onConfirm = onConfirm,
            onDismiss = onDismiss,
            onLogManually = onLogManually,
        )
    }
}

/**
 * Failure frames use the same calm treatment as guardrails. A stream that
 * dropped is not the user's fault and must not read like an error dialog.
 */
@Composable
private fun TurnFailureFrame(
    failure: TurnFailure,
    persona: CoachPersona,
    onRetry: () -> Unit,
    onDismiss: () -> Unit,
) {
    Column {
        CoachByline(persona)
        Spacer(Modifier.height(6.dp))
        SafetyFrame(
            content = when (failure) {
                TurnFailure.Unavailable -> stringResource(R.string.coach_error_unavailable)
                TurnFailure.Dropped -> stringResource(R.string.coach_error_dropped)
            },
            modifier = Modifier.fillMaxWidth(0.92f),
        )
        Row(modifier = Modifier.padding(top = 8.dp)) {
            AzfChip(
                text = stringResource(R.string.coach_error_send_retry),
                selected = true,
                onClick = onRetry,
            )
            Spacer(Modifier.width(8.dp))
            AzfChip(
                text = stringResource(R.string.action_retry),
                selected = false,
                onClick = onDismiss,
            )
        }
    }
}

/** First run of a conversation: mascot, greeting, prompts, and the meal hint. */
@Composable
private fun EmptyConversation(state: CoachUiState, onPrompt: (String) -> Unit) {
    val prompts = state.suggestedPrompts.ifEmpty {
        listOf(
            stringResource(R.string.coach_prompt_1),
            stringResource(R.string.coach_prompt_2),
            stringResource(R.string.coach_prompt_3),
            stringResource(R.string.coach_prompt_4),
        )
    }
    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        if (state.persona.id == CoachRoster.DEFAULT_ID) {
            AkinStage(size = 180.dp)
        } else {
            CoachPortrait(
                persona = state.persona,
                modifier = Modifier.size(width = 140.dp, height = 180.dp),
                contentDescription = stringResource(
                    R.string.coach_portrait_cd,
                    state.persona.name,
                ),
            )
        }
        Spacer(Modifier.height(16.dp))
        Text(
            text = stringResource(R.string.coach_greeting_title, state.persona.firstName),
            style = MaterialTheme.typography.headlineMedium,
            color = MaterialTheme.colorScheme.onSurface,
            textAlign = TextAlign.Center,
        )
        Text(
            text = stringResource(
                R.string.coach_greeting_body,
                stringResource(state.persona.taglineRes),
            ),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 6.dp),
        )
        Spacer(Modifier.height(16.dp))
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            prompts.forEach { prompt ->
                AzfChip(text = prompt, selected = false, onClick = { onPrompt(prompt) })
            }
        }
        Spacer(Modifier.height(16.dp))
        AzfCard(tier = AzfCardTier.Compact, modifier = Modifier.fillMaxWidth()) {
            Text(
                text = stringResource(R.string.coach_meal_hint),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
        }
    }
}

/**
 * Send and "log this as a meal", side by side.
 *
 * Two buttons, zero ambiguity about what each one does. The meal button is the
 * app's second confirmation gate opening, not a shortcut past it — it proposes
 * a draft, and the draft still has to be confirmed line by line.
 */
@Composable
private fun Composer(
    value: String,
    onValueChange: (String) -> Unit,
    state: CoachUiState,
    speechState: SpeechInputState = SpeechInputState.Idle,
    onToggleMic: () -> Unit = {},
    onSend: () -> Unit,
    onProposeMeal: () -> Unit,
) {
    val hasText = value.isNotBlank()
    val enabled = state.canSend
    val accent = LocalAzfExtended.current.primaryFixedDim
    val isListening = speechState is SpeechInputState.Listening || speechState is SpeechInputState.Transcribing

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surface)
            .imePadding()
            .navigationBarsPadding()
            .padding(horizontal = AzfSpacing.ContainerMargin, vertical = 10.dp),
    ) {
        if (state.sessionId == null && !state.loading) {
            Text(
                text = stringResource(R.string.coach_offline),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(bottom = 8.dp),
            )
        }

        if (isListening) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "Listening... Speak your meal or question",
                    style = MaterialTheme.typography.labelMedium,
                    color = state.persona.colour,
                    modifier = Modifier.weight(1f),
                )
            }
        }

        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onToggleMic, enabled = enabled) {
                Icon(
                    imageVector = if (isListening) Icons.Outlined.MicOff else Icons.Outlined.Mic,
                    contentDescription = if (isListening) "Stop voice dictation" else "Start voice dictation",
                    tint = if (isListening) {
                        state.persona.colour
                    } else if (enabled) {
                        accent
                    } else {
                        MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f)
                    },
                )
            }
            Spacer(Modifier.width(4.dp))
            AzfTextField(
                value = value,
                onValueChange = onValueChange,
                label = stringResource(R.string.coach_input_placeholder, state.persona.firstName),
                modifier = Modifier.weight(1f),
                enabled = enabled,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
            )
            Spacer(Modifier.width(6.dp))
            IconButton(onClick = onProposeMeal, enabled = enabled && hasText) {
                Icon(
                    imageVector = Icons.Outlined.Restaurant,
                    contentDescription = stringResource(R.string.coach_log_meal),
                    tint = if (enabled && hasText) {
                        accent
                    } else {
                        MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f)
                    },
                )
            }
            IconButton(onClick = onSend, enabled = enabled && hasText) {
                Icon(
                    imageVector = Icons.AutoMirrored.Outlined.Send,
                    contentDescription = stringResource(R.string.coach_send),
                    tint = if (enabled && hasText) {
                        accent
                    } else {
                        MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f)
                    },
                )
            }
        }
    }
}

/** `2026-08-27T18:42:03.000Z` → `18:42`, without a formatter dependency. */
internal fun String.timeOfDay(): String {
    val timePart = substringAfter('T', "").takeIf { it.length >= 5 } ?: return ""
    return timePart.take(5)
}

// ---------------------------------------------------------------------------
// Previews
// ---------------------------------------------------------------------------

private fun previewMessages(): List<ChatMessageEntity> = listOf(
    ChatMessageEntity(
        id = "1",
        sessionId = "s1",
        role = "user",
        content = "What should I eat tonight?",
        createdAt = "2026-08-27T18:42:00.000Z",
    ),
    ChatMessageEntity(
        id = "2",
        sessionId = "s1",
        role = "assistant",
        content = "You have banked **1,480 kcal** today.\n\n" +
            "- a palm of protein\n- something green\n- water alongside it",
        createdAt = "2026-08-27T18:42:06.000Z",
    ),
)

@Preview(showBackground = true, backgroundColor = 0xFF0E1416, widthDp = 400, heightDp = 860)
@Composable
private fun CoachContentPreview() {
    AzfTheme {
        CoachContent(
            state = CoachUiState(
                loading = false,
                sessionId = "s1",
                messages = previewMessages(),
            ),
            onSend = {},
            onProposeMeal = {},
            onConfirmDraft = {},
            onDismissDraft = {},
            onReport = {},
            onRetry = {},
            onDismissFailure = {},
            onOpenCoachSelect = {},
            onLogManually = {},
        )
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416, widthDp = 400, heightDp = 860)
@Composable
private fun CoachContentEmptyPreview() {
    AzfTheme {
        CoachContent(
            state = CoachUiState(loading = false, sessionId = "s1"),
            onSend = {},
            onProposeMeal = {},
            onConfirmDraft = {},
            onDismissDraft = {},
            onReport = {},
            onRetry = {},
            onDismissFailure = {},
            onOpenCoachSelect = {},
            onLogManually = {},
        )
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416, widthDp = 400, heightDp = 860)
@Composable
private fun CoachContentStreamingPreview() {
    AzfTheme {
        CoachContent(
            state = CoachUiState(
                loading = false,
                sessionId = "s1",
                messages = previewMessages(),
                streaming = true,
                streamingText = "Looking at today first — you have ",
                pendingUserMessage = "How is my week going?",
            ),
            onSend = {},
            onProposeMeal = {},
            onConfirmDraft = {},
            onDismissDraft = {},
            onReport = {},
            onRetry = {},
            onDismissFailure = {},
            onOpenCoachSelect = {},
            onLogManually = {},
        )
    }
}
