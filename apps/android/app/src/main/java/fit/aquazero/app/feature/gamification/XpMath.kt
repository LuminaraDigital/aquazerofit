package fit.aquazero.app.feature.gamification

import fit.aquazero.app.core.model.ExperienceStatusDto
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

/**
 * Client mirror of `packages/shared/src/gamification.ts` — the read half.
 *
 * The server folds the ledger and owns every number; this file exists so the
 * UI can draw a level curve, name a rank, and — critically — refuse to render
 * a scoreboard that goes backwards.
 *
 * **XP never decreases.** That is a safety rule in a product that also holds a
 * person's weight and intake, not a nicety: a number that can fall is a
 * punishment display, and the most engaged users are the ones it would punish
 * hardest. Snapshots can still arrive out of order — a stale cached roster
 * landing after a fresh progression poll, an offline read replacing an online
 * one — so [MonotonicExperience] clamps them on the way in. There is
 * deliberately no code path in this package that can produce a lower total
 * than the one already on screen, and no "you need N more" phrasing anywhere
 * that reads it.
 */
object XpMath {

    /** Each level costs [LEVEL_STEP] more than the one before (75, 150, 225…). */
    const val LEVEL_STEP: Int = 75
    const val MAX_LEVEL: Int = 50

    /** Ceiling on one day's earnings, applied after the per-rule caps. */
    const val MAX_PER_DAY: Int = 150

    /** Cumulative XP at which [level] begins. Level 1 starts at 0. */
    fun xpForLevel(level: Int): Int {
        val n = max(1, level)
        return LEVEL_STEP * (n - 1) * n / 2
    }

    /** Highest level fully paid for by [totalXp]. */
    fun levelForXp(totalXp: Int): Int {
        val xp = max(0, totalXp)
        var level = floor((1.0 + sqrt(1.0 + 8.0 * xp / LEVEL_STEP)) / 2.0).toInt()
        level = min(MAX_LEVEL, max(1, level))
        // Correct by at most one step in each direction so floating-point error
        // can never award or withhold a level at a boundary.
        while (level < MAX_LEVEL && xpForLevel(level + 1) <= xp) level += 1
        while (level > 1 && xpForLevel(level) > xp) level -= 1
        return level
    }

    /** Progress through the current level, 0–1. 1 at [MAX_LEVEL]. */
    fun levelProgress(totalXp: Int): Float {
        val level = levelForXp(totalXp)
        if (level >= MAX_LEVEL) return 1f
        val start = xpForLevel(level)
        val span = xpForLevel(level + 1) - start
        if (span <= 0) return 1f
        return ((totalXp - start).toFloat() / span).coerceIn(0f, 1f)
    }
}

/** A named band over the level ladder. */
data class CoachRank(val id: String, val name: String, val minLevel: Int)

/**
 * The Heavens Tournament bracket, ascending. Rank names are the roster's own
 * fight-card language and are not localised, matching `COACH_RANKS`.
 */
val COACH_RANKS: List<CoachRank> = listOf(
    CoachRank("rookie", "Rookie", 1),
    CoachRank("contender", "Contender", 3),
    CoachRank("prospect", "Prospect", 5),
    CoachRank("ranked", "Ranked", 8),
    CoachRank("top-eight", "Top Eight", 11),
    CoachRank("heavens", "Heavens Bracket", 14),
    CoachRank("champion", "Champion", 18),
)

/** The last band [level] clears. */
fun rankForLevel(level: Int): CoachRank {
    var rank = COACH_RANKS.first()
    for (candidate in COACH_RANKS) if (level >= candidate.minLevel) rank = candidate
    return rank
}

/** Bond: XP earned while a given coach was selected. Linear, ten steps, then stops. */
object Bond {
    const val STEP: Int = 250
    const val MAX_LEVEL: Int = 10

    fun levelForXp(bondXp: Int): Int =
        min(MAX_LEVEL, 1 + max(0, bondXp) / STEP)
}

/**
 * A ratchet over [ExperienceStatusDto] snapshots.
 *
 * Holds the highest total, level and per-day earnings seen this session and
 * republishes a snapshot that can only move forward. It is a display guard,
 * not a ledger: the server is still the authority, and the next honest
 * refresh will exceed whatever is held here. What it removes is the one
 * outcome the product forbids — the user watching a number fall.
 */
class MonotonicExperience(initial: ExperienceStatusDto? = null) {

    private var held: ExperienceStatusDto? = initial

    val current: ExperienceStatusDto? get() = held

    /** Merge [next], keeping the greater of every monotone field. */
    fun accept(next: ExperienceStatusDto): ExperienceStatusDto {
        val previous = held
        val merged = if (previous == null) {
            next
        } else {
            val totalXp = max(previous.totalXp, next.totalXp)
            val level = max(previous.level, XpMath.levelForXp(totalXp))
            val rank = rankForLevel(level)
            // Earned-today can legitimately reset at local midnight; a *drop*
            // within the same total is the stale-snapshot case, so the guard
            // only holds the floor while the total has not moved.
            val earnedToday = if (next.totalXp >= previous.totalXp) {
                max(previous.earnedToday, next.earnedToday)
            } else {
                previous.earnedToday
            }
            val breakdown = if (next.todayBreakdown.sumOf { it.points } >= earnedToday) {
                next.todayBreakdown
            } else {
                previous.todayBreakdown
            }
            next.copy(
                totalXp = totalXp,
                level = level,
                rank = next.rank.copy(id = rank.id, name = rank.name, minLevel = rank.minLevel),
                levelStartXp = XpMath.xpForLevel(level),
                nextLevelXp = if (level >= XpMath.MAX_LEVEL) null else XpMath.xpForLevel(level + 1),
                levelProgress = XpMath.levelProgress(totalXp).toDouble(),
                earnedToday = earnedToday,
                todayBreakdown = breakdown,
                dailyCapReached = earnedToday >= XpMath.MAX_PER_DAY,
            )
        }
        held = merged
        return merged
    }
}

/** XP into the current level — the "banked" number, never a shortfall. */
val ExperienceStatusDto.bankedIntoLevel: Int
    get() = max(0, totalXp - levelStartXp)

/** Size of the current level's step; 0 at the top of the ladder. */
val ExperienceStatusDto.levelSpan: Int
    get() = nextLevelXp?.let { max(0, it - levelStartXp) } ?: 0
