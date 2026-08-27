package fit.aquazero.app.core.data

import fit.aquazero.app.core.database.ProgressDao
import fit.aquazero.app.core.database.ProgressSummaryEntity
import fit.aquazero.app.core.database.TrendPointEntity
import fit.aquazero.app.core.model.ApiResult
import fit.aquazero.app.core.model.AzfJson
import fit.aquazero.app.core.network.api.LogsApi
import fit.aquazero.app.core.network.api.ProgressApi
import fit.aquazero.app.core.model.ProgressSummaryDto
import fit.aquazero.app.core.network.safeCall
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

/**
 * Progress summary + trend series. Room `Flow` as UI source with
 * refresh-on-observe network fetches (server wins on conflict).
 */
@Singleton
class ProgressRepository @Inject constructor(
    private val progressApi: ProgressApi,
    private val logsApi: LogsApi,
    private val progressDao: ProgressDao,
) {

    /** Cached, decoded progress summary (null until first refresh). */
    fun summary(): Flow<ProgressSummaryDto?> = progressDao.summary().map { it?.decode() }

    /** Cached trend series (`weight`, `kcal`, `proteinG`, `carbsG`, `fatG`). */
    fun series(series: String): Flow<List<TrendPointEntity>> = progressDao.series(series)

    /** Refresh the summary snapshot (also refreshes the weight series). */
    suspend fun refreshSummary(): ApiResult<ProgressSummaryDto> =
        when (val result = safeCall { progressApi.summary() }) {
            is ApiResult.Success -> {
                progressDao.upsertSummary(
                    ProgressSummaryEntity(
                        userId = "me",
                        docJson = AzfJson.encodeToString(ProgressSummaryDto.serializer(), result.data),
                        cachedAt = System.currentTimeMillis(),
                    ),
                )
                progressDao.replaceSeries(
                    SERIES_WEIGHT,
                    result.data.weightSeries.map {
                        TrendPointEntity(series = SERIES_WEIGHT, date = it.date, value = it.value)
                    },
                )
                result
            }
            is ApiResult.Failure -> result
        }

    /** Refresh the nutrition trend series for a range. */
    suspend fun refreshNutritionTrends(range: String = "7d"): ApiResult<Unit> =
        when (val result = safeCall { logsApi.nutritionTrends(range) }) {
            is ApiResult.Success -> {
                val trends = result.data
                progressDao.replaceSeries(
                    SERIES_KCAL,
                    trends.kcal.map { TrendPointEntity(series = SERIES_KCAL, date = it.date, value = it.value) },
                )
                progressDao.replaceSeries(
                    SERIES_PROTEIN,
                    trends.proteinG.map { TrendPointEntity(series = SERIES_PROTEIN, date = it.date, value = it.value) },
                )
                ApiResult.Success(Unit)
            }
            is ApiResult.Failure -> result
        }

    /** The weekly insight (online-only AI lane with deterministic fallback). */
    suspend fun insight(periodDays: Int? = null) = safeCall { progressApi.insight(periodDays) }

    private fun ProgressSummaryEntity.decode(): ProgressSummaryDto? =
        runCatching { AzfJson.decodeFromString(ProgressSummaryDto.serializer(), docJson) }.getOrNull()

    companion object {
        const val SERIES_WEIGHT = "weight"
        const val SERIES_KCAL = "kcal"
        const val SERIES_PROTEIN = "proteinG"
    }
}
