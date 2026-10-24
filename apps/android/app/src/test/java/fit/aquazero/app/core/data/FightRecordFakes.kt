package fit.aquazero.app.core.data

import fit.aquazero.app.core.database.ProgressDao
import fit.aquazero.app.core.database.ProgressSummaryEntity
import fit.aquazero.app.core.database.TrendPointEntity
import fit.aquazero.app.core.model.BeltAwardDto
import fit.aquazero.app.core.model.BeltRungDto
import fit.aquazero.app.core.model.BeltTier
import fit.aquazero.app.core.model.FightRecordEnvelopeDto
import fit.aquazero.app.core.model.FightRecordSeasonProgressDto
import fit.aquazero.app.core.model.FightRecordStatusDto
import fit.aquazero.app.core.model.SeasonDto
import fit.aquazero.app.core.network.api.FightRecordApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map
import java.io.IOException

/**
 * Doubles for the Fight Record lane. [FightRecordRepository] is final and
 * thin, so tests drive the real one over these, which keeps its envelope
 * caching inside the assertion's reach instead of stubbing it out.
 */

/** In-memory [FightRecordApi]: answers [envelope], or throws when [offline]. */
class FakeFightRecordApi : FightRecordApi {

    var envelope: FightRecordEnvelopeDto = FightRecordEnvelopeDto(fightRecordStatus())
    var offline: Boolean = false
    var calls: Int = 0

    override suspend fun fightRecord(): FightRecordEnvelopeDto {
        calls++
        if (offline) throw IOException("offline")
        return envelope
    }
}

/**
 * In-memory [ProgressDao] that honours the keyed reads the real queries make:
 * [summary] sees only the progress key and [snapshot] only the key it is given.
 * Trend series are stubs; nothing under test writes them.
 */
class FakeProgressDao : ProgressDao {

    val rows = MutableStateFlow<Map<String, ProgressSummaryEntity>>(emptyMap())

    override suspend fun upsertSummary(summary: ProgressSummaryEntity) {
        rows.value = rows.value + (summary.userId to summary)
    }

    override fun summary(): Flow<ProgressSummaryEntity?> =
        rows.map { it[ProgressSummaryEntity.PROGRESS_SUMMARY_KEY] }

    override fun snapshot(key: String): Flow<ProgressSummaryEntity?> = rows.map { it[key] }

    override suspend fun clearSummary() {
        rows.value = emptyMap()
    }

    override suspend fun upsertTrendPoints(points: List<TrendPointEntity>) = Unit
    override suspend fun clearSeries(series: String) = Unit
    override fun series(series: String): Flow<List<TrendPointEntity>> = MutableStateFlow(emptyList())
    override suspend fun clearAllTrendPoints() = Unit
}

/** A season-3 status as the server would send it; override what a test needs. */
fun fightRecordStatus(
    activeDays: Int = 14,
    tier: BeltTier? = BeltTier.BLUE,
    next: BeltRungDto? = BeltRungDto(BeltTier.PURPLE, 24),
    belts: List<BeltAwardDto> = listOf(
        BeltAwardDto(id = "b3", seasonNumber = 3, seasonName = "Second Wind", tier = BeltTier.BLUE),
    ),
) = FightRecordStatusDto(
    current = FightRecordSeasonProgressDto(
        season = SeasonDto(
            id = "season-3",
            number = 3,
            name = "Second Wind",
            startsOn = "2027-03-01",
            endsOn = "2027-04-25",
        ),
        activeDays = activeDays,
        daysLeft = 23,
        tier = tier,
        next = next,
    ),
    ladder = listOf(
        BeltRungDto(BeltTier.WHITE, 3),
        BeltRungDto(BeltTier.BLUE, 12),
        BeltRungDto(BeltTier.PURPLE, 24),
        BeltRungDto(BeltTier.BROWN, 36),
        BeltRungDto(BeltTier.BLACK, 48),
    ),
    belts = belts,
)
