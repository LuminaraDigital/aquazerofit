package fit.aquazero.app.feature.challenges

import androidx.annotation.StringRes
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import fit.aquazero.app.R
import fit.aquazero.app.core.data.ChallengesRepository
import fit.aquazero.app.core.model.ApiResult
import fit.aquazero.app.core.model.BuddyChallengeDto
import fit.aquazero.app.core.model.BuddyChallengeKind
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Immutable state of the buddy-huddles screen. */
data class ChallengesUiState(
    val loading: Boolean = true,
    val challenges: List<BuddyChallengeDto> = emptyList(),
    val loadFailed: Boolean = false,
    val kind: BuddyChallengeKind = BuddyChallengeKind.LOGGING_STREAK,
    val creating: Boolean = false,
    val joinCode: String = "",
    val joining: Boolean = false,
) {
    /** Cheap pre-flight so an obviously short code never costs a round trip. */
    val canJoin: Boolean
        get() = !joining && ChallengesRepository.isPlausibleCode(joinCode)

    val isEmpty: Boolean get() = challenges.isEmpty()
}

/** One-shot effects. */
sealed interface ChallengesEvent {
    data class Message(@param:StringRes val messageRes: Int, val isError: Boolean = false) :
        ChallengesEvent

    /** A message that carries a server-supplied value, such as the new code. */
    data class MessageWithArg(@param:StringRes val messageRes: Int, val arg: String) : ChallengesEvent

    /** Hand an invite code to the system share sheet. */
    data class ShareInvite(val code: String) : ChallengesEvent

    /** Put a code on the clipboard. */
    data class CopyCode(val code: String) : ChallengesEvent
}

/**
 * Buddy huddles — private, invite-only accountability.
 *
 * No public feed and no discovery: a huddle is reached only by its `AQUA-…`
 * code, which is a bearer capability the server draws from a CSPRNG. Four
 * members maximum, so the roster stays a group of people who actually know
 * each other.
 *
 * The wire enum is `logging_streak`, but nothing user-facing here says
 * "streak": a huddle counts show-up days, which only ever accumulate, and
 * missing a day takes nothing away (product invariant 2).
 */
@HiltViewModel
class ChallengesViewModel @Inject constructor(
    private val challengesRepository: ChallengesRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(ChallengesUiState())
    val uiState: StateFlow<ChallengesUiState> = _uiState.asStateFlow()

    private val _events = Channel<ChallengesEvent>(Channel.BUFFERED)
    val events: Flow<ChallengesEvent> = _events.receiveAsFlow()

    init {
        observeCached()
        load()
    }

    private fun observeCached() {
        viewModelScope.launch {
            challengesRepository.cachedChallenges().collect { cached ->
                if (cached.isNotEmpty()) {
                    _uiState.value = _uiState.value.copy(
                        challenges = cached,
                        loading = false,
                    )
                }
            }
        }
    }

    fun prefillJoinCode(code: String) {
        _uiState.value = _uiState.value.copy(joinCode = ChallengesRepository.normaliseCode(code))
    }

    /** Refresh the roster; safe to call again from the retry affordance. */
    fun load() {
        _uiState.value = _uiState.value.copy(loading = true, loadFailed = false)
        viewModelScope.launch {
            when (val result = challengesRepository.challenges()) {
                is ApiResult.Success -> _uiState.value = _uiState.value.copy(
                    loading = false,
                    challenges = result.data,
                    loadFailed = false,
                )
                is ApiResult.Failure -> _uiState.value = _uiState.value.copy(
                    loading = false,
                    loadFailed = true,
                )
            }
        }
    }

    fun setKind(kind: BuddyChallengeKind) {
        _uiState.value = _uiState.value.copy(kind = kind)
    }

    /** Create a huddle and surface its code straight away, ready to share. */
    fun create() {
        if (_uiState.value.creating) return
        _uiState.value = _uiState.value.copy(creating = true)
        viewModelScope.launch {
            when (val result = challengesRepository.create(_uiState.value.kind)) {
                is ApiResult.Success -> {
                    _uiState.value = _uiState.value.copy(creating = false)
                    _events.send(
                        ChallengesEvent.MessageWithArg(
                            R.string.challenges_created,
                            result.data.code,
                        ),
                    )
                    load()
                }
                is ApiResult.Failure -> {
                    _uiState.value = _uiState.value.copy(creating = false)
                    emit(R.string.challenges_create_failed, isError = true)
                }
            }
        }
    }

    /** Codes are typed in upper case as they are entered; spaces are dropped. */
    fun onJoinCodeChange(raw: String) {
        _uiState.value = _uiState.value.copy(
            joinCode = ChallengesRepository.normaliseCode(raw)
                .take(ChallengesRepository.MAX_CODE_LENGTH),
        )
    }

    /** Join by code. Server messages are preferred where the server has one. */
    fun join() {
        val state = _uiState.value
        if (!state.canJoin) {
            emit(R.string.challenges_code_too_short, isError = true)
            return
        }
        _uiState.value = state.copy(joining = true)
        viewModelScope.launch {
            when (val result = challengesRepository.join(state.joinCode)) {
                is ApiResult.Success -> {
                    _uiState.value = _uiState.value.copy(joining = false, joinCode = "")
                    emit(R.string.challenges_joined)
                    load()
                }
                is ApiResult.Failure -> {
                    _uiState.value = _uiState.value.copy(joining = false)
                    emit(R.string.challenges_join_failed, isError = true)
                }
            }
        }
    }

    fun shareInvite(challenge: BuddyChallengeDto) {
        viewModelScope.launch { _events.send(ChallengesEvent.ShareInvite(challenge.code)) }
    }

    fun copyCode(challenge: BuddyChallengeDto) {
        viewModelScope.launch { _events.send(ChallengesEvent.CopyCode(challenge.code)) }
    }

    private fun emit(@StringRes messageRes: Int, isError: Boolean = false) {
        viewModelScope.launch { _events.send(ChallengesEvent.Message(messageRes, isError)) }
    }
}
