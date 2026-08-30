package fit.aquazero.app.feature.settings

import android.app.Activity
import androidx.annotation.StringRes
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import fit.aquazero.app.R
import fit.aquazero.app.core.data.AccountRepository
import fit.aquazero.app.core.data.BillingFailure
import fit.aquazero.app.core.data.BillingOutcome
import fit.aquazero.app.core.data.BillingRepository
import fit.aquazero.app.core.data.PremiumOffer
import fit.aquazero.app.core.model.ApiResult
import fit.aquazero.app.core.model.AzfJson
import fit.aquazero.app.core.model.EntitlementsDto
import fit.aquazero.app.core.model.UserTier
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Immutable state of the plan screen. */
data class PlanUiState(
    val loading: Boolean = true,
    val entitlements: EntitlementsDto? = null,
    val failed: Boolean = false,
    /** Play's price for the subscription; null until it loads, or when Play cannot quote one. */
    val offer: PremiumOffer? = null,
    val offerLoading: Boolean = true,
    /** Play's sheet is open, or the purchase behind it is still being verified. */
    val purchasing: Boolean = false,
) {
    val premium: Boolean get() = entitlements?.tier == UserTier.PREMIUM

    /**
     * Denominator for the credit bar, never smaller than the balance: unspent
     * credits bank up to the server's `maxBankedCredits`, which today is twice
     * a day's grant, so a saved-up balance must not overflow the track. The
     * scale stays the daily grant rather than the ceiling — a full day's grant
     * reading as a half-empty bar would misreport a balance nothing is wrong
     * with.
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

/** One-shot effects. */
sealed interface PlanEvent {
    data class Message(@param:StringRes val messageRes: Int, val isError: Boolean = false) : PlanEvent
}

/**
 * Your plan — tier, daily AI credits, what each AI action costs, and the one
 * thing this app sells.
 *
 * The premium subscription is bought through Google Play. Nothing here decides
 * a tier: a purchase produces a token, the server verifies it, and this screen
 * then re-reads `/me/entitlements` and renders whatever came back. A tier flip
 * the client could make on its own would be an entitlement any caller could
 * grant themselves.
 *
 * Coach personas remain unpurchasable, here and everywhere — see
 * [fit.aquazero.app.feature.coach.CoachSelectViewModel]. What premium changes
 * is still rendered from the server's own `premiumLanes` and `costs` rather
 * than from a hand-written feature list, which is a claim that goes stale
 * silently.
 */
@HiltViewModel
class PlanEntitlementsViewModel @Inject constructor(
    private val accountRepository: AccountRepository,
    private val billingRepository: BillingRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(PlanUiState())
    val uiState: StateFlow<PlanUiState> = _uiState.asStateFlow()

    private val _events = Channel<PlanEvent>(Channel.BUFFERED)
    val events: Flow<PlanEvent> = _events.receiveAsFlow()

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
        loadOffer()
    }

    /** Pull the live balance; the daily grant is applied server-side on read. */
    fun refresh() {
        _uiState.value = _uiState.value.copy(failed = false)
        viewModelScope.launch {
            when (val result = accountRepository.refreshEntitlements()) {
                is ApiResult.Success -> _uiState.value = _uiState.value.copy(
                    loading = false,
                    failed = false,
                    entitlements = result.data,
                )
                is ApiResult.Failure -> _uiState.value = _uiState.value.copy(
                    loading = false,
                    failed = _uiState.value.entitlements == null,
                )
            }
        }
    }

    /**
     * Ask Play what the subscription costs. Kept off [refresh] because the two
     * fail independently: a device without Play billing still has a plan to
     * show, and a server outage does not stop Play quoting a price.
     */
    private fun loadOffer() {
        viewModelScope.launch {
            val offer = billingRepository.premiumOffer()
            _uiState.value = _uiState.value.copy(offer = offer, offerLoading = false)
        }
    }

    /**
     * Buy premium.
     *
     * The entitlement is never assumed here. A verified purchase only triggers
     * [refresh] — whatever the server then reports is what the screen shows,
     * including the case where it reports the user is still on free.
     */
    fun upgrade(activity: Activity) {
        if (_uiState.value.purchasing) return
        _uiState.value = _uiState.value.copy(purchasing = true)
        viewModelScope.launch {
            val outcome = billingRepository.purchasePremium(activity)
            _uiState.value = _uiState.value.copy(purchasing = false)
            when (outcome) {
                BillingOutcome.Verified -> {
                    refresh()
                    _events.send(PlanEvent.Message(R.string.plan_upgrade_done))
                }
                // Backing out of Play's sheet is a decision, not a fault. It
                // gets no toast: telling someone their deliberate cancellation
                // "failed" is how an app argues with a person.
                BillingOutcome.Cancelled -> Unit
                BillingOutcome.AwaitingPayment ->
                    _events.send(PlanEvent.Message(R.string.plan_upgrade_pending))
                // Play reported success with nothing to settle. Rare, and
                // nothing was granted, so it is reported rather than swallowed.
                BillingOutcome.NothingToSettle ->
                    _events.send(PlanEvent.Message(R.string.plan_upgrade_failed, isError = true))
                is BillingOutcome.Failed ->
                    _events.send(PlanEvent.Message(messageFor(outcome.reason), isError = true))
            }
        }
    }

    /**
     * Each failure gets its own sentence, because each leaves the user's money
     * somewhere different and only they can judge what to do about it.
     */
    @StringRes
    private fun messageFor(reason: BillingFailure): Int = when (reason) {
        BillingFailure.PLAY_UNAVAILABLE -> R.string.plan_upgrade_play_unavailable
        BillingFailure.PRODUCT_UNAVAILABLE -> R.string.plan_upgrade_play_unavailable
        BillingFailure.REJECTED -> R.string.plan_upgrade_rejected
        BillingFailure.VERIFY_UNAVAILABLE -> R.string.plan_upgrade_verify_later
        BillingFailure.OFFLINE -> R.string.plan_upgrade_offline
        BillingFailure.UNKNOWN -> R.string.plan_upgrade_failed
    }
}
