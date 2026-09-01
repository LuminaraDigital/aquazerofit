package fit.aquazero.app.feature.settings

import androidx.annotation.StringRes
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import fit.aquazero.app.R
import fit.aquazero.app.core.data.AccountRepository
import fit.aquazero.app.core.data.MemoryRepository
import fit.aquazero.app.core.model.ApiResult
import fit.aquazero.app.core.model.MemoryFactCategory
import fit.aquazero.app.core.model.MemoryFactDto
import fit.aquazero.app.core.model.MemoryFactStatus
import fit.aquazero.app.core.model.UserMemoryDto
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Immutable state of the coach-memory screen. */
data class MemoryUiState(
    val loading: Boolean = true,
    val memory: UserMemoryDto? = null,
    /**
     * The cached `aiPersonalisation` bit; null until consents have loaded.
     * Kept separate from [serverRefused] because either alone is enough to
     * know the feature is paused, and neither is authoritative on its own —
     * the cached bit can be stale, and the server is only consulted on a call.
     */
    val consentAllows: Boolean? = null,
    /** The server answered `CONSENT_REQUIRED` on a memory route. */
    val serverRefused: Boolean = false,
    val loadFailed: Boolean = false,
    /** A mutation is in flight; the destructive controls stand down. */
    val busy: Boolean = false,
    val draftText: String = "",
    val draftCategory: MemoryFactCategory = MemoryFactCategory.PREFERENCE,
    val adding: Boolean = false,
    val editingFactId: String? = null,
    val editingText: String = "",
    val rejectedExpanded: Boolean = false,
    val showForgetDialog: Boolean = false,
) {
    /** True when memory is paused rather than broken. */
    val consentOff: Boolean get() = serverRefused || consentAllows == false

    private val facts: List<MemoryFactDto> get() = memory?.facts.orEmpty()

    val suggested: List<MemoryFactDto>
        get() = facts.filter { it.status == MemoryFactStatus.SUGGESTED }

    val confirmed: List<MemoryFactDto>
        get() = facts.filter { it.status == MemoryFactStatus.CONFIRMED }

    val rejected: List<MemoryFactDto>
        get() = facts.filter { it.status == MemoryFactStatus.REJECTED }

    val isEmpty: Boolean get() = facts.isEmpty()

    val summary: String get() = memory?.summary?.trim().orEmpty()

    val canForget: Boolean get() = !busy && memory != null

    val canAdd: Boolean get() = draftText.isNotBlank() && !adding
}

/** One-shot effects. */
sealed interface MemoryEvent {
    data class Message(@param:StringRes val messageRes: Int, val isError: Boolean = false) : MemoryEvent
}

/**
 * Coach memory: review, reword, delete, wipe.
 *
 * Status changes and deletions are optimistic. A fact jumps between the
 * "needs review", "remembered" and "rejected" sections the instant it is
 * tapped, and jumps back if the request fails — a confirm that waits on a
 * round trip reads as a control that did not respond, and people tap it again.
 *
 * Adding is deliberately *not* optimistic: the server assigns the id and the
 * timestamps, and a locally-invented fact that then fails to save is a memory
 * the user believes their coach has.
 */
@HiltViewModel
class MemoryViewModel @Inject constructor(
    private val memoryRepository: MemoryRepository,
    private val accountRepository: AccountRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(MemoryUiState())
    val uiState: StateFlow<MemoryUiState> = _uiState.asStateFlow()

    private val _events = Channel<MemoryEvent>(Channel.BUFFERED)
    val events: Flow<MemoryEvent> = _events.receiveAsFlow()

    init {
        viewModelScope.launch {
            accountRepository.consents().collect { consents ->
                if (consents == null) return@collect
                _uiState.value = _uiState.value.copy(
                    consentAllows = consents.aiPersonalisation,
                    loading = if (consents.aiPersonalisation) _uiState.value.loading else false,
                )
            }
        }
        viewModelScope.launch { accountRepository.refreshConsents() }
        load()
    }

    /** Load the memory doc. Safe to call again from the retry affordance. */
    fun load() {
        _uiState.value = _uiState.value.copy(loading = true, loadFailed = false)
        viewModelScope.launch {
            when (val result = memoryRepository.memory()) {
                is ApiResult.Success -> _uiState.value = _uiState.value.copy(
                    loading = false,
                    memory = result.data,
                    serverRefused = false,
                    loadFailed = false,
                )
                is ApiResult.Failure -> {
                    val refused = result.isConsentRequired()
                    _uiState.value = _uiState.value.copy(
                        loading = false,
                        serverRefused = refused,
                        loadFailed = !refused,
                    )
                }
            }
        }
    }

    // ----- review -----

    /** Confirm or reject a fact, optimistically. */
    fun setStatus(fact: MemoryFactDto, status: MemoryFactStatus) {
        mutate(
            optimistic = { memory ->
                memory.copy(
                    facts = memory.facts.map {
                        if (it.id == fact.id) it.copy(status = status) else it
                    },
                )
            },
            call = { memoryRepository.setFactStatus(fact.id, status) },
            successRes = when (status) {
                MemoryFactStatus.CONFIRMED -> R.string.memory_kept
                MemoryFactStatus.REJECTED -> R.string.memory_rejected_toast
                MemoryFactStatus.SUGGESTED -> R.string.memory_updated
            },
            failureRes = R.string.memory_update_failed,
        )
    }

    /** Delete a fact, optimistically. */
    fun deleteFact(fact: MemoryFactDto) {
        mutate(
            optimistic = { memory ->
                memory.copy(facts = memory.facts.filterNot { it.id == fact.id })
            },
            call = { memoryRepository.deleteFact(fact.id) },
            successRes = R.string.memory_deleted,
            failureRes = R.string.memory_delete_failed,
        )
    }

    // ----- editing one fact -----

    fun startEditing(fact: MemoryFactDto) {
        _uiState.value = _uiState.value.copy(editingFactId = fact.id, editingText = fact.text)
    }

    fun onEditingTextChange(text: String) {
        _uiState.value = _uiState.value.copy(
            editingText = text.take(MemoryRepository.MAX_FACT_CHARS),
        )
    }

    fun cancelEditing() {
        _uiState.value = _uiState.value.copy(editingFactId = null, editingText = "")
    }

    /** Save a reworded fact, optimistically. */
    fun saveEditing() {
        val state = _uiState.value
        val factId = state.editingFactId ?: return
        val text = state.editingText.trim()
        if (text.isEmpty()) return
        _uiState.value = state.copy(editingFactId = null, editingText = "")
        mutate(
            optimistic = { memory ->
                memory.copy(
                    facts = memory.facts.map {
                        if (it.id == factId) it.copy(text = text) else it
                    },
                )
            },
            call = { memoryRepository.setFactText(factId, text) },
            successRes = R.string.memory_updated,
            failureRes = R.string.memory_update_failed,
        )
    }

    // ----- adding -----

    fun onDraftTextChange(text: String) {
        _uiState.value = _uiState.value.copy(
            draftText = text.take(MemoryRepository.MAX_FACT_CHARS),
        )
    }

    fun onDraftCategoryChange(category: MemoryFactCategory) {
        _uiState.value = _uiState.value.copy(draftCategory = category)
    }

    /** Add a fact the user asserted directly. Waits for the server. */
    fun addFact() {
        val state = _uiState.value
        val text = state.draftText.trim()
        if (text.isEmpty() || state.adding) return
        _uiState.value = state.copy(adding = true)
        viewModelScope.launch {
            when (val result = memoryRepository.addFact(text, state.draftCategory)) {
                is ApiResult.Success -> {
                    // The category is deliberately kept: someone adding one
                    // constraint is usually adding two.
                    _uiState.value = _uiState.value.copy(
                        adding = false,
                        draftText = "",
                        memory = result.data,
                    )
                    emit(R.string.memory_added)
                }
                is ApiResult.Failure -> {
                    _uiState.value = _uiState.value.copy(
                        adding = false,
                        serverRefused = result.isConsentRequired() ||
                            _uiState.value.serverRefused,
                    )
                    emit(
                        if (result.isConsentRequired()) {
                            R.string.memory_add_consent_failed
                        } else {
                            R.string.memory_add_failed
                        },
                        isError = true,
                    )
                }
            }
        }
    }

    // ----- wipe -----

    fun toggleRejected() {
        _uiState.value = _uiState.value.copy(rejectedExpanded = !_uiState.value.rejectedExpanded)
    }

    fun showForgetDialog() {
        _uiState.value = _uiState.value.copy(showForgetDialog = true)
    }

    fun dismissForgetDialog() {
        _uiState.value = _uiState.value.copy(showForgetDialog = false)
    }

    /** Wipe the whole doc. Not optimistic — this one is worth confirming twice. */
    fun forgetEverything() {
        if (_uiState.value.busy) return
        _uiState.value = _uiState.value.copy(busy = true)
        viewModelScope.launch {
            val result = memoryRepository.clearMemory()
            _uiState.value = _uiState.value.copy(busy = false, showForgetDialog = false)
            if (result is ApiResult.Success) {
                emit(R.string.memory_cleared)
                load()
            } else {
                emit(R.string.memory_clear_failed, isError = true)
            }
        }
    }

    /**
     * Apply [optimistic] immediately, then reconcile: the server's whole doc
     * replaces the local one on success, and the pre-mutation snapshot is
     * restored on failure.
     */
    private fun mutate(
        optimistic: (UserMemoryDto) -> UserMemoryDto,
        call: suspend () -> ApiResult<UserMemoryDto>,
        @StringRes successRes: Int,
        @StringRes failureRes: Int,
    ) {
        val snapshot = _uiState.value.memory ?: return
        _uiState.value = _uiState.value.copy(memory = optimistic(snapshot), busy = true)
        viewModelScope.launch {
            when (val result = call()) {
                is ApiResult.Success -> {
                    _uiState.value = _uiState.value.copy(memory = result.data, busy = false)
                    emit(successRes)
                }
                is ApiResult.Failure -> {
                    _uiState.value = _uiState.value.copy(memory = snapshot, busy = false)
                    emit(failureRes, isError = true)
                }
            }
        }
    }

    private fun emit(@StringRes messageRes: Int, isError: Boolean = false) {
        viewModelScope.launch { _events.send(MemoryEvent.Message(messageRes, isError)) }
    }
}

/** True when a failure is the memory consent gate rather than a transport problem. */
fun ApiResult.Failure.isConsentRequired(): Boolean =
    this is ApiResult.Failure.Api && code == MemoryRepository.CONSENT_REQUIRED
