package fit.aquazero.app.core.database

import android.content.Context
import androidx.room3.Room
import androidx.sqlite.driver.AndroidSQLiteDriver
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.Dispatchers

/**
 * Builds the real [AzfDatabase] against real SQLite, in memory.
 *
 * The JVM suite exercises the repositories through hand-written DAO fakes,
 * which is fine for the logic above the DAO and blind to everything inside it.
 * The outbox state machine in particular lives in SQL — `WHERE state = 'QUEUED'`
 * on the payload update, the `@Transaction` claim, the `IN ('QUEUED',
 * 'IN_FLIGHT')` count — so a fake that agrees with the query today would keep
 * agreeing with it after the query changed. These tests run the statements
 * SQLite will actually run in production.
 *
 * The driver and the query dispatcher are set exactly as `DatabaseModule` sets
 * them, so the tests observe the same threading and the same SQLite
 * implementation the app ships with.
 */
internal fun createInMemoryDatabase(): AzfDatabase {
    val context = ApplicationProvider.getApplicationContext<Context>()
    return Room.inMemoryDatabaseBuilder(context, AzfDatabase::class.java)
        .setDriver(AndroidSQLiteDriver())
        .setQueryCoroutineContext(Dispatchers.IO)
        .build()
}
