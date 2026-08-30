package fit.aquazero.app

import android.app.Application
import androidx.hilt.work.HiltWorkerFactory
import androidx.work.Configuration
import dagger.hilt.android.HiltAndroidApp
import fit.aquazero.app.core.data.PlayPurchaseRecovery
import fit.aquazero.app.core.sync.WorkManagerSyncScheduler
import fit.aquazero.app.core.telemetry.TelemetryConsentGate
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import javax.inject.Inject

/**
 * Application entry point. Registers the Hilt-aware [androidx.work.WorkerFactory]
 * so `@HiltWorker` workers (sync, uploads) can receive constructor injection,
 * starts the connectivity-driven sync trigger, binds telemetry collection to
 * the user's consent, and settles any Play purchase left outstanding by a
 * previous run. WorkManager's automatic initializer is removed in the
 * manifest; it initializes on demand using this configuration.
 */
@HiltAndroidApp
class AzfApplication : Application(), Configuration.Provider {

    @Inject
    lateinit var workerFactory: HiltWorkerFactory

    @Inject
    lateinit var syncScheduler: WorkManagerSyncScheduler

    @Inject
    lateinit var telemetryConsentGate: TelemetryConsentGate

    @Inject
    lateinit var playPurchaseRecovery: PlayPurchaseRecovery

    private val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setWorkerFactory(workerFactory)
            .build()

    override fun onCreate() {
        super.onCreate()
        // Connectivity regained → drain the outbox (plan §4.2).
        syncScheduler.observeConnectivity(appScope)
        // Telemetry stays off (per the manifest) until consent says otherwise.
        telemetryConsentGate.start(appScope)
        // A subscription paid for while the app was closed is verified and
        // acknowledged here, before Google's three-day auto-refund reverses it.
        playPurchaseRecovery.start(appScope)
    }
}
