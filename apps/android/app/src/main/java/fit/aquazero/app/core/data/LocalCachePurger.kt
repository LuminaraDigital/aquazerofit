package fit.aquazero.app.core.data

import fit.aquazero.app.core.database.ChatDao
import fit.aquazero.app.core.database.LogsDao
import fit.aquazero.app.core.database.OutboxDao
import fit.aquazero.app.core.database.ProgressDao
import fit.aquazero.app.core.database.TrainingDao
import fit.aquazero.app.core.database.UserDao
import fit.aquazero.app.core.database.UserOverlayDao
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Wipes user-scoped Room caches on logout and on different-user sign-in.
 *
 * Catalog tables (foods corpus, exercises, recipes) survive account switch;
 * per-user overlays on catalog (coach unlock state, food recency) are cleared.
 * Forced logout (token-family revocation) does not call this: the outbox and
 * cache stay so the same user can resume after re-authenticating.
 */
@Singleton
class LocalCachePurger @Inject constructor(
    private val logsDao: LogsDao,
    private val outboxDao: OutboxDao,
    private val userDao: UserDao,
    private val trainingDao: TrainingDao,
    private val progressDao: ProgressDao,
    private val chatDao: ChatDao,
    private val userOverlayDao: UserOverlayDao,
    private val syncScheduler: SyncScheduler,
) {

    /** Cached account id, or null when the singleton user row is empty. */
    suspend fun cachedUserId(): String? = userDao.userOnce()?.id

    /** Different-user sign-in: drop all user data and the entire outbox. */
    suspend fun purgeForDifferentUser() = purgeUserScoped(includeOutbox = true)

    /** User-initiated logout after the outbox gate: same wipe as above. */
    suspend fun purgeOnUserLogout() = purgeUserScoped(includeOutbox = true)

    private suspend fun purgeUserScoped(includeOutbox: Boolean) {
        syncScheduler.cancelPendingSync()
        logsDao.clearAllLogs()
        userDao.clearAllAccountRows()
        trainingDao.clearAllTraining()
        progressDao.clearAllProgress()
        chatDao.clearAllChatAndChallenges()
        userOverlayDao.clearAll()
        if (includeOutbox) outboxDao.clearAll()
    }
}
