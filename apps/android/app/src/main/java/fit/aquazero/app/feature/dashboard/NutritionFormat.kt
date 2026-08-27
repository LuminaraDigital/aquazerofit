package fit.aquazero.app.feature.dashboard

import androidx.annotation.StringRes
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Cookie
import androidx.compose.material.icons.outlined.DinnerDining
import androidx.compose.material.icons.outlined.FreeBreakfast
import androidx.compose.material.icons.outlined.LunchDining
import androidx.compose.ui.graphics.vector.ImageVector
import fit.aquazero.app.R
import fit.aquazero.app.core.network.dto.FoodDto
import fit.aquazero.app.core.network.dto.MealLogItemDto
import fit.aquazero.app.core.network.dto.MealType
import fit.aquazero.app.core.network.dto.WorkoutSessionDto
import java.time.LocalDate
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.util.Locale
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Kotlin port of `apps/web/src/pages/dashboard/lib.ts` — the small
 * date/format/nutrition-math helpers the dashboard owns and the nutrition
 * screens share (same ownership split as the web client).
 *
 * Everything here is pure: no Android framework, no coroutines, no Compose
 * state. That keeps the per-100g → grams arithmetic (which must be *computed*,
 * never estimated) covered by plain JVM unit tests.
 */
object NutritionFormat {

    /** Canonical meal ordering used by every timeline and picker. */
    val MEAL_TYPES: List<MealType> = listOf(
        MealType.BREAKFAST,
        MealType.LUNCH,
        MealType.DINNER,
        MealType.SNACK,
    )

    /** Localised label for a meal type (`MEAL_LABEL` on the web). */
    @StringRes
    fun mealLabelRes(mealType: MealType): Int = when (mealType) {
        MealType.BREAKFAST -> R.string.meal_breakfast
        MealType.LUNCH -> R.string.meal_lunch
        MealType.DINNER -> R.string.meal_dinner
        MealType.SNACK -> R.string.meal_snack
    }

    /** Icon for a meal type (`MEAL_ICON` on the web). */
    fun mealIcon(mealType: MealType): ImageVector = when (mealType) {
        MealType.BREAKFAST -> Icons.Outlined.FreeBreakfast
        MealType.LUNCH -> Icons.Outlined.LunchDining
        MealType.DINNER -> Icons.Outlined.DinnerDining
        MealType.SNACK -> Icons.Outlined.Cookie
    }

    /** Best-guess meal type for the current time of day. */
    fun mealTypeForNow(hour: Int = LocalTime.now().hour): MealType = when {
        hour < 11 -> MealType.BREAKFAST
        hour < 15 -> MealType.LUNCH
        hour < 18 -> MealType.SNACK
        else -> MealType.DINNER
    }

    /** Integer with thousands separators for kcal-style displays. */
    fun fmtInt(value: Double, locale: Locale = Locale.getDefault()): String =
        String.format(locale, "%,d", value.roundToInt())

    /** One-decimal rounding, matching the API's `round1`. */
    fun round1(value: Double): Double = (value * 10.0).roundToInt() / 10.0

    /** Percentage of a target, clamped to 0..100. */
    fun clampPct(consumed: Double, target: Double): Int {
        if (target <= 0.0) return 0
        return max(0, min(100, ((consumed / target) * 100.0).roundToInt()))
    }

    /** Progress fraction of a target, clamped to 0f..1f. */
    fun clampFraction(consumed: Double, target: Double): Float {
        if (target <= 0.0) return 0f
        return (consumed / target).toFloat().coerceIn(0f, 1f)
    }

    /**
     * Deterministic client-side kcal/macros from a food's per-100g values.
     * The factor is computed in code — nothing here is model-estimated.
     *
     * Deliberate mobile addition over the web's `itemFromFood`: the optional
     * micronutrients are carried through too (they exist on `per100g` and the
     * API accepts them), so the nutrition screen's micronutrient rows have
     * real data for manually searched foods, not only photo/chat logs.
     */
    fun itemFromFood(food: FoodDto, grams: Int): MealLogItemDto {
        val factor = grams / 100.0
        val per = food.per100g
        return MealLogItemDto(
            foodId = food.id,
            name = food.name,
            grams = grams.toDouble(),
            kcal = (per.kcal * factor).roundToInt().toDouble(),
            proteinG = round1(per.proteinG * factor),
            carbsG = round1(per.carbsG * factor),
            fatG = round1(per.fatG * factor),
            fiberG = per.fiberG?.let { round1(it * factor) },
            sugarG = per.sugarG?.let { round1(it * factor) },
            sodiumMg = per.sodiumMg?.let { round1(it * factor) },
            potassiumMg = per.potassiumMg?.let { round1(it * factor) },
            calciumMg = per.calciumMg?.let { round1(it * factor) },
            ironMg = per.ironMg?.let { round1(it * factor) },
        )
    }

    /**
     * Rescale an already-logged item to a new portion. Anchored to the
     * ORIGINAL logged values so repeated edits never compound rounding — the
     * same reason the web keeps `{original, current}` pairs per row.
     */
    fun rescaleItem(original: MealLogItemDto, grams: Int): MealLogItemDto {
        val factor = if (original.grams > 0) grams / original.grams else 0.0
        return original.copy(
            grams = grams.toDouble(),
            kcal = (original.kcal * factor).roundToInt().toDouble(),
            proteinG = round1(original.proteinG * factor),
            carbsG = round1(original.carbsG * factor),
            fatG = round1(original.fatG * factor),
            fiberG = original.fiberG?.let { round1(it * factor) },
            sugarG = original.sugarG?.let { round1(it * factor) },
            sodiumMg = original.sodiumMg?.let { round1(it * factor) },
            potassiumMg = original.potassiumMg?.let { round1(it * factor) },
            calciumMg = original.calciumMg?.let { round1(it * factor) },
            ironMg = original.ironMg?.let { round1(it * factor) },
        )
    }

    /** Rough duration estimate when a session carries no explicit duration. */
    fun estimateDurationMinutes(session: WorkoutSessionDto): Int {
        session.durationMinutes?.takeIf { it > 0 }?.let { return it }
        val totalSets = session.exercises.sumOf { it.setsPlanned }
        return max(15, (totalSets * 2.5).roundToInt())
    }

    /** "Tuesday, 29 July" style label for a `YYYY-MM-DD` local date. */
    fun formatLocalDate(isoDate: String, locale: Locale = Locale.getDefault()): String =
        runCatching {
            LocalDate.parse(isoDate).format(DateTimeFormatter.ofPattern("EEEE, d MMMM", locale))
        }.getOrDefault(isoDate)

    /** Short "Tue 29 Jul" label. */
    fun formatShortDate(isoDate: String, locale: Locale = Locale.getDefault()): String =
        runCatching {
            LocalDate.parse(isoDate).format(DateTimeFormatter.ofPattern("EEE d MMM", locale))
        }.getOrDefault(isoDate)

    /** Single-letter weekday initial for the weekly kcal bars. */
    fun narrowWeekday(isoDate: String, locale: Locale = Locale.getDefault()): String =
        runCatching {
            LocalDate.parse(isoDate).dayOfWeek.getDisplayName(TextStyle.NARROW, locale)
        }.getOrDefault("")

    /** Day-of-month number for the calendar grid. */
    fun dayOfMonth(isoDate: String): Int =
        runCatching { LocalDate.parse(isoDate).dayOfMonth }.getOrDefault(0)
}
