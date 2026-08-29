package fit.aquazero.app.core.sync

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import dagger.hilt.android.qualifiers.ApplicationContext
import fit.aquazero.app.core.data.SyncScheduler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.launch
import java.time.Duration
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Enqueues the unique sync worker: on every offline write, and whenever
 * connectivity returns. Network-constrained with exponential backoff;
 * 429 `Retry-After` re-schedules with an explicit delay.
 */
@Singleton
class WorkManagerSyncScheduler @Inject constructor(
    @ApplicationContext private val context: Context,
    private val connectivityMonitor: ConnectivityMonitor,
) : SyncScheduler {

    /** Ask for a drain now (called after every offline write). */
    override fun requestSync(initialDelaySeconds: Long) {
        val request = OneTimeWorkRequestBuilder<SyncWorker>()
            .setConstraints(
                Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build(),
            )
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, Duration.ofSeconds(30))
            .setInitialDelay(Duration.ofSeconds(initialDelaySeconds))
            .build()
        WorkManager.getInstance(context)
            .enqueueUniqueWork(UNIQUE_WORK_NAME, ExistingWorkPolicy.KEEP, request)
    }

    /**
     * Start reacting to connectivity: every offline→online transition
     * requests a drain. Called once from the Application scope.
     */
    fun observeConnectivity(scope: CoroutineScope) {
        scope.launch {
            connectivityMonitor.isOnline.distinctUntilChanged().collect { online ->
                if (online) requestSync()
            }
        }
    }

    companion object {
        /** Unique work name — one drain at a time, ever. */
        const val UNIQUE_WORK_NAME: String = "azf-outbox-sync"
    }
}
