package fit.aquazero.app.feature.onboarding

import fit.aquazero.app.R
import fit.aquazero.app.core.model.ActivityLevel
import fit.aquazero.app.core.model.Goal
import fit.aquazero.app.core.model.Sex
import fit.aquazero.app.core.model.UnitPreference
import fit.aquazero.app.core.ui.SetupUnits
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The essentials form guards a calorie target, so its bounds are the shared
 * `profileSchema` bounds and nothing else: weight 30–300 kg, height 100–250 cm,
 * age 16–100, all applied to the canonical metric value however it was typed.
 */
class SetupValidationTest {

    private fun validate(
        unit: UnitPreference = UnitPreference.METRIC,
        age: String = "28",
        heightCm: String = "175",
        heightFt: String = "5",
        heightIn: String = "9",
        weight: String = "75",
        goal: Goal? = Goal.MAINTAIN,
        activity: ActivityLevel? = ActivityLevel.MODERATE,
        firstSetup: Boolean = false,
        wellnessConsent: Boolean = false,
    ) = SetupForm.validate(
        unit = unit,
        age = age,
        heightCm = heightCm,
        heightFt = heightFt,
        heightIn = heightIn,
        weight = weight,
        sex = Sex.UNSPECIFIED,
        goal = goal,
        activityLevel = activity,
        requireWellnessConsent = firstSetup,
        wellnessConsent = wellnessConsent,
    )

    @Test
    fun `a complete metric form resolves to the values that were typed`() {
        val result = validate()
        val essentials = (result as SetupValidation.Valid).essentials
        assertEquals(28, essentials.age)
        assertEquals(175.0, essentials.heightCm, 1e-9)
        assertEquals(75.0, essentials.weightKg, 1e-9)
    }

    @Test
    fun `imperial entries are converted before the bounds are applied`() {
        val result = validate(
            unit = UnitPreference.IMPERIAL,
            heightFt = "5",
            heightIn = "9",
            weight = "165",
        )
        val essentials = (result as SetupValidation.Valid).essentials
        // 5'9" = 175.26 cm, 165 lb = 74.8 kg at one decimal.
        assertEquals(175.26, essentials.heightCm, 1e-9)
        assertEquals(74.8, essentials.weightKg, 1e-9)
    }

    @Test
    fun `the age band is 16 to 100 inclusive`() {
        assertTrue(validate(age = "16") is SetupValidation.Valid)
        assertTrue(validate(age = "100") is SetupValidation.Valid)
        assertEquals(
            R.string.setup_error_age,
            (validate(age = "15") as SetupValidation.Invalid).errorRes,
        )
        assertEquals(
            R.string.setup_error_age,
            (validate(age = "101") as SetupValidation.Invalid).errorRes,
        )
    }

    @Test
    fun `an empty or unparsable age asks for an age rather than failing silently`() {
        listOf("", "   ", "abc").forEach { raw ->
            assertEquals(
                R.string.setup_error_age,
                (validate(age = raw) as SetupValidation.Invalid).errorRes,
            )
        }
    }

    @Test
    fun `the height band is 100 to 250 cm inclusive`() {
        assertTrue(validate(heightCm = "100") is SetupValidation.Valid)
        assertTrue(validate(heightCm = "250") is SetupValidation.Valid)
        assertEquals(
            R.string.setup_error_height_cm,
            (validate(heightCm = "99") as SetupValidation.Invalid).errorRes,
        )
        assertEquals(
            R.string.setup_error_height_cm,
            (validate(heightCm = "251") as SetupValidation.Invalid).errorRes,
        )
    }

    @Test
    fun `an out-of-band imperial height is worded in feet and inches`() {
        // 3'0" = 91.44 cm, under the floor.
        val result = validate(unit = UnitPreference.IMPERIAL, heightFt = "3", heightIn = "0")
        assertEquals(
            R.string.setup_error_height_imperial,
            (result as SetupValidation.Invalid).errorRes,
        )
    }

    @Test
    fun `the weight band is 30 to 300 kg applied to the canonical value`() {
        assertTrue(validate(weight = "30") is SetupValidation.Valid)
        assertTrue(validate(weight = "300") is SetupValidation.Valid)
        assertEquals(
            R.string.setup_error_weight_kg,
            (validate(weight = "29.9") as SetupValidation.Invalid).errorRes,
        )
        // 60 lb = 27.2 kg — the same physical floor, worded in pounds.
        assertEquals(
            R.string.setup_error_weight_lb,
            (
                validate(unit = UnitPreference.IMPERIAL, weight = "60")
                    as SetupValidation.Invalid
                ).errorRes,
        )
    }

    @Test
    fun `a comma decimal separator is accepted`() {
        val result = validate(weight = "75,5")
        assertEquals(75.5, (result as SetupValidation.Valid).essentials.weightKg, 1e-9)
    }

    @Test
    fun `goal and activity must both be chosen, and the message names the first gap`() {
        assertEquals(
            R.string.setup_error_goal,
            (validate(goal = null, activity = null) as SetupValidation.Invalid).errorRes,
        )
        assertEquals(
            R.string.setup_error_activity,
            (validate(activity = null) as SetupValidation.Invalid).errorRes,
        )
    }

    @Test
    fun `the wellness consent is required on a first setup and only then`() {
        assertEquals(
            R.string.setup_error_consent,
            (
                validate(firstSetup = true, wellnessConsent = false)
                    as SetupValidation.Invalid
                ).errorRes,
        )
        assertTrue(validate(firstSetup = true, wellnessConsent = true) is SetupValidation.Valid)
        // Re-running the form later must not re-demand a consent already given.
        assertTrue(validate(firstSetup = false, wellnessConsent = false) is SetupValidation.Valid)
    }

    @Test
    fun `switching units preserves the physical weight`() {
        val pounds = SetupForm.convertWeightOnUnitSwitch(
            "80",
            UnitPreference.METRIC,
            UnitPreference.IMPERIAL,
        )
        assertEquals("176.4", pounds)
        assertEquals(
            "80.0",
            SetupForm.convertWeightOnUnitSwitch(
                pounds!!,
                UnitPreference.IMPERIAL,
                UnitPreference.METRIC,
            ),
        )
    }

    @Test
    fun `switching to the same unit, or with nothing typed, changes nothing`() {
        assertNull(
            SetupForm.convertWeightOnUnitSwitch(
                "80",
                UnitPreference.METRIC,
                UnitPreference.METRIC,
            ),
        )
        assertNull(
            SetupForm.convertWeightOnUnitSwitch(
                "",
                UnitPreference.METRIC,
                UnitPreference.IMPERIAL,
            ),
        )
    }

    @Test
    fun `height round-trips through feet and inches`() {
        val (feet, inches) = SetupUnits.cmToFtIn(175.26)
        assertEquals(5, feet)
        assertEquals(9, inches)
        assertEquals(175.26, SetupUnits.ftInToCm(5, 9), 1e-9)
    }
}
