package fit.aquazero.app.feature.onboarding

import fit.aquazero.app.R
import fit.aquazero.app.core.model.ActivityLevel
import fit.aquazero.app.core.model.Goal
import fit.aquazero.app.core.model.UnitPreference
import kotlin.math.roundToInt

/**
 * The bounds `profileSchema` enforces server-side
 * (`packages/shared/src/schemas.ts` → `RANGES`). Mirrored here so a bad entry
 * is caught under the field instead of coming back as a 400 with a zod message
 * nobody wrote for a person to read.
 */
object SetupRanges {
    const val MIN_WEIGHT_KG = 30.0
    const val MAX_WEIGHT_KG = 300.0
    const val MIN_HEIGHT_CM = 100.0
    const val MAX_HEIGHT_CM = 250.0
    const val MIN_AGE = 16
    const val MAX_AGE = 100
}

/** Imperial ↔ metric conversion for the two fields that offer both. */
object SetupUnits {

    /** Exact international pound. */
    const val KG_PER_LB = 0.45359237

    /** Exact inch. */
    const val CM_PER_INCH = 2.54

    fun ftInToCm(feet: Int, inches: Int): Double = (feet * 12 + inches) * CM_PER_INCH

    fun cmToFtIn(cm: Double): Pair<Int, Int> {
        val totalInches = (cm / CM_PER_INCH).roundToInt()
        return (totalInches / 12) to (totalInches % 12)
    }

    fun lbToKg(pounds: Double): Double = pounds * KG_PER_LB

    fun kgToLb(kg: Double): Double = kg / KG_PER_LB

    /** Display value in the chosen unit, canonical storage always in kg. */
    fun kgToDisplay(kg: Double, unit: UnitPreference): Double =
        if (unit == UnitPreference.IMPERIAL) kgToLb(kg) else kg

    fun displayToKg(value: Double, unit: UnitPreference): Double =
        if (unit == UnitPreference.IMPERIAL) lbToKg(value) else value

    /** One decimal, matching what the server stores. */
    fun round1(value: Double): Double = (value * 10).roundToInt() / 10.0
}

/** What the six controls resolve to once units are applied. */
data class SetupEssentials(
    val age: Int,
    val heightCm: Double,
    val weightKg: Double,
    val sex: fit.aquazero.app.core.model.Sex,
    val goal: Goal,
    val activityLevel: ActivityLevel,
)

/** Outcome of checking the form. */
sealed interface SetupValidation {
    data class Valid(val essentials: SetupEssentials) : SetupValidation
    data class Invalid(val errorRes: Int) : SetupValidation
}

/**
 * Validation for the wellness essentials form, kept pure so the rules guarding
 * a calorie target are testable without a device.
 *
 * Order matters and is deliberate: fields are checked top to bottom in the
 * order they appear on screen, so the message that surfaces always names the
 * first thing the person would look at.
 */
object SetupForm {

    /**
     * Resolve the height controls to centimetres. Blank or unparsable input
     * becomes 0, which then fails the range check with the range message —
     * "height must be between…" reads better on an empty field than a separate
     * "this is required".
     */
    fun resolveHeightCm(
        unit: UnitPreference,
        heightCm: String,
        heightFt: String,
        heightIn: String,
    ): Double = if (unit == UnitPreference.IMPERIAL) {
        SetupUnits.ftInToCm(
            feet = heightFt.trim().toIntOrNull() ?: 0,
            inches = heightIn.trim().toIntOrNull() ?: 0,
        )
    } else {
        heightCm.trim().replace(',', '.').toDoubleOrNull() ?: 0.0
    }

    /** Resolve the weight control to canonical kilograms, rounded like the server. */
    fun resolveWeightKg(unit: UnitPreference, weight: String): Double {
        val parsed = weight.trim().replace(',', '.').toDoubleOrNull() ?: 0.0
        return SetupUnits.round1(SetupUnits.displayToKg(parsed, unit))
    }

    /**
     * Check the whole form.
     *
     * [requireWellnessConsent] is true only on a first setup: the consent block
     * is collected once with the first profile, and re-running the form later
     * must not quietly reset choices the person has since changed in Settings.
     */
    @Suppress("LongParameterList")
    fun validate(
        unit: UnitPreference,
        age: String,
        heightCm: String,
        heightFt: String,
        heightIn: String,
        weight: String,
        sex: fit.aquazero.app.core.model.Sex,
        goal: Goal?,
        activityLevel: ActivityLevel?,
        requireWellnessConsent: Boolean,
        wellnessConsent: Boolean,
    ): SetupValidation {
        val parsedAge = age.trim().toIntOrNull()
        if (parsedAge == null || parsedAge < SetupRanges.MIN_AGE || parsedAge > SetupRanges.MAX_AGE) {
            return SetupValidation.Invalid(R.string.setup_error_age)
        }

        val resolvedHeight = resolveHeightCm(unit, heightCm, heightFt, heightIn)
        if (resolvedHeight < SetupRanges.MIN_HEIGHT_CM || resolvedHeight > SetupRanges.MAX_HEIGHT_CM) {
            return SetupValidation.Invalid(
                if (unit == UnitPreference.IMPERIAL) {
                    R.string.setup_error_height_imperial
                } else {
                    R.string.setup_error_height_cm
                },
            )
        }

        val resolvedWeight = resolveWeightKg(unit, weight)
        if (resolvedWeight < SetupRanges.MIN_WEIGHT_KG || resolvedWeight > SetupRanges.MAX_WEIGHT_KG) {
            return SetupValidation.Invalid(
                if (unit == UnitPreference.IMPERIAL) {
                    R.string.setup_error_weight_lb
                } else {
                    R.string.setup_error_weight_kg
                },
            )
        }

        if (goal == null) return SetupValidation.Invalid(R.string.setup_error_goal)
        if (activityLevel == null) return SetupValidation.Invalid(R.string.setup_error_activity)
        if (requireWellnessConsent && !wellnessConsent) {
            return SetupValidation.Invalid(R.string.setup_error_consent)
        }

        return SetupValidation.Valid(
            SetupEssentials(
                age = parsedAge,
                heightCm = resolvedHeight,
                weightKg = resolvedWeight,
                sex = sex,
                goal = goal,
                activityLevel = activityLevel,
            ),
        )
    }

    /**
     * Re-express the typed weight so the physical value survives a unit
     * toggle. Null when there is nothing to convert.
     */
    fun convertWeightOnUnitSwitch(
        raw: String,
        from: UnitPreference,
        to: UnitPreference,
    ): String? {
        if (from == to) return null
        val parsed = raw.trim().replace(',', '.').toDoubleOrNull() ?: return null
        val kg = SetupUnits.displayToKg(parsed, from)
        return String.format(java.util.Locale.US, "%.1f", SetupUnits.kgToDisplay(kg, to))
    }
}
