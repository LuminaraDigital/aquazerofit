package fit.aquazero.app.core.sync

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import fit.aquazero.app.core.data.OutboxRepository
import fit.aquazero.app.core.data.SyncScheduler
import fit.aquazero.app.core.database.LogsDao
import fit.aquazero.app.core.database.OutboxEntity
import fit.aquazero.app.core.database.OutboxEntityTypes
import fit.aquazero.app.core.database.OutboxOpTypes
import fit.aquazero.app.core.database.SyncState
import fit.aquazero.app.core.model.ApiResult
import fit.aquazero.app.core.model.AzfJson
import fit.aquazero.app.core.model.CreateMealLogRequest
import fit.aquazero.app.core.model.CreateWaterLogRequest
import fit.aquazero.app.core.model.CreateWeightLogRequest
import fit.aquazero.app.core.model.UpdateMealLogRequest
import fit.aquazero.app.core.network.api.LogsApi
import fit.aquazero.app.core.network.safeCall
import fit.aquazero.app.core.telemetry.CrashReporter

/**
 * WorkManager's half of the outbox drain: constraints, retries and backoff.
 *
 * Everything that decides *what* to send lives in [OutboxDrainer], which needs
 * no `Context` and is therefore reachable from a plain JVM test. This class is
 * deliberately nothing but the shell that maps [OutboxDrainer.DrainResult] onto
 * a WorkManager `Result`.
 */
@HiltWorker
class SyncWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted params: WorkerParameters,
    private val outboxRepository: OutboxRepository,
    private val logsDao: LogsDao,
    private val logsApi: LogsApi,
    private val syncScheduler: SyncScheduler,
    private val crashReporter: CrashReporter,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val drainer = OutboxDrainer(
            outboxRepository = outboxRepository,
            logsDao = logsDao,
            logsApi = logsApi,
            syncScheduler = syncScheduler,
            crashReporter = crashReporter,
        )
        val result = when (drainer.drain()) {
            OutboxDrainer.DrainResult.SETTLED -> Result.success()
            OutboxDrainer.DrainResult.RETRY -> Result.retry()
        }
        pruneDeliveredOps()
        return result
    }

    /**
     * Drop delivered ops once they are past the replay window.
     *
     * `pruneSynced` existed and had no callers, so every SYNCED op stayed in
     * the table forever with its full payload JSON — one row per meal, water
     * tap and weigh-in, for the life of the install. Nothing surfaced the
     * growth because `pendingCount` filters SYNCED out, and `claimHead`'s
     * `ORDER BY id ASC` quietly got slower with it.
     *
     * Seven days, not immediately: a delivered op is still evidence while the
     * server's 24h idempotency window is open, and keeping a few days beyond
     * that makes support questions answerable. Failures are never pruned —
     * they are the ones a user may still be looking at.
     */
    private suspend fun pruneDeliveredOps() {
        val cutoff = System.currentTimeMillis() - SYNCED_RETENTION_MS
        runCatching { outboxRepository.pruneSynced(cutoff) }
            .onFailure { crashReporter.recordNonFatal(it, mapOf("stage" to "outboxPrune")) }
    }

    private companion object {
        /** Delivered ops are kept this long past the server's replay window. */
        const val SYNCED_RETENTION_MS: Long = 7L * 24 * 60 * 60 * 1000
    }
}

/**
 * Drains the outbox FIFO per entity stream (plan §4.2).
 *
 * Rules implemented here:
 *  - 2xx → SYNCED + serverId reconciled into the local row.
 *  - 4xx validation → op FAILED + row FAILED (surfaced, never silent).
 *  - 429 → stop the run and re-schedule honoring `Retry-After`.
 *  - 5xx / network → retry with the SAME key (replay-safe) via backoff.
 *  - DELETE answered NOT_FOUND → success (the first attempt already landed).
 *  - A 2xx body we cannot decode is NOT proof the write failed: see
 *    [onMalformed].
 *  - A CREATE with no usable idempotency key never goes on the wire at all:
 *    see [idempotencyKeyOf].
 *  - An op that first went IN_FLIGHT > 20h ago is not blindly resent: weight
 *    is naturally idempotent (per-date upsert) and resends; meal reconciles
 *    against the day's logs; water compares day totals.
 *  - An op that can never succeed is failed rather than retried: see the
 *    orphan rule in [resolveMissingServerId] and the ceiling in [deliver].
 */
internal class OutboxDrainer(
    private val outboxRepository: OutboxRepository,
    private val logsDao: LogsDao,
    private val logsApi: LogsApi,
    private val syncScheduler: SyncScheduler,
    private val crashReporter: CrashReporter,
) {

    /** What the run as a whole should tell WorkManager. */
    enum class DrainResult {
        /** Nothing left to do right now — do not re-run on backoff. */
        SETTLED,

        /** At least one stream is stuck on something that may clear later. */
        RETRY,
    }

    private sealed interface OpOutcome {
        data object Done : OpOutcome
        data class RetryLater(val delaySeconds: Long?) : OpOutcome
        data object Transient : OpOutcome
    }

    /** How one stream's drain ended. See [drain]. */
    private enum class StreamOutcome { DRAINED, STALLED, RESCHEDULED }

    /**
     * Drain every stream, then decide once whether the run needs a retry.
     *
     * STREAM ISOLATION — this collection step is the whole of it, and it is
     * deliberately kept in one place so it can be undone in one place. The
     * streams share nothing but this loop, so a stream that stalls has no
     * business stopping the others: returning `Result.retry()` from inside the
     * per-stream loop, which is what this used to do, meant one wedged meal op
     * also stopped every water and weight write behind it, permanently. To
     * revert the isolation, return [DrainResult.RETRY] straight from the
     * `STALLED` branch instead of remembering it.
     */
    suspend fun drain(): DrainResult {
        var stalled = false
        for (stream in STREAMS) {
            when (drainStream(stream)) {
                StreamOutcome.DRAINED -> Unit
                StreamOutcome.STALLED -> stalled = true
                // A 429 is an account-wide rate limit rather than one stream's
                // problem, and the follow-up run is already booked. Stop.
                StreamOutcome.RESCHEDULED -> return DrainResult.SETTLED
            }
        }
        return if (stalled) DrainResult.RETRY else DrainResult.SETTLED
    }

    private suspend fun drainStream(stream: String): StreamOutcome {
        while (true) {
            val op = outboxRepository.claimHead(stream) ?: return StreamOutcome.DRAINED
            when (val outcome = deliver(op)) {
                is OpOutcome.Done -> Unit // next op
                is OpOutcome.RetryLater -> {
                    // Queued behind this run: the de-duplication that
                    // collapses a burst of writes into one drain would
                    // otherwise discard this request, because the drain it
                    // matches against is this very worker.
                    syncScheduler.requestSync(
                        initialDelaySeconds = outcome.delaySeconds ?: DEFAULT_RETRY_AFTER_SECONDS,
                        queueBehindCurrent = true,
                    )
                    return StreamOutcome.RESCHEDULED
                }
                is OpOutcome.Transient -> return StreamOutcome.STALLED
            }
        }
    }

    private suspend fun deliver(op: OutboxEntity): OpOutcome {
        // Ceiling first: an op that has used up its attempts must not reach
        // the wire again, whichever branch below would have carried it.
        if (op.attempts > MAX_DELIVERY_ATTEMPTS) {
            markRowFailed(op)
            return failPermanently(op, ATTEMPTS_EXHAUSTED_CODE)
        }
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
            else -> failPermanently(op, UNKNOWN_ENTITY_TYPE_CODE)
        }
    }

    // ----- per-type delivery -----

    private suspend fun deliverWeight(op: OutboxEntity): OpOutcome {
        val key = idempotencyKeyOf(op) ?: return failPermanently(op, MISSING_IDEMPOTENCY_KEY_CODE)
        val body = decode(CreateWeightLogRequest.serializer(), op.payloadJson)
            ?: return failPermanently(op, PAYLOAD_DECODE_CODE)
        return when (val result = safeCall { logsApi.createWeightLog(key, body) }) {
            is ApiResult.Success -> {
                logsDao.markWeightLogSynced(op.localId, result.data.log.id, SyncState.SYNCED)
                outboxRepository.markSynced(op.id)
                OpOutcome.Done
            }
            is ApiResult.Failure -> onFailure(op, result)
        }
    }

    private suspend fun deliverMeal(op: OutboxEntity): OpOutcome = when (op.opType) {
        OutboxOpTypes.CREATE -> deliverMealCreate(op)
        OutboxOpTypes.UPDATE -> deliverMealUpdate(op)
        OutboxOpTypes.DELETE -> deliverMealDelete(op)
        else -> failPermanently(op, UNKNOWN_OP_TYPE_CODE)
    }

    private suspend fun deliverMealCreate(op: OutboxEntity): OpOutcome {
        val key = idempotencyKeyOf(op) ?: return failPermanently(op, MISSING_IDEMPOTENCY_KEY_CODE)
        val body = decode(CreateMealLogRequest.serializer(), op.payloadJson)
            ?: return failPermanently(op, PAYLOAD_DECODE_CODE)
        return when (val result = safeCall { logsApi.createMealLog(key, body) }) {
            is ApiResult.Success -> {
                logsDao.markMealLogSynced(op.localId, result.data.log.id, SyncState.SYNCED)
                outboxRepository.markSynced(op.id)
                OpOutcome.Done
            }
            is ApiResult.Failure -> onFailure(op, result)
        }
    }

    private suspend fun deliverMealUpdate(op: OutboxEntity): OpOutcome {
        val serverId = logsDao.mealLogByLocalId(op.localId)?.serverId
            ?: return resolveMissingServerId(op)
        val body = decode(UpdateMealLogRequest.serializer(), op.payloadJson)
            ?: return failPermanently(op, PAYLOAD_DECODE_CODE)
        return when (val result = safeCall { logsApi.updateMealLog(serverId, body) }) {
            is ApiResult.Success -> {
                logsDao.setMealLogState(op.localId, SyncState.SYNCED)
                outboxRepository.markSynced(op.id)
                OpOutcome.Done
            }
            is ApiResult.Failure -> onFailure(op, result)
        }
    }

    private suspend fun deliverMealDelete(op: OutboxEntity): OpOutcome {
        val serverId = logsDao.mealLogByLocalId(op.localId)?.serverId
        if (serverId == null) {
            // Row never reached the server (or already purged) — nothing to delete.
            logsDao.deleteMealLogRow(op.localId)
            outboxRepository.markSynced(op.id)
            return OpOutcome.Done
        }
        return when (val result = safeCall { logsApi.deleteMealLog(serverId) }) {
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
                    onFailure(op, result)
                }
            }
        }
    }

    private suspend fun deliverWater(op: OutboxEntity): OpOutcome {
        val key = idempotencyKeyOf(op) ?: return failPermanently(op, MISSING_IDEMPOTENCY_KEY_CODE)
        val body = decode(CreateWaterLogRequest.serializer(), op.payloadJson)
            ?: return failPermanently(op, PAYLOAD_DECODE_CODE)
        return when (val result = safeCall { logsApi.createWaterLog(key, body) }) {
            is ApiResult.Success -> {
                logsDao.markWaterLogSynced(op.localId, result.data.id, SyncState.SYNCED)
                outboxRepository.markSynced(op.id)
                OpOutcome.Done
            }
            is ApiResult.Failure -> onFailure(op, result)
        }
    }

    // ----- the orphan rule -----

    /**
     * An UPDATE whose local row still has no `serverId`: wait, or give up?
     *
     * Waiting is only correct while the CREATE that will mint that id is still
     * going to run, and that is true exactly when a CREATE op for the same
     * `localId` is QUEUED or IN_FLIGHT. When none is, the UPDATE is ORPHANED
     * and no future run can ever settle it. That state is reachable in one
     * ordinary sequence: the CREATE is rejected 4xx and marked FAILED, which
     * leaves the local row visible and editable (`LogsDao` hides `deleted`
     * rows, not FAILED ones), the user edits it, and the edit enqueues this
     * UPDATE behind a corpse.
     *
     * Returning `Transient` for an orphan does not mean "retry later", it
     * means "stall this stream forever": `claimHead` re-adopts an IN_FLIGHT
     * op, so the identical op is re-claimed and re-stalled on every run, and
     * the 20h stale reconciliation never rescues it because that path only
     * runs for CREATEs. An orphan is therefore a permanent failure, and the
     * local row is marked FAILED with it so the user sees the truth: this edit
     * is not going anywhere. Do not "fix" a hang here by loosening the
     * predicate back into an unconditional retry.
     */
    private suspend fun resolveMissingServerId(op: OutboxEntity): OpOutcome =
        if (outboxRepository.hasLiveCreate(op.localId)) {
            OpOutcome.Transient // create not yet acknowledged; FIFO retry
        } else {
            markRowFailed(op)
            failPermanently(op, ORPHANED_UPDATE_CODE)
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

    private suspend fun onFailure(op: OutboxEntity, failure: ApiResult.Failure): OpOutcome = when (failure) {
        is ApiResult.Failure.Network -> OpOutcome.Transient
        is ApiResult.Failure.Malformed -> onMalformed(op)
        is ApiResult.Failure.Api -> when {
            failure.httpStatus == 429 -> OpOutcome.RetryLater(failure.retryAfterSeconds)
            failure.httpStatus >= 500 -> OpOutcome.Transient
            failure.httpStatus == 401 -> OpOutcome.Transient // session refresh cycle
            else -> {
                markRowFailed(op)
                failPermanently(op, failure.code)
            }
        }
    }

    /**
     * A 2xx whose body did not decode.
     *
     * "Could not decode it, therefore it failed" is a false inference, and for
     * a CREATE it is an expensive one. The status line already said the server
     * accepted and stored the write; the only thing that went wrong is that
     * this build does not recognise something in the response — most likely a
     * union member added server-side since the app shipped, a new `mealType`
     * or `source`. Marking the row FAILED there tells the user their meal did
     * not save when it did, and dropping the op leaves nothing behind to ever
     * correct that.
     *
     * So a malformed CREATE takes the same route as a stale one: ask the
     * server what it actually stored and settle the op against the answer.
     * When that fetch cannot be decoded either — likely, since it carries the
     * same unknown value — the op stays claimed and the [MAX_DELIVERY_ATTEMPTS]
     * ceiling ends it rather than a loop.
     *
     * UPDATE and DELETE keep the old behaviour: both are addressed by
     * `serverId`, so there is no orphaned write to go looking for.
     */
    private suspend fun onMalformed(op: OutboxEntity): OpOutcome {
        if (op.opType != OutboxOpTypes.CREATE) {
            markRowFailed(op)
            return failPermanently(op, MALFORMED_RESPONSE_CODE)
        }
        crashReporter.log("outbox op ${op.id} (${op.entityType}) got an undecodable 2xx; reconciling")
        return reconcileStaleCreate(op) ?: OpOutcome.Transient
    }

    /**
     * The key that makes a resend replay-safe, or null when there isn't one.
     *
     * A blank key is not a key. Sending `Idempotency-Key:` with nothing after
     * it and hoping for the best is how a replayed CREATE becomes a duplicate
     * row — or, once the server starts validating the header, a permanent 4xx
     * that then has to be untangled at the far end of the outbox. A write
     * without a key does not leave the device.
     */
    private fun idempotencyKeyOf(op: OutboxEntity): String? =
        op.idempotencyKey?.takeIf { it.isNotBlank() }

    /** Surface a permanent failure on the row the user can actually see. */
    private suspend fun markRowFailed(op: OutboxEntity) = when (op.entityType) {
        OutboxEntityTypes.WEIGHT_LOG -> logsDao.markWeightLogSynced(op.localId, null, SyncState.FAILED)
        OutboxEntityTypes.WATER_LOG -> logsDao.markWaterLogSynced(op.localId, null, SyncState.FAILED)
        else -> logsDao.setMealLogState(op.localId, SyncState.FAILED)
    }

    private suspend fun failPermanently(op: OutboxEntity, code: String): OpOutcome {
        // Developer-chosen constants and a row id only — never payload content.
        crashReporter.log("outbox op ${op.id} (${op.entityType}/${op.opType}) failed permanently: $code")
        outboxRepository.markFailed(op.id, code)
        return OpOutcome.Done
    }

    private fun <T> decode(
        serializer: kotlinx.serialization.KSerializer<T>,
        json: String,
    ): T? = runCatching { AzfJson.decodeFromString(serializer, json) }.getOrNull()

    internal companion object {
        /** The offline-writable streams, drained in this order. */
        val STREAMS = listOf(
            OutboxEntityTypes.WEIGHT_LOG,
            OutboxEntityTypes.MEAL_LOG,
            OutboxEntityTypes.WATER_LOG,
        )

        /** 20h — inside the server's 24h replay window, with margin. */
        const val STALE_IN_FLIGHT_MS: Long = 20L * 60 * 60 * 1000

        /**
         * Deliveries one op gets before it is failed instead of retried.
         *
         * `attempts` used to be written by every claim and read by nobody, so
         * an op that answered `Transient` retried until the app was
         * reinstalled. Twelve is chosen against the schedule that actually
         * governs those retries rather than as a round number: WorkManager
         * backs this worker off exponentially from 30s and caps a single wait
         * at 5h, so attempts 1–9 span roughly four and a half hours and 10–12
         * add five each — about 19h in total, landing just inside the server's
         * 24h idempotency window. Past that window a resend with the same key
         * is no longer replay-safe, so there is nothing left to gain by
         * trying again.
         */
        const val MAX_DELIVERY_ATTEMPTS = 12

        /** Recorded against an op whose 2xx body did not match its type. */
        const val MALFORMED_RESPONSE_CODE = "MALFORMED_RESPONSE"

        /** Recorded against an op whose stored payload no longer decodes. */
        const val PAYLOAD_DECODE_CODE = "PAYLOAD_DECODE"

        /** Recorded against an UPDATE that can never learn its `serverId`. */
        const val ORPHANED_UPDATE_CODE = "ORPHANED_UPDATE"

        /** Recorded against an op that used up [MAX_DELIVERY_ATTEMPTS]. */
        const val ATTEMPTS_EXHAUSTED_CODE = "ATTEMPTS_EXHAUSTED"

        /** Recorded against a create with no usable `Idempotency-Key`. */
        const val MISSING_IDEMPOTENCY_KEY_CODE = "MISSING_IDEMPOTENCY_KEY"

        /** Recorded against an op for a stream this build cannot deliver. */
        const val UNKNOWN_ENTITY_TYPE_CODE = "UNKNOWN_ENTITY_TYPE"

        /** Recorded against an op kind this build cannot deliver. */
        const val UNKNOWN_OP_TYPE_CODE = "UNKNOWN_OP_TYPE"

        /** Fallback pause when a 429 arrived without a usable `Retry-After`. */
        const val DEFAULT_RETRY_AFTER_SECONDS: Long = 60L
    }
}
