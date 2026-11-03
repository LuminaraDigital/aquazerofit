package fit.aquazero.app.feature.fightrecord

import androidx.annotation.StringRes
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import fit.aquazero.app.R
import fit.aquazero.app.core.model.BeltTier
import fit.aquazero.app.core.model.FightRecordSeasonProgressDto
import fit.aquazero.app.core.model.SeasonDto
import fit.aquazero.app.core.ui.LocaleFormatters
import java.time.LocalDate

/*
 * Fight Record vocabulary, shared by the season card and the Fight Record
 * screen so the two cannot word a belt differently (AZF-W3-05).
 *
 * Copy rules (§2.7) bind every string these functions return: nothing can be
 * lost, broken or reset, nothing hurries anyone, and days left is a sentence,
 * never a countdown. FightRecordCopyTest holds the strings to that.
 */

/** What the next belt asks for. Pure, so the arithmetic is tested on the JVM. */
internal sealed interface NextBelt {
    data class Days(val days: Int, val tier: BeltTier) : NextBelt

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
            return Days((next.activeDays - progress.activeDays).coerceAtLeast(1), next.tier)
        }
    }
}

/** Share of the way to the next belt, 0..1; full once black is held. */
internal fun nextBeltProgress(progress: FightRecordSeasonProgressDto): Float {
    val target = progress.next?.activeDays ?: return 1f
    if (target <= 0) return 1f
    return (progress.activeDays.toFloat() / target).coerceIn(0f, 1f)
}

/** Whether [rung] is at or below the belt held this season. */
internal fun isRungHeld(rung: BeltTier, held: BeltTier?): Boolean = held != null && held.ordinal >= rung.ordinal

@StringRes
internal fun beltNameRes(tier: BeltTier?): Int = when (tier) {
    BeltTier.WHITE -> R.string.fight_record_belt_white
    BeltTier.BLUE -> R.string.fight_record_belt_blue
    BeltTier.PURPLE -> R.string.fight_record_belt_purple
    BeltTier.BROWN -> R.string.fight_record_belt_brown
    BeltTier.BLACK -> R.string.fight_record_belt_black
    BeltTier.UNKNOWN -> R.string.fight_record_belt_new
    null -> R.string.fight_record_no_belt
}

/** "Blue Belt", "New belt" for a tier this build cannot name, or "No belt yet". */
@Composable
internal fun beltName(tier: BeltTier?): String = stringResource(beltNameRes(tier))

/** "12 active days to your Purple Belt." or the top-of-ladder line. */
@Composable
internal fun nextBeltText(progress: FightRecordSeasonProgressDto): String = when (val next = NextBelt.of(progress)) {
    is NextBelt.Days -> pluralStringResource(
        R.plurals.fight_record_next_belt,
        next.days,
        next.days,
        beltName(next.tier),
    )
    NextBelt.TopOfLadder -> stringResource(R.string.fight_record_top_of_ladder)
}

/** "23 days left in the season": plain information, never a timer. */
@Composable
internal fun daysLeftText(daysLeft: Int): String =
    pluralStringResource(R.plurals.fight_record_days_left, daysLeft, daysLeft)

/** "19 Oct to 13 Dec", in the device locale. */
@Composable
internal fun seasonDatesText(season: SeasonDto): String =
    stringResource(R.string.fight_record_season_dates, shortDate(season.startsOn), shortDate(season.endsOn))

/** Falls back to the ISO string rather than throwing inside composition. */
private fun shortDate(isoDate: String): String =
    runCatching { LocalDate.parse(isoDate).format(LocaleFormatters.of(SHORT_DATE_PATTERN)) }.getOrDefault(isoDate)

private const val SHORT_DATE_PATTERN = "d MMM"
