package fit.aquazero.app.core.health

import java.time.Duration
import kotlin.math.roundToInt
import kotlin.math.roundToLong

/**
 * Turning what the platform returns into what the card shows.
 *
 * Every function here maps "present but meaningless" onto null. Health Connect
 * answers an aggregation over an empty range with zero rather than with
 * nothing, so a phone that recorded no sleep last night and a phone that
 * recorded eight hours are told apart only here. Showing `0h 0m` where there
 * is no data claims a measurement that was never taken, and on a sleep figure
 * that reads as a health event rather than as an absence.
 */
object HealthRounding {

    /** Whole minutes of sleep, or null for a zero/negative total. */
    fun sleepMinutes(duration: Duration?): Long? {
        val minutes = duration?.toMinutes() ?: return null
        return minutes.takeIf { it > 0 }
    }

    /** Kilocalories to the nearest whole one, or null for zero/negative/NaN. */
    fun kilocalories(kcal: Double?): Int? {
        if (kcal == null || !kcal.isFinite() || kcal <= 0.0) return null
        return kcal.roundToInt()
    }

    /**
     * A step count, or null for zero.
     *
     * Negative is not merely filtered but treated as absent: it cannot happen,
     * and a screen is the wrong place to find out that it did.
     */
    fun steps(count: Long?): Long? = count?.takeIf { it > 0 }

    /** A heart rate in bpm, or null for a non-physiological value. */
    fun bpm(value: Long?): Long? = value?.takeIf { it in MIN_BPM..MAX_BPM }

    /** Kilograms rounded to one decimal, the precision a scale actually offers. */
    fun kilograms(kg: Double): Double = (kg * KG_DECIMAL).roundToLong() / KG_DECIMAL

    /** Below this a reading is an artefact of a sensor losing contact. */
    private const val MIN_BPM = 20L

    /** Above this it is noise; no human sustains it for a daily aggregate. */
    private const val MAX_BPM = 300L

    /** One decimal place. */
    private const val KG_DECIMAL = 10.0
}
