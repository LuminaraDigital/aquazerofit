package fit.aquazero.app.feature.coach

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import fit.aquazero.app.core.data.ChatRepository
import fit.aquazero.app.core.database.ChatMessageEntity
import fit.aquazero.app.core.network.ApiResult
import fit.aquazero.app.core.network.ChatStreamEvent
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

@HiltViewModel
class CoachViewModel @Inject constructor(
    private val chatRepository: ChatRepository,
) : ViewModel() {

    private val _sessionId = MutableStateFlow<String?>(null)
    val sessionId: StateFlow<String?> = _sessionId

    val messages: StateFlow<List<ChatMessageEntity>> = _sessionId
        .flatMapLatest { id ->
            if (id != null) chatRepository.messages(id)
            else kotlinx.coroutines.flow.flowOf(emptyList())
        }
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5000),
            initialValue = emptyList(),
        )

    private val _isStreaming = MutableStateFlow(false)
    val isStreaming: StateFlow<Boolean> = _isStreaming

    private val _streamingText = MutableStateFlow("")
    val streamingText: StateFlow<String> = _streamingText

    init {
        viewModelScope.launch {
            chatRepository.refreshSessions()
            // Just use the latest session for now
            chatRepository.sessions().onEach { sessions ->
                if (_sessionId.value == null && sessions.isNotEmpty()) {
                    _sessionId.value = sessions.first().id
                    chatRepository.refreshMessages(sessions.first().id)
                } else if (_sessionId.value == null) {
                    when (val result = chatRepository.createSession()) {
                        is ApiResult.Success -> {
                            _sessionId.value = result.data.session.id
                        }
                        else -> { /* error handling */ }
                    }
                }
            }.stateIn(viewModelScope)
        }
    }

    fun sendMessage(content: String) {
        val id = _sessionId.value ?: return
        viewModelScope.launch {
            _isStreaming.value = true
            _streamingText.value = ""
            chatRepository.stream(id, content).collect { event ->
                when (event) {
                    is ChatStreamEvent.Token -> {
                        _streamingText.value += event.text
                    }
                    is ChatStreamEvent.Done -> {
                        _isStreaming.value = false
                        _streamingText.value = ""
                        chatRepository.refreshMessages(id)
                    }
                    is ChatStreamEvent.Error -> {
                        _isStreaming.value = false
                        // handle error
                    }
                    else -> {}
                }
            }
        }
    }
}
