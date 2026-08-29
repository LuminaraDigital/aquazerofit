package fit.aquazero.app.core.database

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import androidx.room3.Room
import androidx.sqlite.driver.AndroidSQLiteDriver
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/**
 * Migration readiness: what Room compiles today must still be schema v1.
 *
 * The database is at version 1 with no `Migration` objects and no destructive
 * fallback, which makes the *next* schema change the dangerous one. Adding a
 * column to an entity without bumping `version` and writing a migration
 * produces a green build and a green JVM suite; the failure arrives on the
 * device of a user who already has `azf.db`, as an
 * `IllegalStateException: Room cannot verify the data integrity` on first open
 * — with pending outbox ops still inside the file.
 *
 * So this test opens the database Room actually generates and compares it
 * against the schema checked in at
 * `app/schemas/fit.aquazero.app.core.database.AzfDatabase/1.json`.
 *
 * The expected values below are transcribed from that file rather than read
 * from it, because the schema JSON is a build input and is not packaged into
 * the APK. **When this test fails, that is the whole point**: either restore
 * the v1 schema, or bump `@Database(version = 2)`, write the migration, keep
 * the pending `outbox` rows intact, and update the constants here to the newly
 * exported schema. What must not happen is the constants being "fixed" without
 * a migration existing.
 *
 * (Reading these straight from `1.json` needs two build-file changes this
 * suite is not allowed to make: `androidTestImplementation(room3-testing)` for
 * `MigrationTestHelper`, and `sourceSets["androidTest"].assets.srcDir("$projectDir/schemas")`
 * so the JSON ships in the test APK. Both are recommended in the hand-off.)
 */
@RunWith(AndroidJUnit4::class)
class SchemaMigrationReadinessTest {

    private lateinit var databaseFile: File

    @Before
    fun createOnDiskDatabase() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        databaseFile = File(context.cacheDir, "schema-readiness-${System.nanoTime()}.db")
        databaseFile.delete()
    }

    @After
    fun deleteDatabase() {
        databaseFile.delete()
        File("${databaseFile.path}-wal").delete()
        File("${databaseFile.path}-shm").delete()
    }

    @Test
    fun compiledSchemaStillMatchesTheExportedVersionOne() = runTest {
        materialize()

        openReadOnly().use { raw ->
            assertEquals(EXPECTED_VERSION, raw.version)
            assertEquals(EXPECTED_IDENTITY_HASH, raw.identityHash())
            assertEquals(EXPECTED_TABLES, raw.userTables())
        }
    }

    @Test
    fun outboxColumnsAndIndicesAreIntact() = runTest {
        materialize()

        openReadOnly().use { raw ->
            // Called out separately from the identity hash because this is the
            // table a botched migration destroys silently: an outbox row is
            // work the user believes is saved and the server has never seen.
            assertEquals(EXPECTED_OUTBOX_COLUMNS, raw.columnsOf("outbox"))
            assertEquals(EXPECTED_OUTBOX_INDICES, raw.indicesOf("outbox"))
        }
    }

    /** Build the database through Room so the file carries Room's own schema. */
    private suspend fun materialize() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val db = Room.databaseBuilder(context, AzfDatabase::class.java, databaseFile.path)
            .setDriver(AndroidSQLiteDriver())
            .setQueryCoroutineContext(Dispatchers.IO)
            .build()
        // Room creates lazily; one read forces the open + identity write.
        db.outboxDao().inStates(listOf(OutboxState.QUEUED))
        db.close()
    }

    private fun openReadOnly(): SQLiteDatabase =
        SQLiteDatabase.openDatabase(databaseFile.path, null, SQLiteDatabase.OPEN_READONLY)

    private fun SQLiteDatabase.identityHash(): String =
        rawQuery("SELECT identity_hash FROM room_master_table WHERE id = 42", null).use { cursor ->
            if (cursor.moveToFirst()) cursor.getString(0) else ""
        }

    /**
     * Tables Room owns. `room_master_table` holds the identity hash and
     * `android_metadata` is created by the platform's SQLite wrapper to record
     * the locale — neither is part of the exported schema.
     */
    private fun SQLiteDatabase.userTables(): List<String> = rawQuery(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' " +
            "AND name NOT IN ('room_master_table', 'android_metadata') ORDER BY name",
        null,
    ).use { cursor ->
        buildList { while (cursor.moveToNext()) add(cursor.getString(0)) }
    }

    private fun SQLiteDatabase.columnsOf(table: String): List<String> =
        rawQuery("PRAGMA table_info($table)", null).use { cursor ->
            val nameIndex = cursor.getColumnIndexOrThrow("name")
            buildList { while (cursor.moveToNext()) add(cursor.getString(nameIndex)) }.sorted()
        }

    private fun SQLiteDatabase.indicesOf(table: String): List<String> =
        rawQuery("PRAGMA index_list($table)", null).use { cursor ->
            val nameIndex = cursor.getColumnIndexOrThrow("name")
            buildList { while (cursor.moveToNext()) add(cursor.getString(nameIndex)) }
                .filter { it.startsWith("index_") }
                .sorted()
        }

    private companion object {
        /** `database.version` in 1.json. */
        const val EXPECTED_VERSION = 1

        /**
         * `database.identityHash` in 1.json. Room derives it from every table,
         * column, type, index and foreign key, and checks it on every open of
         * an existing file — so this one string is the whole contract.
         */
        const val EXPECTED_IDENTITY_HASH = "66de195e84b358d5f0c5b28e7fbb6067"

        /** The 23 entities declared on [AzfDatabase], sorted. */
        val EXPECTED_TABLES = listOf(
            "achievement_definitions",
            "challenges",
            "chat_messages",
            "chat_sessions",
            "coaches",
            "consents",
            "entitlements",
            "exercise_media",
            "exercises",
            "foods",
            "meal_logs",
            "memory_facts",
            "outbox",
            "profile",
            "progress_summary",
            "recipes",
            "targets",
            "training_plans",
            "trend_points",
            "user",
            "water_logs",
            "weight_logs",
            "workout_sessions",
        )

        val EXPECTED_OUTBOX_COLUMNS = listOf(
            "attempts",
            "createdAt",
            "entityType",
            "firstInFlightAt",
            "id",
            "idempotencyKey",
            "lastErrorCode",
            "localId",
            "opType",
            "payloadJson",
            "schemaVersion",
            "state",
        )

        val EXPECTED_OUTBOX_INDICES = listOf(
            "index_outbox_entityType",
            "index_outbox_localId",
            "index_outbox_state",
        )
    }
}
