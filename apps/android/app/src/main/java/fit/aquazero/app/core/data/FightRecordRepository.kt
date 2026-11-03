package fit.aquazero.app.core.data

import fit.aquazero.app.core.database.ProgressDao
import fit.aquazero.app.core.database.ProgressSummaryEntity
import fit.aquazero.app.core.model.ApiResult
import fit.aquazero.app.core.model.AzfJson
import fit.aquazero.app.core.model.FightRecordEnvelopeDto
import fit.aquazero.app.core.model.FightRecordStatusDto
import fit.aquazero.app.core.model.map
import fit.aquazero.app.core.network.api.FightRecordApi
import fit.aquazero.app.core.network.safeCall
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Fight Record: seasons and Consistency Belts (AZF-W3-05), read-through with
 * an offline snapshot (FR-AND-04). Room is the UI source; [refresh] writes it.
 *
 * The snapshot lives in `progress_summary` under
 * [ProgressSummaryEntity.FIGHT_RECORD_KEY] rather than in a table of its own:
 * it is one whole server document, which is exactly what that table holds,
 * and a new entity would be a schema bump that v1's no-destructive-migration
 * rule turns into a migration this read-only surface does not justify. The
 * sign-out purge already clears the table, so belts leave with the account.
 *
 * What is cached is the **envelope**, not the status, so "feature off" is
 * remembered as an answer instead of being indistinguishable from "never
 * asked". That difference is the whole point of US-10 offline: deleting the
 * row on `null` would leave an off account with no snapshot, and the next
 * cold start without signal would show a loading skeleton and then a retry
 * card for a feature it does not have. With the envelope cached, an off
 * account renders nothing, online or not, from the first frame.
 */
@Singleton
class FightRecordRepository @Inject constructor(
    private val fightRecordApi: FightRecordApi,
    private val progressDao: ProgressDao,
) {

    /**
     * The server's last answer: null until it has answered once (or if the
     * stored document no longer decodes), otherwise the envelope, whose null
     * `fightRecord` means the feature is off for this account.
     */
    fun cached(): Flow<FightRecordEnvelopeDto?> =
        progressDao.snapshot(ProgressSummaryEntity.FIGHT_RECORD_KEY).map { it?.decode() }

    /** Fetch and store. A failure leaves the last good snapshot untouched. */
    suspend fun refresh(): ApiResult<FightRecordStatusDto?> {
        val result = safeCall { fightRecordApi.fightRecord() }
        if (result is ApiResult.Success) {
            progressDao.upsertSummary(
                ProgressSummaryEntity(
                    userId = ProgressSummaryEntity.FIGHT_RECORD_KEY,
                    docJson = AzfJson.encodeToString(FightRecordEnvelopeDto.serializer(), result.data),
                    cachedAt = System.currentTimeMillis(),
                ),
            )
        }
        return result.map { it.fightRecord }
    }

    private fun ProgressSummaryEntity.decode(): FightRecordEnvelopeDto? =
        runCatching { AzfJson.decodeFromString(FightRecordEnvelopeDto.serializer(), docJson) }.getOrNull()
}
