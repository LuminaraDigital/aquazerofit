package fit.aquazero.app.feature.coach

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import fit.aquazero.app.core.common.LocalDates
import fit.aquazero.app.core.data.ChatRepository
import fit.aquazero.app.core.data.CoachesRepository
import fit.aquazero.app.core.database.ChatMessageEntity
import fit.aquazero.app.core.model.ApiResult
import fit.aquazero.app.core.network.ChatStreamEvent
import fit.aquazero.app.core.network.api.ConfirmMealDraftRequest
import fit.aquazero.app.core.network.api.MealDraftSelection
import fit.aquazero.app.core.model.ChatMealDraftDto
import fit.aquazero.app.core.model.ChatMealDraftStatus
import fit.aquazero.app.core.model.ChatMessageDto
import javax.inject.Inject
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/** How the current turn ended, when it ended badly. */
enum class TurnFailure {
    /** `AI_UNAVAILABLE` — the gateway declined; nothing was written. */
    Unavailable,

    /** The stream dropped and the bounded poll found no reply. */
    Dropped,
}

/** Immutable state of the coach conversation. */
data class CoachUiState(
    val loading: Boolean = true,
    /** True when the session bootstrap itself failed — history may still show. */
    val bootstrapFailed: Boolean = false,
    val sessionId: String? = null,
    val persona: CoachPersona = CoachRoster.default(),
    val messages: List<ChatMessageEntity> = emptyList(),
    /** The user's turn, held on screen until history catches up. */
    val pendingUserMessage: String? = null,
    val streaming: Boolean = false,
    /** Tokens received so far this turn. */
    val streamingText: String = "",
    val suggestedPrompts: List<String> = emptyList(),
    /** The last thing the user asked, kept so "ask again" has something to send. */
    val lastAttempt: String? = null,
    val turnFailure: TurnFailure? = null,
    val draft: ChatMealDraftDto? = null,
    val draftPending: Boolean = false,
    val proposingDraft: Boolean = false,
) {
    val canSend: Boolean get() = sessionId != null && !streaming && !proposingDraft

    /** Nothing said yet — show the greeting, the mascot and the prompt chips. */
    val isEmptyConversation: Boolean
        get() = !loading && messages.isEmpty() && pendingUserMessage == null && !streaming
}

/** One-shot effects. */
sealed interface CoachEvent {
    data class Toast(val message: CoachToast) : CoachEvent

    /** A meal was logged; the celebration layer wants a look at progression. */
    data object MealLogged : CoachEvent

    /** Route the user to manual logging for a food the corpus does not know. */
    data object OpenManualLogging : CoachEvent
}

/** Toast identities, resolved to strings by the screen. */
enum class CoachToast {
    ReportDone,
    ReportFailed,
    DraftFailed,
    ProposeFailed,
    MealLogged,
    DraftRestored,
}

/**
 * The coach conversation.
 *
 * Three things in here are load-bearing and easy to undo by accident:
 *
 *  1. **History is Room-backed and read-only offline.** The message list is a
 *     `Flow` off the database, so an aeroplane-mode user still has every past
 *     conversation. Sending is online-only and says so, rather than queueing a
 *     question into an outbox that would arrive with no context days later.
 *  2. **A dropped stream is not a lost reply.** [ChatTurnRunner] owns that; see
 *     its docs for why the poll looks for a new *assistant id* rather than a
 *     message count.
 *  3. **A meal draft is never inferred from a chat turn.** [proposeMeal] is
 *     reachable only from its own composer button. Guessing "I ate X" out of a
 *     sentence would either surprise the user or spend a credit on every
 *     message, and the confirmation card exists precisely because the app must
 *     not decide what someone ate.
 */
@HiltViewModel
class CoachViewModel @Inject constructor(
    private val chatRepository: ChatRepository,
    private val coachesRepository: CoachesRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(CoachUiState())
    val uiState: StateFlow<CoachUiState> = _uiState.asStateFlow()

    private val _events = Channel<CoachEvent>(Channel.BUFFERED)
    val events: Flow<CoachEvent> = _events.receiveAsFlow()

    private val sessionIdFlow = MutableStateFlow<String?>(null)

    private val gateway = object : ChatTurnGateway {
        override fun stream(sessionId: String, content: String): Flow<ChatStreamEvent> =
            chatRepository.stream(sessionId, content)

        override suspend fun refreshMessages(sessionId: String): List<ChatMessageDto>? =
            when (val result = chatRepository.refreshMessages(sessionId)) {
                is ApiResult.Success -> result.data
                is ApiResult.Failure -> null
            }
    }

    private val runner = ChatTurnRunner(gateway)

    init {
        observeMessages()
        bootstrap()
        loadActiveCoach()
        restorePendingDraft()
    }

    // -----------------------------------------------------------------------
    // Bootstrap
    // -----------------------------------------------------------------------

    @OptIn(ExperimentalCoroutinesApi::class)
    private fun observeMessages() {
        viewModelScope.launch {
            sessionIdFlow
                .flatMapLatest { id ->
                    if (id == null) flowOf(emptyList()) else chatRepository.messages(id)
                }
                .stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())
                .collect { messages ->
                    _uiState.value = _uiState.value.copy(
                        messages = messages,
                        // The optimistic bubble retires the moment the real one
                        // lands, so the user never sees their sentence twice.
                        pendingUserMessage = _uiState.value.pendingUserMessage
                            ?.takeIf { pending -> messages.none { it.content == pending } },
                    )
                }
        }
    }

    /**
     * Adopt the most recent session, or open one. Offline this fails and the
     * screen falls back to cached history with the composer disabled.
     */
    private fun bootstrap() {
        viewModelScope.launch {
            val refreshed = chatRepository.refreshSessions()
            if (refreshed is ApiResult.Failure) {
                _uiState.value = _uiState.value.copy(bootstrapFailed = true)
            }
            // Room is authoritative for "which conversation am I in" so an
            // offline launch still opens the last one rather than a blank slate.
            val existing = chatRepository.sessions().first().firstOrNull()?.id
            if (existing != null) {
                adopt(existing)
            } else {
                openNewSession()
            }
        }
    }

    private suspend fun openNewSession() {
        when (val created = chatRepository.createSession()) {
            is ApiResult.Success -> {
                sessionIdFlow.value = created.data.session.id
                _uiState.value = _uiState.value.copy(
                    loading = false,
                    bootstrapFailed = false,
                    sessionId = created.data.session.id,
                    suggestedPrompts = created.data.suggestedPrompts,
                )
                chatRepository.refreshMessages(created.data.session.id)
            }
            is ApiResult.Failure -> {
                _uiState.value = _uiState.value.copy(loading = false, bootstrapFailed = true)
            }
        }
    }

    private suspend fun adopt(sessionId: String) {
        sessionIdFlow.value = sessionId
        _uiState.value = _uiState.value.copy(
            loading = false,
            sessionId = sessionId,
        )
        chatRepository.refreshMessages(sessionId)
    }

    private fun loadActiveCoach() {
        viewModelScope.launch {
            when (val roster = coachesRepository.refreshRoster()) {
                is ApiResult.Success ->
                    _uiState.value = _uiState.value.copy(
                        persona = CoachRoster.resolve(roster.data.activeCoachId),
                    )
                // The default persona is already on screen; a failed roster
                // fetch must not blank the byline mid-conversation.
                is ApiResult.Failure -> Unit
            }
        }
    }

    // -----------------------------------------------------------------------
    // Sending
    // -----------------------------------------------------------------------

    fun send(content: String) {
        val text = content.trim()
        val sessionId = _uiState.value.sessionId
        if (text.isEmpty() || sessionId == null || _uiState.value.streaming) return

        val knownAssistantIds = _uiState.value.messages
            .filter { it.role == ROLE_ASSISTANT }
            .map { it.id }
            .toSet()

        _uiState.value = _uiState.value.copy(
            streaming = true,
            streamingText = "",
            pendingUserMessage = text,
            lastAttempt = text,
            turnFailure = null,
        )

        viewModelScope.launch {
            val result = runner.run(
                sessionId = sessionId,
                content = text,
                knownAssistantIds = knownAssistantIds,
            ) { token ->
                _uiState.value = _uiState.value.copy(
                    streamingText = _uiState.value.streamingText + token,
                )
            }
            _uiState.value = _uiState.value.copy(
                streaming = false,
                streamingText = "",
                turnFailure = when (result) {
                    ChatTurnResult.Unavailable -> TurnFailure.Unavailable
                    ChatTurnResult.Dropped -> TurnFailure.Dropped
                    // Safety refusals are already in history as supportive
                    // assistant messages; surfacing a frame too shows them twice.
                    else -> null
                },
                pendingUserMessage = when (result) {
                    ChatTurnResult.Unavailable -> _uiState.value.pendingUserMessage
                    else -> null
                },
            )
        }
    }

    /** Re-send the last thing that failed. */
    fun retryLast() {
        val text = _uiState.value.lastAttempt ?: return
        _uiState.value = _uiState.value.copy(turnFailure = null, pendingUserMessage = null)
        send(text)
    }

    fun dismissTurnFailure() {
        _uiState.value = _uiState.value.copy(turnFailure = null, pendingUserMessage = null)
    }

    // -----------------------------------------------------------------------
    // Report (Play AI-generated-content control)
    // -----------------------------------------------------------------------

    fun report(messageId: String) {
        viewModelScope.launch {
            val toast = when (chatRepository.reportMessage(messageId)) {
                is ApiResult.Success -> {
                    _uiState.value.sessionId?.let { chatRepository.refreshMessages(it) }
                    CoachToast.ReportDone
                }
                is ApiResult.Failure -> CoachToast.ReportFailed
            }
            _events.send(CoachEvent.Toast(toast))
        }
    }

    // -----------------------------------------------------------------------
    // Chat-native meal logging
    // -----------------------------------------------------------------------

    /**
     * Restore a proposal the user left hanging. Drafts live on the server
     * precisely so a process death between "propose" and "confirm" does not
     * cost a credit and a retyped sentence.
     */
    private fun restorePendingDraft() {
        viewModelScope.launch {
            val result = chatRepository.mealDrafts()
            if (result is ApiResult.Success) {
                val pending = result.data.drafts.firstOrNull {
                    it.status == ChatMealDraftStatus.PROPOSED || it.status == ChatMealDraftStatus.EMPTY
                }
                if (pending != null && _uiState.value.draft == null) {
                    _uiState.value = _uiState.value.copy(draft = pending)
                    _events.send(CoachEvent.Toast(CoachToast.DraftRestored))
                }
            }
        }
    }

    /** The explicit "log this as a meal" action. Never called from [send]. */
    fun proposeMeal(text: String) {
        val trimmed = text.trim()
        if (trimmed.isEmpty() || _uiState.value.proposingDraft) return
        _uiState.value = _uiState.value.copy(proposingDraft = true)
        viewModelScope.launch {
            val result = chatRepository.createMealDraft(
                text = trimmed,
                mealType = null,
                sessionId = _uiState.value.sessionId,
            )
            _uiState.value = when (result) {
                is ApiResult.Success ->
                    _uiState.value.copy(proposingDraft = false, draft = result.data.draft)
                is ApiResult.Failure -> {
                    _events.send(CoachEvent.Toast(CoachToast.ProposeFailed))
                    _uiState.value.copy(proposingDraft = false)
                }
            }
        }
    }

    fun confirmDraft(confirmation: MealDraftConfirmation) {
        val draft = _uiState.value.draft ?: return
        if (confirmation.selections.isEmpty()) return
        _uiState.value = _uiState.value.copy(draftPending = true)
        viewModelScope.launch {
            val body = ConfirmMealDraftRequest(
                selections = confirmation.selections.map {
                    MealDraftSelection(
                        itemId = it.itemId,
                        foodId = it.foodId,
                        grams = it.grams.toDouble(),
                    )
                },
                mealType = confirmation.mealType,
                acknowledgeAllergens = confirmation.acknowledgeAllergens,
            )
            when (chatRepository.confirmMealDraft(draft.id, body)) {
                is ApiResult.Success -> {
                    _uiState.value = _uiState.value.copy(draftPending = false, draft = null)
                    _events.send(CoachEvent.Toast(CoachToast.MealLogged))
                    _events.send(CoachEvent.MealLogged)
                }
                is ApiResult.Failure -> {
                    _uiState.value = _uiState.value.copy(draftPending = false)
                    _events.send(CoachEvent.Toast(CoachToast.DraftFailed))
                }
            }
        }
    }

    fun dismissDraft() {
        val draft = _uiState.value.draft ?: return
        _uiState.value = _uiState.value.copy(draft = null)
        viewModelScope.launch { chatRepository.dismissMealDraft(draft.id) }
    }

    fun openManualLogging() {
        viewModelScope.launch { _events.send(CoachEvent.OpenManualLogging) }
    }

    // -----------------------------------------------------------------------
    // Housekeeping
    // -----------------------------------------------------------------------

    /** Today's local date, for anything that needs to key by the user's day. */
    fun today(): String = LocalDates.today()

    private companion object {
        const val ROLE_ASSISTANT = "assistant"
    }
}
