package fit.aquazero.app.core.sync

import fit.aquazero.app.core.data.OutboxRepository
import fit.aquazero.app.core.data.SyncScheduler
import fit.aquazero.app.core.database.LogsDao
import fit.aquazero.app.core.network.api.LogsApi
import fit.aquazero.app.core.telemetry.CrashReporter
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Foreground outbox drain for user-initiated logout (plan §4.2).
 *
 * WorkManager owns background drains; this runs synchronously on the main
 * ViewModel scope so Settings can show progress before asking the user to
 * abandon unsynced entries.
 */
@Singleton
class OutboxDrainCoordinator @Inject constructor(
    private val outboxRepository: OutboxRepository,
    private val logsDao: LogsDao,
    private val logsApi: LogsApi,
    private val syncScheduler: SyncScheduler,
    private val crashReporter: CrashReporter,
) {

    /**
     * Drain until nothing is pending or [maxPasses] is exhausted.
     *
     * @return how many ops are still QUEUED, IN_FLIGHT or FAILED.
     */
    suspend fun drainForLogout(maxPasses: Int = MAX_LOGOUT_DRAIN_PASSES): Int {
        repeat(maxPasses) {
            val pending = outboxRepository.pendingCountOnce()
            if (pending == 0) return 0
            outboxDrainer().drain()
        }
        return outboxRepository.pendingCountOnce()
    }

    private fun outboxDrainer() = OutboxDrainer(
        outboxRepository = outboxRepository,
        logsDao = logsDao,
        logsApi = logsApi,
        syncScheduler = syncScheduler,
        crashReporter = crashReporter,
    )

    private companion object {
        /**
         * Enough passes to clear a small backlog through transient failures
         * without holding the sign-out button for minutes.
         */
        const val MAX_LOGOUT_DRAIN_PASSES = 8
    }
}
