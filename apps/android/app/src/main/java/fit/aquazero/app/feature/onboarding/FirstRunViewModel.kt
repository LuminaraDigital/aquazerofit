package fit.aquazero.app.feature.onboarding

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import fit.aquazero.app.core.data.AccountRepository
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** What the first-run home needs to greet someone by name. */
data class FirstRunUiState(
    val firstName: String? = null,
)

/**
 * The no-profile home state.
 *
 * There is deliberately almost nothing here: the account is already inside the
 * product, and the three destinations the screen offers all work with no
 * profile at all. The one thing that genuinely cannot work — a daily target —
 * says so rather than inventing a number.
 */
@HiltViewModel
class FirstRunViewModel @Inject constructor(
    private val accountRepository: AccountRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(FirstRunUiState())
    val uiState: StateFlow<FirstRunUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            accountRepository.refreshMe()
            accountRepository.user().collect { user ->
                _uiState.value = FirstRunUiState(
                    firstName = user?.displayName?.trim()?.substringBefore(' ')?.ifBlank { null },
                )
            }
        }
    }
}
