package fit.aquazero.app

import android.app.Application
import androidx.hilt.work.HiltWorkerFactory
import androidx.work.Configuration
import dagger.hilt.android.HiltAndroidApp
import fit.aquazero.app.core.sync.WorkManagerSyncScheduler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import javax.inject.Inject

/**
 * Application entry point. Registers the Hilt-aware [androidx.work.WorkerFactory]
 * so `@HiltWorker` workers (sync, uploads) can receive constructor injection,
 * and starts the connectivity-driven sync trigger. WorkManager's automatic
 * initializer is removed in the manifest; it initializes on demand using this
 * configuration.
 */
@HiltAndroidApp
class AzfApplication : Application(), Configuration.Provider {

    @Inject
    lateinit var workerFactory: HiltWorkerFactory

    @Inject
    lateinit var syncScheduler: WorkManagerSyncScheduler

    private val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setWorkerFactory(workerFactory)
            .build()

    override fun onCreate() {
        super.onCreate()
        // Connectivity regained → drain the outbox (plan §4.2).
        syncScheduler.observeConnectivity(appScope)
    }
}
