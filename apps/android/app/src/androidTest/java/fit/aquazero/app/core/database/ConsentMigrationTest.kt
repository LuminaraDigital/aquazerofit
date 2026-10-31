package fit.aquazero.app.core.database

import android.content.Context
import androidx.room3.testing.MigrationTestHelper
import androidx.sqlite.driver.AndroidSQLiteDriver
import androidx.sqlite.execSQL
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/**
 * v1 to v2 adds `consents.foodPhotoTraining`. An existing device must keep its
 * consents and its pending outbox work, and the new bit must arrive off.
 */
@RunWith(AndroidJUnit4::class)
class ConsentMigrationTest {

    private val context = ApplicationProvider.getApplicationContext<Context>()
    private val databaseFile = File(context.cacheDir, "consent-migration-${System.nanoTime()}.db")
    private val helper = MigrationTestHelper(
        instrumentation = InstrumentationRegistry.getInstrumentation(),
        file = databaseFile,
        driver = AndroidSQLiteDriver(),
        databaseClass = AzfDatabase::class,
    )

    @After
    fun cleanUp() {
        databaseFile.delete()
    }

    @Test
    fun migratingToVersionTwoKeepsConsentsAndOutboxAndDefaultsTheNewBitOff() = runTest {
        helper.createDatabase(1).apply {
            execSQL(
                "INSERT INTO consents (userId, wellnessDataProcessing, aiPersonalisation, " +
                    "anonymisedAnalytics, reminders, updatedAt) VALUES ('me', 1, 0, 1, 0, 'then')",
            )
            execSQL(
                "INSERT INTO outbox (id, entityType, opType, localId, idempotencyKey, payloadJson, " +
                    "state, attempts, createdAt, firstInFlightAt, schemaVersion) " +
                    "VALUES (1, 'mealLog', 'CREATE', 'l1', 'k1', '{}', 'QUEUED', 0, 1, 0, 1)",
            )
            close()
        }

        val migrated = helper.runMigrationsAndValidate(2)

        migrated.prepare(
            "SELECT wellnessDataProcessing, anonymisedAnalytics, foodPhotoTraining FROM consents",
        ).use { row ->
            assertTrue(row.step())
            assertEquals(listOf(1L, 1L, 0L), listOf(row.getLong(0), row.getLong(1), row.getLong(2)))
        }
        migrated.prepare("SELECT COUNT(*) FROM outbox").use { row ->
            assertTrue(row.step())
            assertEquals(1L, row.getLong(0))
        }
        migrated.close()
    }
}
