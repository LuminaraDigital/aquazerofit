package fit.aquazero.app.core.database

import androidx.room3.Entity
import androidx.room3.Index
import androidx.room3.PrimaryKey
import fit.aquazero.app.core.model.MealLogItemDto

/**
 * Offline-writable meal log. [localId] is the device-generated identity;
 * [serverId] arrives on outbox acknowledgement. Items are stored as JSON via
 * the shared converter so totals can be recomputed locally.
 */
@Entity(
    tableName = "meal_logs",
    indices = [Index("localDate"), Index("serverId")],
)
data class MealLogEntity(
    @PrimaryKey val localId: String,
    val serverId: String? = null,
    val mealType: String,
    val items: List<MealLogItemDto> = emptyList(),
    val totalKcal: Double = 0.0,
    val totalProteinG: Double = 0.0,
    val totalCarbsG: Double = 0.0,
    val totalFatG: Double = 0.0,
    val source: String = "manual",
    val visionJobId: String? = null,
    val loggedAt: String,
    val localDate: String,
    val syncState: SyncState = SyncState.PENDING,
    val idempotencyKey: String,
    /** Soft-delete marker: row hidden from UI while its DELETE op drains. */
    val deleted: Boolean = false,
)

/** Offline-writable water log entry. */
@Entity(
    tableName = "water_logs",
    indices = [Index("localDate"), Index("serverId")],
)
data class WaterLogEntity(
    @PrimaryKey val localId: String,
    val serverId: String? = null,
    val amountMl: Int,
    val loggedAt: String,
    val localDate: String,
    val syncState: SyncState = SyncState.PENDING,
    val idempotencyKey: String,
)

/**
 * Offline-writable weight log. Unique on [localDate] to mirror the server's
 * upsert-per-local-date semantics; a same-day re-log replaces the row.
 */
@Entity(
    tableName = "weight_logs",
    indices = [Index(value = ["localDate"], unique = true), Index("serverId")],
)
data class WeightLogEntity(
    @PrimaryKey val localId: String,
    val serverId: String? = null,
    val weightKg: Double,
    val note: String? = null,
    val loggedAt: String,
    val localDate: String,
    val syncState: SyncState = SyncState.PENDING,
    val idempotencyKey: String,
)
