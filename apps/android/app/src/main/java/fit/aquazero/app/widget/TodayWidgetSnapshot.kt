package fit.aquazero.app.widget

import fit.aquazero.app.core.common.LocalDailyNutrition
import fit.aquazero.app.core.model.WorkoutSessionStatus
import fit.aquazero.app.core.ui.NutritionFormat

/** Today's training session, reduced to the three states the widget can draw. */
enum class WidgetWorkoutState {
    /**
     * Nothing is cached for today. Either the plan has never been fetched on
     * this device or today is a rest day — the widget cannot tell the two
     * apart from Room alone, so it says nothing rather than guessing.
     */
    UNKNOWN,

    /** A session exists for today and has not been completed. */
    PENDING,

    /** Today's session is done. */
    DONE,
}

/**
 * Everything the widget draws, as one immutable value containing no Android
 * types.
 *
 * This is the [fit.aquazero.app.core.sync.OutboxDrainer] split applied to a
 * widget: the RemoteViews half cannot be exercised without a host, so every
 * decision that is not "which composable" — is the day loaded, is the account
 * set up, how full is the ring, is the workout done — is made here instead,
 * where a plain JVM test can reach it.
 *
 * Nothing in here computes nutrition. [LocalDailyNutrition] arrives already
 * folded by `DailyNutritionCalculator`, which is the same instance of the same
 * recompute the dashboard rings read; this type only picks fields out of it.
 */
data class TodayWidgetSnapshot(
    val kcalConsumed: Double,
    val kcalTarget: Double,
    val waterMl: Int,
    val waterTargetMl: Int,
    val workout: WidgetWorkoutState,
    /** False until Room has answered once — see [Loading]. */
    val loaded: Boolean,
) {

    /**
     * True once the account has targets to measure a day against.
     *
     * A signed-out or half-onboarded device has an empty `targets` row, and
     * the recompute faithfully reports a target of zero for it. Drawing "0 /
     * 0 kcal" against that is not a neutral placeholder — it reads as a
     * failure of the app — so the widget shows a setup prompt instead. This
     * is also the widget's signed-out state: `targets` is purged with the
     * rest of the per-user rows on sign-out.
     */
    val configured: Boolean
        get() = kcalTarget > 0.0 || waterTargetMl > 0

    /**
     * Calorie progress as the 0..1 fraction a Glance progress bar takes.
     *
     * Derived here rather than at the call site so the clamp is not something
     * the drawing code can forget: [NutritionFormat.clampPct] is the rule the
     * dashboard's rings already obey, and it is what keeps a 3,000 kcal day
     * against a 2,100 kcal target from handing the host a bar that is 143%
     * full, and a target of zero from handing it a NaN.
     */
    val kcalFraction: Float
        get() = NutritionFormat.clampPct(kcalConsumed, kcalTarget) / PERCENT

    companion object {

        /** `clampPct` answers in percent; a progress bar wants a fraction. */
        private const val PERCENT = 100f

        /** What the widget draws before the first Room emission arrives. */
        val Loading = TodayWidgetSnapshot(
            kcalConsumed = 0.0,
            kcalTarget = 0.0,
            waterMl = 0,
            waterTargetMl = 0,
            workout = WidgetWorkoutState.UNKNOWN,
            loaded = false,
        )

        /** Fold one Room emission into the value the widget renders. */
        fun of(nutrition: LocalDailyNutrition, sessionStatus: String?): TodayWidgetSnapshot =
            TodayWidgetSnapshot(
                kcalConsumed = nutrition.kcalConsumed,
                kcalTarget = nutrition.kcalTarget,
                waterMl = nutrition.waterConsumedMl,
                waterTargetMl = nutrition.waterTargetMl,
                workout = workoutStateOf(sessionStatus),
                loaded = true,
            )

        /**
         * `PlansRepository` caches the status as `status.name.lowercase()`,
         * which is a default-locale lowercase of an enum constant. Matching
         * the literal `"completed"` would therefore be matching one half of a
         * pair that can drift, so this compares against the enum itself and
         * ignores case — which also survives the Turkish-locale dotless-i
         * that the cache write is quietly exposed to.
         */
        private fun workoutStateOf(sessionStatus: String?): WidgetWorkoutState = when {
            sessionStatus == null -> WidgetWorkoutState.UNKNOWN
            sessionStatus.equals(WorkoutSessionStatus.COMPLETED.name, ignoreCase = true) ->
                WidgetWorkoutState.DONE
            else -> WidgetWorkoutState.PENDING
        }
    }
}
