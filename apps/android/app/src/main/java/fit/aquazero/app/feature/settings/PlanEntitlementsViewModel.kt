package fit.aquazero.app.feature.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import fit.aquazero.app.core.data.AccountRepository
import fit.aquazero.app.core.model.ApiResult
import fit.aquazero.app.core.model.AzfJson
import fit.aquazero.app.core.model.EntitlementsDto
import fit.aquazero.app.core.model.UserTier
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** Immutable state of the read-only plan screen. */
data class PlanUiState(
    val loading: Boolean = true,
    val entitlements: EntitlementsDto? = null,
    val failed: Boolean = false,
) {
    val premium: Boolean get() = entitlements?.tier == UserTier.PREMIUM

    /**
     * Denominator for the credit bar, never smaller than the balance: credits
     * carry over, so a saved-up balance must not overflow the track.
     */
    val creditFraction: Float
        get() {
            val e = entitlements ?: return 0f
            val scale = maxOf(e.dailyCredits, e.creditsRemaining, 1)
            return (e.creditsRemaining.coerceAtLeast(0).toFloat() / scale).coerceIn(0f, 1f)
        }

    /** Cost rows, ordered so the same list does not reshuffle between loads. */
    val costRows: List<Pair<String, Int>>
        get() = entitlements?.costs.orEmpty().toList().sortedBy { it.first }
}

/**
 * Your plan — tier, daily AI credits, and what each AI action costs.
 *
 * Strictly read-only. The app is free on Google Play and Telegram Stars is
 * stripped, so there is no purchase control here and no control that could
 * change a tier: with nothing to pay, a self-serve tier flip would be an
 * entitlement any caller could grant themselves. What premium changes is
 * rendered from the server's own `premiumLanes` and `costs` rather than from a
 * hand-written feature list, which is a claim that goes stale silently.
 */
@HiltViewModel
class PlanEntitlementsViewModel @Inject constructor(
    private val accountRepository: AccountRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(PlanUiState())
    val uiState: StateFlow<PlanUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            // Room first, so the last known position renders offline.
            accountRepository.entitlements().collect { cached ->
                val decoded = cached?.docJson?.let { json ->
                    runCatching {
                        AzfJson.decodeFromString(EntitlementsDto.serializer(), json)
                    }.getOrNull()
                }
                if (decoded != null && _uiState.value.entitlements == null) {
                    _uiState.value = _uiState.value.copy(entitlements = decoded, loading = false)
                }
            }
        }
        refresh()
    }

    /** Pull the live balance; the daily grant is applied server-side on read. */
    fun refresh() {
        _uiState.value = _uiState.value.copy(failed = false)
        viewModelScope.launch {
            when (val result = accountRepository.refreshEntitlements()) {
                is ApiResult.Success -> _uiState.value = PlanUiState(
                    loading = false,
                    entitlements = result.data,
                )
                is ApiResult.Failure -> _uiState.value = _uiState.value.copy(
                    loading = false,
                    failed = _uiState.value.entitlements == null,
                )
            }
        }
    }
}
