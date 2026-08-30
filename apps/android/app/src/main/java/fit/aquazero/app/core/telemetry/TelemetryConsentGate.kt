package fit.aquazero.app.core.telemetry

import fit.aquazero.app.core.data.AccountRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import javax.inject.Inject
import javax.inject.Provider
import javax.inject.Singleton

/**
 * Holds telemetry collection to the user's `anonymisedAnalytics` consent.
 *
 * Both Firebase SDKs collect by default once they are on the classpath, which
 * is the whole problem: the app already asks for this consent, defaults it to
 * off, and lets it be withdrawn in Settings, and adding a dependency should not
 * quietly overrule that. The SDKs are therefore started disabled in the
 * manifest and only ever enabled from here.
 *
 * Crash reporting is gated on the same bit as analytics. That is the
 * conservative reading — a diagnostic upload is still processing — and it is
 * deliberately one decision in one place: if a DPA later concludes crash
 * diagnostics rest on legitimate interest rather than consent, this is the
 * line that changes, not the reporting call sites.
 */
@Singleton
class TelemetryConsentGate @Inject constructor(
    /**
     * A [Provider], because this gate is injected into the application and
     * would otherwise drag the repository — and behind it Retrofit and the Room
     * database — into `onCreate` on the main thread. Resolved inside the
     * coroutine below instead, where that cost is off the startup path.
     */
    private val accountRepository: Provider<AccountRepository>,
    private val collection: TelemetryCollection,
) {

    /**
     * Start following consent. Called once from the application scope.
     *
     * A null consent row — signed out, or not yet fetched — reads as "no
     * consent", so the fail-safe direction is off.
     */
    fun start(scope: CoroutineScope) {
        scope.launch {
            accountRepository.get().consents()
                .map { it?.anonymisedAnalytics == true }
                .distinctUntilChanged()
                .collect(collection::setEnabled)
        }
    }
}
