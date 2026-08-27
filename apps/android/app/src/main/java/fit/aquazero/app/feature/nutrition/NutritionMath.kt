package fit.aquazero.app.feature.nutrition

import androidx.annotation.StringRes
import fit.aquazero.app.R
import fit.aquazero.app.core.model.Allergen
import fit.aquazero.app.core.model.FoodDto
import fit.aquazero.app.core.model.MealLogItemDto
import fit.aquazero.app.feature.dashboard.NutritionFormat
import kotlin.math.roundToInt

/** Rolled-up micronutrients for one day. */
data class Micronutrients(
    val fiberG: Double = 0.0,
    val sugarG: Double = 0.0,
    val sodiumMg: Int = 0,
    val potassiumMg: Int = 0,
    val calciumMg: Int = 0,
    val ironMg: Double = 0.0,
) {
    /** True when nothing logged today carried micronutrient data. */
    val isEmpty: Boolean
        get() = fiberG == 0.0 && sugarG == 0.0 && sodiumMg == 0 &&
            potassiumMg == 0 && calciumMg == 0 && ironMg == 0.0
}

/**
 * Pure nutrition arithmetic for the day view. Kept free of Compose and
 * coroutines so the per-100g → grams maths and the allergen mirror are
 * covered by plain JVM tests — neither is ever estimated.
 */
object NutritionMath {

    /** Sum the optional micronutrients across every item logged that day. */
    fun micronutrients(items: List<MealLogItemDto>): Micronutrients {
        var fiber = 0.0
        var sugar = 0.0
        var sodium = 0.0
        var potassium = 0.0
        var calcium = 0.0
        var iron = 0.0
        for (item in items) {
            fiber += item.fiberG ?: 0.0
            sugar += item.sugarG ?: 0.0
            sodium += item.sodiumMg ?: 0.0
            potassium += item.potassiumMg ?: 0.0
            calcium += item.calciumMg ?: 0.0
            iron += item.ironMg ?: 0.0
        }
        return Micronutrients(
            fiberG = NutritionFormat.round1(fiber),
            sugarG = NutritionFormat.round1(sugar),
            sodiumMg = sodium.roundToInt(),
            potassiumMg = potassium.roundToInt(),
            calciumMg = calcium.roundToInt(),
            ironMg = NutritionFormat.round1(iron),
        )
    }

    /**
     * A food's declared allergens in the canonical order of the shared
     * `ALLERGENS` union. Declared allergens are surfaced verbatim — the
     * client never infers one and never filters one out, so this can never
     * produce a false negative.
     */
    fun allergensOf(food: FoodDto): List<Allergen> =
        Allergen.entries.filter { it in food.allergens }

    /** [allergensOf] mapped to localised labels. */
    @StringRes
    fun allergenLabels(food: FoodDto): List<Int> = allergensOf(food).map { allergenLabel(it) }

    @StringRes
    fun allergenLabel(allergen: Allergen): Int = when (allergen) {
        Allergen.PEANUTS -> R.string.allergen_peanuts
        Allergen.TREE_NUTS -> R.string.allergen_tree_nuts
        Allergen.MILK -> R.string.allergen_milk
        Allergen.EGGS -> R.string.allergen_eggs
        Allergen.FISH -> R.string.allergen_fish
        Allergen.SHELLFISH -> R.string.allergen_shellfish
        Allergen.SOY -> R.string.allergen_soy
        Allergen.WHEAT -> R.string.allergen_wheat
        Allergen.SESAME -> R.string.allergen_sesame
    }

    /** Bar height fraction for the weekly kcal chart, floored so a zero day still reads. */
    fun barFraction(value: Double, max: Double): Float {
        if (max <= 0.0) return MIN_BAR_FRACTION
        return (value / max).toFloat().coerceIn(MIN_BAR_FRACTION, 1f)
    }

    /** Minimum visible bar height so an empty day is still a legible tick. */
    const val MIN_BAR_FRACTION: Float = 0.04f
}
