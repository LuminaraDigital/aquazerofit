package fit.aquazero.app.core.data

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import androidx.room3.Room
import androidx.sqlite.driver.AndroidSQLiteDriver
import androidx.test.core.app.ApplicationProvider
import fit.aquazero.app.core.database.AzfDatabase
import fit.aquazero.app.core.database.CoachEntity
import fit.aquazero.app.core.database.FoodEntity
import fit.aquazero.app.core.database.MealLogEntity
import fit.aquazero.app.core.database.OutboxEntity
import fit.aquazero.app.core.database.OutboxEntityTypes
import fit.aquazero.app.core.database.OutboxOpTypes
import fit.aquazero.app.core.database.OutboxState
import fit.aquazero.app.core.database.ProgressSummaryEntity
import fit.aquazero.app.core.database.SyncState
import fit.aquazero.app.core.database.UserEntity
import fit.aquazero.app.core.database.createInMemoryDatabase
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

private class NoOpSyncScheduler : SyncScheduler {
    override fun requestSync(initialDelaySeconds: Long, queueBehindCurrent: Boolean) = Unit
    override fun cancelPendingSync() = Unit
}

class LocalCachePurgerTest {

    private val context = ApplicationProvider.getApplicationContext<Context>()
    private val databaseFile = File(context.cacheDir, "purge-coverage-${System.nanoTime()}.db")

    @After
    fun deleteDatabase() {
        databaseFile.delete()
        File("${databaseFile.path}-wal").delete()
        File("${databaseFile.path}-shm").delete()
    }

    @Test
    fun purgeDropsUserScopedRowsAndOutboxButKeepsCatalogCorpus() = runTest {
        val db = createInMemoryDatabase()
        val purger = db.purger()

        db.logsDao().upsertMealLog(
            MealLogEntity(
                localId = "m1",
                mealType = "breakfast",
                loggedAt = "2026-01-01T08:00:00Z",
                localDate = "2026-01-01",
                syncState = SyncState.PENDING,
                idempotencyKey = "k-meal",
            ),
        )
        db.userDao().upsertUser(UserEntity(id = "u1", email = "a@test.com", displayName = "A"))
        db.outboxDao().insert(
            OutboxEntity(
                opType = OutboxOpTypes.CREATE,
                entityType = OutboxEntityTypes.MEAL_LOG,
                localId = "m1",
                payloadJson = "{}",
                idempotencyKey = "k-meal",
                state = OutboxState.QUEUED,
                createdAt = 1L,
            ),
        )
        db.catalogDao().upsertFoods(
            listOf(
                FoodEntity(
                    id = "f1",
                    name = "Oats",
                    docJson = "{}",
                    lastUsedAt = 99L,
                    useCount = 3,
                ),
            ),
        )
        db.catalogDao().upsertCoaches(listOf(CoachEntity(coachId = "akin", unlocked = true)))
        db.progressDao().upsertSummary(
            ProgressSummaryEntity(userId = ProgressSummaryEntity.FIGHT_RECORD_KEY, docJson = "{}"),
        )

        purger.purgeOnUserLogout()

        assertEquals(0, db.logsDao().mealLogsForDateOnce("2026-01-01").size)
        assertNull(db.userDao().userOnce())
        assertEquals(0, db.outboxDao().inStates(listOf(OutboxState.QUEUED)).size)
        assertEquals("Oats", db.catalogDao().foodById("f1")!!.name)
        assertEquals(0L, db.catalogDao().foodById("f1")!!.lastUsedAt)
        assertEquals(0, db.catalogDao().foodById("f1")!!.useCount)
        assertTrue(db.catalogDao().coaches().first().isEmpty())
        // The next account must not open on the previous one's belts.
        assertNull(db.progressDao().snapshot(ProgressSummaryEntity.FIGHT_RECORD_KEY).first())
    }

    @Test
    fun cachedUserIdReadsSingletonUserRow() = runTest {
        val db = createInMemoryDatabase()
        val purger = db.purger()
        assertNull(purger.cachedUserId())
        db.userDao().upsertUser(UserEntity(id = "u1", email = "a@test.com", displayName = "A"))
        assertEquals("u1", purger.cachedUserId())
    }

    /**
     * Most user tables carry no `userId` column, so the purge is the only thing
     * stopping the next account on this device from reading the last one's
     * rows, and no schema constraint notices a table it forgot. This makes a
     * new table impossible to add without deciding which side of that line it
     * is on.
     */
    @Test
    fun everyTableIsEitherPurgedOrDeliberatelyKept() = runTest {
        withRoom { it.userDao().userOnce() }

        val tables = withRaw { it.userTables() }

        val unclassified = tables - PURGED - KEPT
        assertTrue(
            "Unclassified tables $unclassified: add each to PURGED (and clear it in " +
                "LocalCachePurger) or to KEPT",
            unclassified.isEmpty(),
        )
        assertEquals("PURGED or KEPT names a table that no longer exists", PURGED + KEPT, tables)
    }

    /**
     * Seeds one row in every table straight from the schema rather than through
     * hand-built entities, so a table added to [PURGED] is covered without
     * anyone writing a fixture for it.
     */
    @Test
    fun differentUserPurgeEmptiesEveryAccountTableAndKeepsTheCatalog() = runTest {
        withRoom { it.userDao().userOnce() }
        withRaw { raw -> (PURGED + KEPT).forEach { raw.seedOneRowIn(it) } }

        withRoom { it.purger().purgeForDifferentUser() }

        withRaw { raw ->
            val survivors = PURGED.associateWith { raw.countRows(it) }.filterValues { it > 0 }
            assertEquals("Account rows survived the purge", emptyMap<String, Long>(), survivors)
            KEPT.forEach { assertEquals("$it must survive the purge", 1L, raw.countRows(it)) }
        }
    }

    /**
     * File-backed rather than in memory so the raw seeding and counting below
     * can reach the same database. Room and the raw handle never hold it open
     * at the same time.
     */
    private suspend fun <T> withRoom(block: suspend (AzfDatabase) -> T): T {
        val db = Room.databaseBuilder(context, AzfDatabase::class.java, databaseFile.path)
            .setDriver(AndroidSQLiteDriver())
            .setQueryCoroutineContext(Dispatchers.IO)
            .build()
        return try {
            block(db)
        } finally {
            db.close()
        }
    }

    private fun <T> withRaw(block: (SQLiteDatabase) -> T): T = SQLiteDatabase.openDatabase(
        databaseFile.path,
        null,
        SQLiteDatabase.OPEN_READWRITE or SQLiteDatabase.ENABLE_WRITE_AHEAD_LOGGING,
    ).use(block)

    private fun SQLiteDatabase.userTables(): Set<String> = rawQuery(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' " +
            "AND name NOT IN ('room_master_table', 'android_metadata')",
        null,
    ).use { cursor ->
        buildSet { while (cursor.moveToNext()) add(cursor.getString(0)) }
    }

    /** One row with every column filled, so NOT NULL never decides what gets seeded. */
    private fun SQLiteDatabase.seedOneRowIn(table: String) {
        val columns = rawQuery("PRAGMA table_info(`$table`)", null).use { cursor ->
            val name = cursor.getColumnIndexOrThrow("name")
            val type = cursor.getColumnIndexOrThrow("type")
            buildList { while (cursor.moveToNext()) add(cursor.getString(name) to cursor.getString(type)) }
        }
        execSQL(
            "INSERT INTO `$table` (${columns.joinToString { "`${it.first}`" }}) " +
                "VALUES (${columns.joinToString { "?" }})",
            columns.map { (_, type) -> placeholderFor(type) }.toTypedArray(),
        )
    }

    private fun placeholderFor(sqliteType: String): Any = when (sqliteType.uppercase()) {
        "INTEGER" -> 1L
        "REAL" -> 1.0
        "BLOB" -> byteArrayOf(0)
        else -> "seed"
    }

    private fun SQLiteDatabase.countRows(table: String): Long =
        rawQuery("SELECT COUNT(*) FROM `$table`", null).use { cursor ->
            cursor.moveToFirst()
            cursor.getLong(0)
        }

    private companion object {
        /** Account data: must be empty after a purge. */
        val PURGED = setOf(
            "challenges", "chat_messages", "chat_sessions", "coaches", "consents", "entitlements",
            "meal_logs", "memory_facts", "outbox", "profile", "progress_summary", "targets",
            "training_plans", "trend_points", "user", "water_logs", "weight_logs", "workout_sessions",
        )

        /**
         * Shared catalog: survives an account switch. Per-user columns on these
         * rows (food recency) are reset rather than deleted; the first test in
         * this class covers that.
         */
        val KEPT = setOf("achievement_definitions", "exercise_media", "exercises", "foods", "recipes")
    }
}

private fun AzfDatabase.purger() = LocalCachePurger(
    logsDao = logsDao(),
    outboxDao = outboxDao(),
    userDao = userDao(),
    trainingDao = trainingDao(),
    progressDao = progressDao(),
    chatDao = chatDao(),
    userOverlayDao = userOverlayDao(),
    syncScheduler = NoOpSyncScheduler(),
)
