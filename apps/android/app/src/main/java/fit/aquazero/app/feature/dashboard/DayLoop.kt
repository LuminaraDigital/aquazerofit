package fit.aquazero.app.feature.dashboard

import androidx.compose.runtime.Immutable
import fit.aquazero.app.core.model.MealType
import java.time.LocalDate
import java.time.temporal.ChronoUnit

/** One thing today can hold, in the order a day runs. */
enum class DayStepKind { WeighIn, Breakfast, Lunch, Workout, Dinner, Water }

/**
 * Where a step stands. There is deliberately no "missed": a lunch nobody logged
 * is still [Open] at 8pm, available and silent. Some people skip lunch, and a
 * tracker that marks that as a failure teaches the wrong thing.
 */
enum class DayStepState { Done, Next, Open }

/** How today's session reads to the loop. */
enum class WorkoutToday { Scheduled, Completed, RestOrUnknown }

/** How today's weigh-in reads to the loop. */
enum class WeighInToday { NotDue, Due, Done }

/**
 * What the planner may look at.
 *
 * Calories, macros and body weight are absent on purpose, and that is the
 * safety property of this file: the loop rewards showing up and can never
 * reward eating less or weighing less, because it cannot see either.
 */
data class DayLoopInput(
    val hour: Int,
    val mealsLogged: Set<MealType>,
    val waterMl: Int,
    val waterTargetMl: Int,
    val workout: WorkoutToday,
    val weighIn: WeighInToday,
)

/** One row of today's timeline. */
@Immutable
data class DayStep(val kind: DayStepKind, val state: DayStepState)

/** Today's plan, and the single thing most worth doing about it right now. */
@Immutable
data class DayLoop(val steps: List<DayStep>) {
    val doneCount: Int get() = steps.count { it.state == DayStepState.Done }
    val next: DayStepKind? get() = steps.firstOrNull { it.state == DayStepState.Next }?.kind
    val closed: Boolean get() = steps.isNotEmpty() && doneCount == steps.size
}

/**
 * Decides what Home should ask for next. Pure and clock-free, so the behaviour
 * that decides how often this app asks for attention is testable on the JVM.
 *
 * It asks for one thing at a time, inside the window where that thing is
 * natural, and it stops: between 22:00 and 05:00 nothing is ever next, and a
 * closed loop has nothing further to offer.
 */
object DayLoopPlanner {
    private const val QUIET_FROM_HOUR = 22
    private const val QUIET_UNTIL_HOUR = 5
    private const val BREAKFAST_END_HOUR = 11
    private const val LUNCH_END_HOUR = 15
    private const val DINNER_START_HOUR = 17
    private const val WORKOUT_START_HOUR = 6
    private const val WORKOUT_END_HOUR = 21
    private const val HYDRATION_START_HOUR = 7
    private const val HYDRATION_DAY_HOURS = 14

    /** Two glasses. Less than this behind pace is not worth interrupting for. */
    private const val WATER_BEHIND_ML = 500

    private const val WEIGH_IN_INTERVAL_DAYS = 7L

    fun plan(input: DayLoopInput): DayLoop {
        val kinds = buildList {
            if (input.weighIn != WeighInToday.NotDue) add(DayStepKind.WeighIn)
            add(DayStepKind.Breakfast)
            add(DayStepKind.Lunch)
            if (input.workout != WorkoutToday.RestOrUnknown) add(DayStepKind.Workout)
            add(DayStepKind.Dinner)
            if (input.waterTargetMl > 0) add(DayStepKind.Water)
        }
        val open = kinds.filterNot { isDone(it, input) }
        val next = pickNext(open, input)
        return DayLoop(
            kinds.map { kind ->
                DayStep(
                    kind = kind,
                    state = when {
                        kind !in open -> DayStepState.Done
                        kind == next -> DayStepState.Next
                        else -> DayStepState.Open
                    },
                )
            },
        )
    }

    /**
     * Weekly at most. Daily weigh-ins amplify noise that means nothing and are
     * a known aggravator of disordered eating, so the loop never asks for one.
     */
    fun weighInToday(lastWeighIn: String?, today: LocalDate): WeighInToday {
        val last = lastWeighIn?.let { runCatching { LocalDate.parse(it.take(ISO_DATE_LENGTH)) }.getOrNull() }
            ?: return WeighInToday.Due
        return when {
            last == today -> WeighInToday.Done
            ChronoUnit.DAYS.between(last, today) >= WEIGH_IN_INTERVAL_DAYS -> WeighInToday.Due
            else -> WeighInToday.NotDue
        }
    }

    private fun isDone(kind: DayStepKind, input: DayLoopInput): Boolean = when (kind) {
        DayStepKind.WeighIn -> input.weighIn == WeighInToday.Done
        DayStepKind.Breakfast -> MealType.BREAKFAST in input.mealsLogged
        DayStepKind.Lunch -> MealType.LUNCH in input.mealsLogged
        DayStepKind.Dinner -> MealType.DINNER in input.mealsLogged
        DayStepKind.Workout -> input.workout == WorkoutToday.Completed
        DayStepKind.Water -> input.waterMl >= input.waterTargetMl
    }

    /** Highest-scoring open step that is relevant at this hour, or none. */
    private fun pickNext(open: List<DayStepKind>, input: DayLoopInput): DayStepKind? {
        if (input.hour >= QUIET_FROM_HOUR || input.hour < QUIET_UNTIL_HOUR) return null
        return open
            .mapNotNull { kind -> urgency(kind, input)?.let { kind to it } }
            .maxByOrNull { (_, score) -> score }
            ?.first
    }

    /** Null means "not now". Meals lead inside their window: they are perishable. */
    private fun urgency(kind: DayStepKind, input: DayLoopInput): Int? {
        val hour = input.hour
        return when (kind) {
            DayStepKind.Breakfast -> SCORE_MEAL.takeIf { hour < BREAKFAST_END_HOUR }
            DayStepKind.Lunch -> SCORE_MEAL.takeIf { hour in BREAKFAST_END_HOUR until LUNCH_END_HOUR }
            DayStepKind.Dinner -> SCORE_MEAL.takeIf { hour >= DINNER_START_HOUR }
            DayStepKind.Water -> SCORE_WATER.takeIf { waterBehindPace(input) }
            DayStepKind.WeighIn -> SCORE_WEIGH_IN.takeIf { hour < BREAKFAST_END_HOUR }
            DayStepKind.Workout -> SCORE_WORKOUT.takeIf { hour in WORKOUT_START_HOUR until WORKOUT_END_HOUR }
        }
    }

    private fun waterBehindPace(input: DayLoopInput): Boolean {
        val hoursIn = (input.hour - HYDRATION_START_HOUR).coerceIn(0, HYDRATION_DAY_HOURS)
        val expected = input.waterTargetMl * hoursIn / HYDRATION_DAY_HOURS
        return expected - input.waterMl >= WATER_BEHIND_ML
    }

    private const val ISO_DATE_LENGTH = 10
    private const val SCORE_WEIGH_IN = 110
    private const val SCORE_MEAL = 100
    private const val SCORE_WATER = 90
    private const val SCORE_WORKOUT = 80
}
