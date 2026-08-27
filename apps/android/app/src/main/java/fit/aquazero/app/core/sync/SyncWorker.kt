package fit.aquazero.app.core.sync

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import fit.aquazero.app.core.database.LogsDao
import fit.aquazero.app.core.database.OutboxEntity
import fit.aquazero.app.core.database.OutboxEntityTypes
import fit.aquazero.app.core.database.OutboxOpTypes
import fit.aquazero.app.core.database.SyncState
import fit.aquazero.app.core.network.ApiResult
import fit.aquazero.app.core.network.AzfJson
import fit.aquazero.app.core.network.api.LogsApi
import fit.aquazero.app.core.network.dto.CreateMealLogRequest
import fit.aquazero.app.core.network.dto.CreateWaterLogRequest
import fit.aquazero.app.core.network.dto.CreateWeightLogRequest
import fit.aquazero.app.core.network.dto.UpdateMealLogRequest
import fit.aquazero.app.core.network.safeCall

/**
 * Drains the outbox FIFO per entity stream (plan §4.2).
 *
 * Rules implemented here:
 *  - 2xx → SYNCED + serverId reconciled into the local row.
 *  - 4xx validation → op FAILED + row FAILED (surfaced, never silent).
 *  - 429 → stop the run and re-schedule honoring `Retry-After`.
 *  - 5xx / network → retry with the SAME key (replay-safe) via backoff.
 *  - DELETE answered NOT_FOUND → success (the first attempt already landed).
 *  - An op that first went IN_FLIGHT > 20h ago is not blindly resent: weight
 *    is naturally idempotent (per-date upsert) and resends; meal reconciles
 *    against the day's logs; water compares day totals.
 */
@HiltWorker
class SyncWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted params: WorkerParameters,
    private val outboxRepository: OutboxRepository,
    private val logsDao: LogsDao,
    private val logsApi: LogsApi,
    private val syncScheduler: SyncScheduler,
) : CoroutineWorker(appContext, params) {

    private sealed interface OpOutcome {
        data object Done : OpOutcome
        data class RetryLater(val delaySeconds: Long?) : OpOutcome
        data object Transient : OpOutcome
    }

    override suspend fun doWork(): Result {
        val streams = listOf(
            OutboxEntityTypes.WEIGHT_LOG,
            OutboxEntityTypes.MEAL_LOG,
            OutboxEntityTypes.WATER_LOG,
        )
        for (stream in streams) {
            while (true) {
                val op = outboxRepository.claimHead(stream) ?: break
                when (val outcome = deliver(op)) {
                    is OpOutcome.Done -> Unit // next op
                    is OpOutcome.RetryLater -> {
                        syncScheduler.requestSync(outcome.delaySeconds ?: 60L)
                        return Result.success()
                    }
                    is OpOutcome.Transient -> return Result.retry()
                }
            }
        }
        return Result.success()
    }

    private suspend fun deliver(op: OutboxEntity): OpOutcome {
        // Stale-in-flight reconciliation before any resend.
        val stale = op.firstInFlightAt > 0 &&
            System.currentTimeMillis() - op.firstInFlightAt > STALE_IN_FLIGHT_MS
        if (stale && op.opType == OutboxOpTypes.CREATE) {
            val reconciled = reconcileStaleCreate(op)
            if (reconciled != null) return reconciled
            // fall through: not found on server — safe to resend with same key
        }
        return when (op.entityType) {
            OutboxEntityTypes.WEIGHT_LOG -> deliverWeight(op)
            OutboxEntityTypes.MEAL_LOG -> deliverMeal(op)
            OutboxEntityTypes.WATER_LOG -> deliverWater(op)
            else -> {
                outboxRepository.markFailed(op.id, "UNKNOWN_ENTITY_TYPE")
                OpOutcome.Done
            }
        }
    }

    // ----- per-type delivery -----

    private suspend fun deliverWeight(op: OutboxEntity): OpOutcome {
        val body = decode(CreateWeightLogRequest.serializer(), op.payloadJson)
            ?: return failPermanently(op, "PAYLOAD_DECODE")
        return when (val result = safeCall { logsApi.createWeightLog(op.idempotencyKey ?: "", body) }) {
            is ApiResult.Success -> {
                logsDao.markWeightLogSynced(op.localId, result.data.log.id, SyncState.SYNCED)
                outboxRepository.markSynced(op.id)
                OpOutcome.Done
            }
            is ApiResult.Failure -> onFailure(op, result) {
                logsDao.markWeightLogSynced(op.localId, null, SyncState.FAILED)
            }
        }
    }

    private suspend fun deliverMeal(op: OutboxEntity): OpOutcome = when (op.opType) {
        OutboxOpTypes.CREATE -> {
            val body = decode(CreateMealLogRequest.serializer(), op.payloadJson)
                ?: return failPermanently(op, "PAYLOAD_DECODE")
            when (val result = safeCall { logsApi.createMealLog(op.idempotencyKey ?: "", body) }) {
                is ApiResult.Success -> {
                    logsDao.markMealLogSynced(op.localId, result.data.log.id, SyncState.SYNCED)
                    outboxRepository.markSynced(op.id)
                    OpOutcome.Done
                }
                is ApiResult.Failure -> onFailure(op, result) {
                    logsDao.setMealLogState(op.localId, SyncState.FAILED)
                }
            }
        }
        OutboxOpTypes.UPDATE -> {
            val serverId = logsDao.mealLogByLocalId(op.localId)?.serverId
                ?: return OpOutcome.Transient // create not yet acknowledged; FIFO retry
            val body = decode(UpdateMealLogRequest.serializer(), op.payloadJson)
                ?: return failPermanently(op, "PAYLOAD_DECODE")
            when (val result = safeCall { logsApi.updateMealLog(serverId, body) }) {
                is ApiResult.Success -> {
                    logsDao.setMealLogState(op.localId, SyncState.SYNCED)
                    outboxRepository.markSynced(op.id)
                    OpOutcome.Done
                }
                is ApiResult.Failure -> onFailure(op, result) {
                    logsDao.setMealLogState(op.localId, SyncState.FAILED)
                }
            }
        }
        OutboxOpTypes.DELETE -> {
            val serverId = logsDao.mealLogByLocalId(op.localId)?.serverId
            if (serverId == null) {
                // Row never reached the server (or already purged) — nothing to delete.
                logsDao.deleteMealLogRow(op.localId)
                outboxRepository.markSynced(op.id)
                OpOutcome.Done
            } else {
                when (val result = safeCall { logsApi.deleteMealLog(serverId) }) {
                    is ApiResult.Success -> {
                        logsDao.deleteMealLogRow(op.localId)
                        outboxRepository.markSynced(op.id)
                        OpOutcome.Done
                    }
                    is ApiResult.Failure -> {
                        // Replayed DELETE: NOT_FOUND means the first attempt landed.
                        if (result is ApiResult.Failure.Api && result.httpStatus == 404) {
                            logsDao.deleteMealLogRow(op.localId)
                            outboxRepository.markSynced(op.id)
                            OpOutcome.Done
                        } else {
                            onFailure(op, result) { logsDao.setMealLogState(op.localId, SyncState.FAILED) }
                        }
                    }
                }
            }
        }
        else -> failPermanently(op, "UNKNOWN_OP_TYPE")
    }

    private suspend fun deliverWater(op: OutboxEntity): OpOutcome {
        val body = decode(CreateWaterLogRequest.serializer(), op.payloadJson)
            ?: return failPermanently(op, "PAYLOAD_DECODE")
        return when (val result = safeCall { logsApi.createWaterLog(op.idempotencyKey ?: "", body) }) {
            is ApiResult.Success -> {
                logsDao.markWaterLogSynced(op.localId, result.data.id, SyncState.SYNCED)
                outboxRepository.markSynced(op.id)
                OpOutcome.Done
            }
            is ApiResult.Failure -> onFailure(op, result) {
                logsDao.markWaterLogSynced(op.localId, null, SyncState.FAILED)
            }
        }
    }

    // ----- stale-op reconciliation (plan §4.2, 24h idempotency window) -----

    /**
     * Returns an [OpOutcome] when the stale op could be settled without a
     * resend, or null when resending (same key) is the right move.
     */
    private suspend fun reconcileStaleCreate(op: OutboxEntity): OpOutcome? = when (op.entityType) {
        // Weight: deterministic per-localDate upsert — always safe to resend.
        OutboxEntityTypes.WEIGHT_LOG -> null

        // Meal: fetch the day's logs and match on localDate + totals + source.
        OutboxEntityTypes.MEAL_LOG -> {
            val body = decode(CreateMealLogRequest.serializer(), op.payloadJson) ?: return null
            when (val day = safeCall { logsApi.mealLogs(body.localDate) }) {
                is ApiResult.Success -> {
                    val localRow = logsDao.mealLogByLocalId(op.localId)
                    val match = day.data.meals.values.flatten().firstOrNull { server ->
                        server.localDate == body.localDate &&
                            server.mealType == body.mealType &&
                            kotlin.math.abs(server.totalKcal - (localRow?.totalKcal ?: -1.0)) < 0.5
                    }
                    if (match != null) {
                        logsDao.markMealLogSynced(op.localId, match.id, SyncState.SYNCED)
                        outboxRepository.markSynced(op.id)
                        OpOutcome.Done
                    } else {
                        null // not on server — resend
                    }
                }
                is ApiResult.Failure -> OpOutcome.Transient
            }
        }

        // Water: only day totals exist — compare and accept residual risk.
        OutboxEntityTypes.WATER_LOG -> {
            val body = decode(CreateWaterLogRequest.serializer(), op.payloadJson) ?: return null
            when (val day = safeCall { logsApi.waterDay(body.localDate) }) {
                is ApiResult.Success -> {
                    val localTotal = logsDao.waterTotalForDateOnce(body.localDate)
                    if (day.data.totalMl >= localTotal) {
                        logsDao.markWaterLogSynced(op.localId, null, SyncState.SYNCED)
                        outboxRepository.markSynced(op.id)
                        OpOutcome.Done
                    } else {
                        null // server is behind — resend
                    }
                }
                is ApiResult.Failure -> OpOutcome.Transient
            }
        }

        else -> null
    }

    // ----- shared plumbing -----

    private suspend fun onFailure(
        op: OutboxEntity,
        failure: ApiResult.Failure,
        markRowFailed: suspend () -> Unit,
    ): OpOutcome = when (failure) {
        is ApiResult.Failure.Network -> OpOutcome.Transient
        is ApiResult.Failure.Api -> when {
            failure.httpStatus == 429 -> OpOutcome.RetryLater(failure.retryAfterSeconds)
            failure.httpStatus >= 500 -> OpOutcome.Transient
            failure.httpStatus == 401 -> OpOutcome.Transient // session refresh cycle
            else -> {
                markRowFailed()
                outboxRepository.markFailed(op.id, failure.code)
                OpOutcome.Done
            }
        }
    }

    private suspend fun failPermanently(op: OutboxEntity, code: String): OpOutcome {
        outboxRepository.markFailed(op.id, code)
        return OpOutcome.Done
    }

    private fun <T> decode(
        serializer: kotlinx.serialization.KSerializer<T>,
        json: String,
    ): T? = runCatching { AzfJson.decodeFromString(serializer, json) }.getOrNull()

    private companion object {
        /** 20h — inside the server's 24h replay window, with margin. */
        const val STALE_IN_FLIGHT_MS: Long = 20L * 60 * 60 * 1000
    }
}
