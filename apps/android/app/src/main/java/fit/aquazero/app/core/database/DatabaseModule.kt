package fit.aquazero.app.core.database

import android.content.Context
import androidx.room3.Room
import androidx.room3.RoomDatabase
import androidx.sqlite.driver.AndroidSQLiteDriver
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.asCoroutineDispatcher
import java.util.concurrent.Executors
import javax.inject.Singleton

/**
 * Single-OS-thread query dispatcher for Room 3 + [AndroidSQLiteDriver].
 *
 * In `room3-runtime:3.0.2`, `TriggerBasedInvalidationTracker.syncTriggers`
 * acquires an OS-thread-bound `ReentrantLock` (`ObservedTableStates.onSyncLock`)
 * and then calls `PassthroughConnectionPool.useConnection`, whose Android
 * `withTransactionContext` suspends and resumes the caller via `queryCoroutineContext`.
 * On a multi-threaded pool like `Dispatchers.IO`, resumption can hop to a
 * different worker thread and throw `IllegalMonitorStateException` on unlock.
 * Pinning `queryCoroutineContext` to a single OS thread guarantees lock and
 * unlock always run on the same thread.
 */
private val queryDispatcher =
    Executors.newSingleThreadExecutor { runnable ->
        Thread(runnable, "azf-room-db").apply { isDaemon = true }
    }.asCoroutineDispatcher()

internal fun RoomDatabase.Builder<AzfDatabase>.configureAzfSqlite(): RoomDatabase.Builder<AzfDatabase> =
    setDriver(AndroidSQLiteDriver())
        .setQueryCoroutineContext(queryDispatcher)

/** Room wiring. Explicit [AndroidSQLiteDriver]; no destructive fallback, ever. */
@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {

    @Provides
    @Singleton
    fun database(@ApplicationContext context: Context): AzfDatabase =
        Room.databaseBuilder(context, AzfDatabase::class.java, "azf.db")
            .configureAzfSqlite()
            .build()

    @Provides fun logsDao(db: AzfDatabase): LogsDao = db.logsDao()

    @Provides fun outboxDao(db: AzfDatabase): OutboxDao = db.outboxDao()

    @Provides fun catalogDao(db: AzfDatabase): CatalogDao = db.catalogDao()

    @Provides
    fun exerciseCatalogDao(db: AzfDatabase): ExerciseCatalogDao = db.exerciseCatalogDao()

    @Provides fun userDao(db: AzfDatabase): UserDao = db.userDao()

    @Provides fun trainingDao(db: AzfDatabase): TrainingDao = db.trainingDao()

    @Provides fun progressDao(db: AzfDatabase): ProgressDao = db.progressDao()

    @Provides fun chatDao(db: AzfDatabase): ChatDao = db.chatDao()

    @Provides fun userOverlayDao(db: AzfDatabase): UserOverlayDao = db.userOverlayDao()
}
