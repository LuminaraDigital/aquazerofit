package fit.aquazero.app.core.ui

import androidx.annotation.StringRes
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import fit.aquazero.app.R
import fit.aquazero.app.core.model.BeltAwardDto
import fit.aquazero.app.core.model.BeltTier
import fit.aquazero.app.core.model.FightRecordEnvelopeDto
import fit.aquazero.app.core.model.FightRecordSeasonProgressDto
import fit.aquazero.app.core.model.FightRecordStatusDto
import fit.aquazero.app.core.model.SeasonDto
import java.time.LocalDate

/*
 * Fight Record vocabulary and state, shared by the dashboard's season card and
 * the Fight Record screen (AZF-W3-05). It lives in core/ui because those are
 * two features, and features never reach into each other: a belt named or a
 * next-belt sentence worded one way on the card and another on the screen is
 * exactly the drift this file exists to prevent.
 *
 * Copy rules (§2.7) bind every string these functions return: no "lost",
 * "lose", "broken", "break", "reset", "streak", "hurry", "only", "last
 * chance" or "expires", and days left is a sentence, never a countdown.
 */

/** Where a load of the Fight Record stands; the network half of the state. */
enum class FightRecordFetch { InFlight, Done, Failed }

/**
 * What a Fight Record surface shows. Four states, and only four, so a surface
 * cannot be "loading and failed" or "off but showing a belt".
 */
sealed interface FightRecordUiState {
    /** Nothing cached yet and the first answer is on its way: a skeleton. */
    data object Loading : FightRecordUiState

    /** Nothing cached and the fetch failed: the retry affordance. */
    data object Failed : FightRecordUiState

    /** The server says the feature is off for this account (US-10). */
    data object Off : FightRecordUiState

    data class Ready(val record: FightRecordStatusDto) : FightRecordUiState

    companion object {
        /**
         * A cached answer always wins over the fetch: a failed refresh behind
         * a good snapshot is not worth interrupting anyone for, and an "off"
         * snapshot keeps the surface invisible offline.
         *
         * [FightRecordFetch.Done] with nothing cached is the instant between
         * the write and Room's re-emission, so it still reads as loading.
         */
        fun of(cached: FightRecordEnvelopeDto?, fetch: FightRecordFetch): FightRecordUiState = when {
            cached != null -> cached.fightRecord?.let(::Ready) ?: Off
            fetch == FightRecordFetch.Failed -> Failed
            else -> Loading
        }
    }
}

/** What the next belt asks for. Pure, so the arithmetic is tested on the JVM. */
sealed interface NextBelt {
    data class Days(val days: Int, val tier: BeltTier) : NextBelt

    /** A rung this build cannot name (a tier added after it shipped). */
    data class DaysToUnnamed(val days: Int) : NextBelt

    /** Black is held: the top of the ladder this season. */
    data object TopOfLadder : NextBelt

    companion object {
        /**
         * Floored at one: the server only ever names a rung above the count,
         * so zero or less means a snapshot is out of step with itself, and
         * "0 active days to your Blue Belt" would be a stranger sentence than
         * the one it replaces.
         */
        fun of(progress: FightRecordSeasonProgressDto): NextBelt {
            val next = progress.next ?: return TopOfLadder
            val days = (next.activeDays - progress.activeDays).coerceAtLeast(1)
            return next.tier?.let { Days(days, it) } ?: DaysToUnnamed(days)
        }
    }
}

/** Share of the way to the next belt, 0..1; full once black is held. */
fun nextBeltProgress(progress: FightRecordSeasonProgressDto): Float {
    val target = progress.next?.activeDays ?: return 1f
    if (target <= 0) return 1f
    return (progress.activeDays.toFloat() / target).coerceIn(0f, 1f)
}

/** Whether [rung] is at or below the belt held this season. */
fun isRungHeld(rung: BeltTier, held: BeltTier?): Boolean = held != null && held.ordinal >= rung.ordinal

/** This season's award, which is what the Share button shares. */
fun currentSeasonBelt(record: FightRecordStatusDto): BeltAwardDto? =
    record.belts.firstOrNull { it.seasonNumber == record.current.season.number && it.tier != null }

@StringRes
fun beltNameRes(tier: BeltTier?): Int = when (tier) {
    BeltTier.WHITE -> R.string.fight_record_belt_white
    BeltTier.BLUE -> R.string.fight_record_belt_blue
    BeltTier.PURPLE -> R.string.fight_record_belt_purple
    BeltTier.BROWN -> R.string.fight_record_belt_brown
    BeltTier.BLACK -> R.string.fight_record_belt_black
    null -> R.string.fight_record_no_belt
}

/** "Blue Belt", or "No belt yet" before the first rung. */
@Composable
fun beltName(tier: BeltTier?): String = stringResource(beltNameRes(tier))

/** "12 active days to your Purple Belt." or the top-of-ladder line. */
@Composable
fun nextBeltText(progress: FightRecordSeasonProgressDto): String = when (val next = NextBelt.of(progress)) {
    is NextBelt.Days -> pluralStringResource(
        R.plurals.fight_record_next_belt,
        next.days,
        next.days,
        beltName(next.tier),
    )
    is NextBelt.DaysToUnnamed -> pluralStringResource(
        R.plurals.fight_record_next_belt_unnamed,
        next.days,
        next.days,
    )
    NextBelt.TopOfLadder -> stringResource(R.string.fight_record_top_of_ladder)
}

/** "23 days left in the season": plain information, never a timer. */
@Composable
fun daysLeftText(daysLeft: Int): String =
    pluralStringResource(R.plurals.fight_record_days_left, daysLeft, daysLeft)

/** "19 Oct to 13 Dec", in the device locale. */
@Composable
fun seasonDatesText(season: SeasonDto): String =
    stringResource(R.string.fight_record_season_dates, shortDate(season.startsOn), shortDate(season.endsOn))

/** Falls back to the ISO string rather than throwing inside composition. */
private fun shortDate(isoDate: String): String =
    runCatching { LocalDate.parse(isoDate).format(LocaleFormatters.of(SHORT_DATE_PATTERN)) }.getOrDefault(isoDate)

private const val SHORT_DATE_PATTERN = "d MMM"
