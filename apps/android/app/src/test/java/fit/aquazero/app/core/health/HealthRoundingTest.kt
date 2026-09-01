package fit.aquazero.app.core.health

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.Duration

/**
 * Turning aggregation output into something a card can show.
 *
 * The rule these all encode: Health Connect answers an aggregation over an
 * empty range with zero, not with nothing. Every zero that reaches the UI
 * therefore has to be turned back into an absence, or the card claims a
 * measurement that was never taken — "0h 0m" of sleep reads as a health event
 * rather than as a phone that was on the bedside table.
 */
class HealthRoundingTest {

    // ----- sleep -----

    @Test
    fun `sleep is reported in whole minutes`() {
        assertEquals(437L, HealthRounding.sleepMinutes(Duration.ofMinutes(437)))
    }

    @Test
    fun `seconds are truncated rather than rounded up into a minute`() {
        assertEquals(7L, HealthRounding.sleepMinutes(Duration.ofSeconds(479)))
    }

    @Test
    fun `no sleep recorded is absent, not zero`() {
        assertNull(HealthRounding.sleepMinutes(Duration.ZERO))
        assertNull(HealthRounding.sleepMinutes(null))
        assertNull(HealthRounding.sleepMinutes(Duration.ofSeconds(30)))
    }

    // ----- energy -----

    @Test
    fun `kilocalories round to the nearest whole one`() {
        assertEquals(2310, HealthRounding.kilocalories(2309.6))
        assertEquals(2309, HealthRounding.kilocalories(2309.4))
    }

    @Test
    fun `an impossible energy figure is dropped`() {
        assertNull(HealthRounding.kilocalories(null))
        assertNull(HealthRounding.kilocalories(0.0))
        assertNull(HealthRounding.kilocalories(-10.0))
        assertNull(HealthRounding.kilocalories(Double.NaN))
        assertNull(HealthRounding.kilocalories(Double.POSITIVE_INFINITY))
    }

    // ----- steps -----

    @Test
    fun `steps pass through and zero becomes absent`() {
        assertEquals(8421L, HealthRounding.steps(8421))
        assertNull(HealthRounding.steps(0))
        assertNull(HealthRounding.steps(null))
        assertNull(HealthRounding.steps(-1))
    }

    // ----- heart rate -----

    @Test
    fun `a plausible heart rate is kept`() {
        assertEquals(52L, HealthRounding.bpm(52))
        assertEquals(20L, HealthRounding.bpm(20))
        assertEquals(300L, HealthRounding.bpm(300))
    }

    @Test
    fun `a sensor artefact is dropped rather than shown`() {
        // A chest strap losing contact reports single digits, and a screen is
        // the wrong place for someone to first see a heart rate of 3.
        assertNull(HealthRounding.bpm(0))
        assertNull(HealthRounding.bpm(3))
        assertNull(HealthRounding.bpm(301))
        assertNull(HealthRounding.bpm(null))
    }

    // ----- weight -----

    @Test
    fun `weight is published at the precision a scale actually offers`() {
        assertEquals(82.5, HealthRounding.kilograms(82.4999), 0.0001)
        assertEquals(82.5, HealthRounding.kilograms(82.54), 0.0001)
        assertEquals(82.6, HealthRounding.kilograms(82.56), 0.0001)
    }

    @Test
    fun `a whole number of kilograms survives the rounding unchanged`() {
        assertEquals(80.0, HealthRounding.kilograms(80.0), 0.0001)
    }
}
