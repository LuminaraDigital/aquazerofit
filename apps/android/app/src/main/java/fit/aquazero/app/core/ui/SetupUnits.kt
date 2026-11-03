package fit.aquazero.app.core.ui

import fit.aquazero.app.core.model.UnitPreference
import kotlin.math.roundToInt

/**
 * Imperial ↔ metric conversion for the two fields that offer both.
 *
 * Shared rather than owned by setup: the essentials form collects height and
 * weight, and Settings re-displays the same two numbers under the person's
 * current unit preference. One factor table has to serve both or the value a
 * person typed stops matching the value they are shown, so it sits below the
 * features instead of inside either one.
 */
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
