package fit.aquazero.app.core.data

import fit.aquazero.app.core.common.DailyNutritionCalculator
import fit.aquazero.app.core.common.IdempotencyKeys
import fit.aquazero.app.core.common.LocalDailyNutrition
import fit.aquazero.app.core.common.LocalDates
import fit.aquazero.app.core.common.MealTotals
import fit.aquazero.app.core.common.NutritionTargets
import fit.aquazero.app.core.database.LogsDao
import fit.aquazero.app.core.database.MealLogEntity
import fit.aquazero.app.core.database.OutboxEntityTypes
import fit.aquazero.app.core.database.SyncState
import fit.aquazero.app.core.database.UserDao
import fit.aquazero.app.core.database.WaterLogEntity
import fit.aquazero.app.core.database.WeightLogEntity
import fit.aquazero.app.core.model.AzfJson
import fit.aquazero.app.core.model.CreateMealLogRequest
import fit.aquazero.app.core.model.CreateWaterLogRequest
import fit.aquazero.app.core.model.CreateWeightLogRequest
import fit.aquazero.app.core.model.MealLogItemDto
import fit.aquazero.app.core.model.MealType
import java.time.Instant
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine

/**
 * Offline-first log writes (plan §4.2): Room first (optimistic, PENDING),
 * outbox enqueue, immediate return — the worker drains when the network
 * allows. Reads are Room `Flow`s so the UI stays live offline.
 */
@Singleton
class LogsRepository @Inject constructor(
    private val logsDao: LogsDao,
    private val userDao: UserDao,
    private val outboxRepository: OutboxRepository,
    private val syncScheduler: SyncScheduler,
) {

    // ----- reads -----

    /** The day's meal logs (soft-deleted rows excluded). */
    fun mealLogsForDate(localDate: String): Flow<List<MealLogEntity>> =
        logsDao.mealLogsForDate(localDate)

    /** The day's water total in ml. */
    fun waterTotalForDate(localDate: String): Flow<Int> = logsDao.waterTotalForDate(localDate)

    /** Recent weight entries, newest first. */
    fun recentWeightLogs(limit: Int = 90): Flow<List<WeightLogEntity>> =
        logsDao.recentWeightLogs(limit)

    /**
     * Live local `DailyNutrition` recompute for offline ring display.
     * Server values overwrite on next successful fetch.
     */
    fun localDailyNutrition(localDate: String): Flow<LocalDailyNutrition> = combine(
        logsDao.mealLogsForDate(localDate),
        logsDao.waterTotalForDate(localDate),
        userDao.targets(),
    ) { meals, waterMl, targets ->
        DailyNutritionCalculator.compute(
            meals = meals.map { MealTotals(it.totalKcal, it.totalProteinG, it.totalCarbsG, it.totalFatG) },
            waterMl = waterMl,
            targets = NutritionTargets(
                kcalTarget = targets?.kcalTarget ?: 0.0,
                proteinG = targets?.proteinG ?: 0.0,
                carbsG = targets?.carbsG ?: 0.0,
                fatG = targets?.fatG ?: 0.0,
                waterMl = targets?.waterMl ?: 0.0,
            ),
        )
    }

    // ----- optimistic writes -----

    /** Log a meal offline-first. Returns the local row id immediately. */
    suspend fun logMeal(
        mealType: MealType,
        items: List<MealLogItemDto>,
        source: String = "manual",
        localDate: String = LocalDates.today(),
    ): String {
        val localId = UUID.randomUUID().toString()
        val key = IdempotencyKeys.generate()
        val now = Instant.now().toString()
        val entity = MealLogEntity(
            localId = localId,
            mealType = mealTypeName(mealType),
            items = items,
            totalKcal = DailyNutritionCalculator.round1(items.sumOf { it.kcal }),
            totalProteinG = DailyNutritionCalculator.round1(items.sumOf { it.proteinG }),
            totalCarbsG = DailyNutritionCalculator.round1(items.sumOf { it.carbsG }),
            totalFatG = DailyNutritionCalculator.round1(items.sumOf { it.fatG }),
            source = source,
            loggedAt = now,
            localDate = localDate,
            syncState = SyncState.PENDING,
            idempotencyKey = key,
        )
        logsDao.upsertMealLog(entity)
        val payload = CreateMealLogRequest(
            mealType = mealType,
            items = items,
            loggedAt = now,
            localDate = localDate,
        )
        outboxRepository.enqueueCreate(
            entityType = OutboxEntityTypes.MEAL_LOG,
            localId = localId,
            payloadJson = AzfJson.encodeToString(CreateMealLogRequest.serializer(), payload),
            idempotencyKey = key,
        )
        syncScheduler.requestSync()
        return localId
    }

    /** One-tap water add (+250ml default), offline-first. */
    suspend fun logWater(amountMl: Int, localDate: String = LocalDates.today()): String {
        val localId = UUID.randomUUID().toString()
        val key = IdempotencyKeys.generate()
        logsDao.upsertWaterLog(
            WaterLogEntity(
                localId = localId,
                amountMl = amountMl,
                loggedAt = Instant.now().toString(),
                localDate = localDate,
                syncState = SyncState.PENDING,
                idempotencyKey = key,
            ),
        )
        outboxRepository.enqueueCreate(
            entityType = OutboxEntityTypes.WATER_LOG,
            localId = localId,
            payloadJson = AzfJson.encodeToString(
                CreateWaterLogRequest.serializer(),
                CreateWaterLogRequest(amountMl = amountMl, localDate = localDate),
            ),
            idempotencyKey = key,
        )
        syncScheduler.requestSync()
        return localId
    }

    /**
     * Log a weigh-in (canonical kg). Upsert-per-localDate locally, matching
     * the server's semantics exactly.
     */
    suspend fun logWeight(
        weightKg: Double,
        note: String? = null,
        localDate: String = LocalDates.today(),
    ): String {
        val existing = logsDao.weightLogForDate(localDate)
        val localId = existing?.localId ?: UUID.randomUUID().toString()
        val key = IdempotencyKeys.generate()
        logsDao.upsertWeightLog(
            WeightLogEntity(
                localId = localId,
                serverId = existing?.serverId,
                weightKg = weightKg,
                note = note,
                loggedAt = Instant.now().toString(),
                localDate = localDate,
                syncState = SyncState.PENDING,
                idempotencyKey = key,
            ),
        )
        outboxRepository.enqueueCreate(
            entityType = OutboxEntityTypes.WEIGHT_LOG,
            localId = localId,
            payloadJson = AzfJson.encodeToString(
                CreateWeightLogRequest.serializer(),
                CreateWeightLogRequest(weightKg = weightKg, note = note, localDate = localDate),
            ),
            idempotencyKey = key,
        )
        syncScheduler.requestSync()
        return localId
    }

    /** Soft-delete a meal locally and outbox the DELETE. */
    suspend fun deleteMeal(localId: String) {
        val row = logsDao.mealLogByLocalId(localId) ?: return
        logsDao.upsertMealLog(row.copy(deleted = true, syncState = SyncState.PENDING))
        outboxRepository.enqueueDelete(OutboxEntityTypes.MEAL_LOG, localId)
        syncScheduler.requestSync()
    }

    private fun mealTypeName(mealType: MealType): String = when (mealType) {
        MealType.BREAKFAST -> "breakfast"
        MealType.LUNCH -> "lunch"
        MealType.DINNER -> "dinner"
        MealType.SNACK -> "snack"
    }
}
