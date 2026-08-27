package fit.aquazero.app.feature.progress

import fit.aquazero.app.R
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class LogWeightValidationTest {

    private val today = "2026-08-27"

    @Test
    fun `a kilogram entry submits exactly what was typed`() {
        val result = LogWeightValidation.validate("83.4", WeightUnit.KG, today, today)
        assertEquals(83.4, (result as WeightValidation.Valid).canonicalKg, 1e-9)
    }

    @Test
    fun `a pound entry is converted to canonical kilograms before submission`() {
        val result = LogWeightValidation.validate("180", WeightUnit.LB, today, today)
        // 180 lb = 81.6466 kg → rounded to one decimal like the server stores.
        assertEquals(81.6, (result as WeightValidation.Valid).canonicalKg, 1e-9)
    }

    @Test
    fun `a comma decimal separator is accepted`() {
        val result = LogWeightValidation.validate("83,4", WeightUnit.KG, today, today)
        assertEquals(83.4, (result as WeightValidation.Valid).canonicalKg, 1e-9)
    }

    @Test
    fun `an empty or unparsable entry asks for a weight rather than failing silently`() {
        listOf("", "   ", "abc").forEach { raw ->
            val result = LogWeightValidation.validate(raw, WeightUnit.KG, today, today)
            assertEquals(
                R.string.log_weight_error_empty,
                (result as WeightValidation.Invalid).errorRes,
            )
        }
    }

    @Test
    fun `the 30 to 300 kg band is enforced on the canonical value`() {
        val low = LogWeightValidation.validate("29.9", WeightUnit.KG, today, today)
        val high = LogWeightValidation.validate("300.1", WeightUnit.KG, today, today)
        assertEquals(R.string.log_weight_error_range_kg, (low as WeightValidation.Invalid).errorRes)
        assertEquals(R.string.log_weight_error_range_kg, (high as WeightValidation.Invalid).errorRes)
        assertTrue(LogWeightValidation.validate("30", WeightUnit.KG, today, today) is WeightValidation.Valid)
        assertTrue(LogWeightValidation.validate("300", WeightUnit.KG, today, today) is WeightValidation.Valid)
    }

    @Test
    fun `the same physical band applies to pounds, with pound-worded copy`() {
        // 60 lb = 27.2 kg — under the floor.
        val result = LogWeightValidation.validate("60", WeightUnit.LB, today, today)
        assertEquals(R.string.log_weight_error_range_lb, (result as WeightValidation.Invalid).errorRes)
        // 150 lb = 68 kg — inside it.
        assertTrue(LogWeightValidation.validate("150", WeightUnit.LB, today, today) is WeightValidation.Valid)
    }

    @Test
    fun `a future date is rejected`() {
        val result = LogWeightValidation.validate("83.4", WeightUnit.KG, "2026-08-28", today)
        assertEquals(R.string.log_weight_error_future, (result as WeightValidation.Invalid).errorRes)
    }

    @Test
    fun `a past date is accepted`() {
        val result = LogWeightValidation.validate("83.4", WeightUnit.KG, "2026-08-01", today)
        assertTrue(result is WeightValidation.Valid)
    }

    @Test
    fun `toggling units preserves the physical weight`() {
        val toPounds = LogWeightValidation.convertOnUnitSwitch("80", WeightUnit.KG, WeightUnit.LB)
        assertEquals("176.4", toPounds)
        val backToKg = LogWeightValidation.convertOnUnitSwitch(
            toPounds!!,
            WeightUnit.LB,
            WeightUnit.KG,
        )
        assertEquals("80.0", backToKg)
    }

    @Test
    fun `toggling to the same unit or with nothing typed changes nothing`() {
        assertNull(LogWeightValidation.convertOnUnitSwitch("80", WeightUnit.KG, WeightUnit.KG))
        assertNull(LogWeightValidation.convertOnUnitSwitch("", WeightUnit.KG, WeightUnit.LB))
    }

    @Test
    fun `display conversion round-trips through the canonical unit`() {
        val kg = WeightUnits.toKg(176.37, WeightUnit.LB)
        assertEquals(80.0, kg, 1e-2)
        assertEquals(176.37, WeightUnits.fromKg(kg, WeightUnit.LB), 1e-2)
        assertEquals(80.0, WeightUnits.fromKg(80.0, WeightUnit.KG), 1e-9)
    }

    @Test
    fun `a gain and a loss format identically apart from the sign`() {
        assertEquals("+0.5", signedDisplay(0.5, WeightUnit.KG))
        assertEquals("-0.5", signedDisplay(-0.5, WeightUnit.KG))
    }
}
