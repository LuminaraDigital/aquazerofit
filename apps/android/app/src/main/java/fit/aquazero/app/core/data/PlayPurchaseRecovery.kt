package fit.aquazero.app.core.data

import fit.aquazero.app.core.auth.AuthState
import fit.aquazero.app.core.auth.SessionManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import javax.inject.Inject
import javax.inject.Provider
import javax.inject.Singleton

/**
 * Settles outstanding Play purchases once a session exists.
 *
 * The case this covers is someone who paid and then closed the app — mid-sheet,
 * or afterwards while verification was failing. Google auto-refunds a purchase
 * that is never acknowledged after three days, so without a check at start
 * their money is taken, quietly returned, and premium never appears; the app
 * would spend those three days showing them the free tier and no reason for it.
 *
 * Gated on a real session because `POST /billing/play/verify` is Bearer-only:
 * running it while signed out would burn the attempt on a guaranteed 401 and
 * leave the purchase exactly as unacknowledged as it was.
 */
@Singleton
class PlayPurchaseRecovery @Inject constructor(
    /**
     * [Provider]s for the same reason `TelemetryConsentGate` uses them: this is
     * injected into the application, and resolving these eagerly would drag
     * Retrofit, Room and a Play service binding into `onCreate` on the main
     * thread. They are resolved inside the coroutine instead.
     */
    private val sessionManager: Provider<SessionManager>,
    private val billingRepository: Provider<BillingRepository>,
    private val accountRepository: Provider<AccountRepository>,
) {

    /** Start following the session. Called once from the application scope. */
    fun start(scope: CoroutineScope) {
        scope.launch {
            sessionManager.get().authState
                .map { it is AuthState.SignedIn }
                .distinctUntilChanged()
                .collect { signedIn ->
                    if (!signedIn) return@collect
                    // Only a server-confirmed grant is worth a refresh; every
                    // other outcome leaves entitlements exactly as they were.
                    if (billingRepository.get().restorePremiumPurchases() == BillingOutcome.Verified) {
                        accountRepository.get().refreshEntitlements()
                    }
                }
        }
    }
}
