package fit.aquazero.app.core.common

import fit.aquazero.app.core.model.ReadinessMode

/**
 * Context-aware coach nudge kinds for the dashboard ambient card.
 *
 * Labels and prompts are resolved in the composable from string resources so
 * this stays pure and JVM-testable without a Context.
 */
enum class CoachNudgeKind {
    ProteinGap,
    ReadinessProtect,
    ReadinessProgress,
    TodaysWorkout,
    WeightTrend,
    OpenChat,
}

/** Inputs for choosing up to three proactive nudges on the dashboard. */
data class CoachNudgeContext(
    val proteinRemainingG: Double?,
    val readinessMode: ReadinessMode?,
    val hasWorkoutToday: Boolean,
    val workoutFocus: String?,
    val coachLinePresent: Boolean,
)

/**
 * Picks the most relevant coach actions for right now. Nutrition and readiness
 * gaps come first; a generic open-chat nudge is the fallback.
 */
fun proactiveCoachNudges(context: CoachNudgeContext): List<CoachNudgeKind> {
    val nudges = mutableListOf<CoachNudgeKind>()
    val proteinGap = context.proteinRemainingG
    if (proteinGap != null && proteinGap >= 15.0) {
        nudges += CoachNudgeKind.ProteinGap
    }
    when (context.readinessMode) {
        ReadinessMode.PROTECT -> nudges += CoachNudgeKind.ReadinessProtect
        ReadinessMode.PROGRESS -> nudges += CoachNudgeKind.ReadinessProgress
        ReadinessMode.MAINTAIN, null -> Unit
    }
    if (context.hasWorkoutToday && !context.workoutFocus.isNullOrBlank()) {
        nudges += CoachNudgeKind.TodaysWorkout
    }
    if (nudges.isEmpty()) {
        nudges += CoachNudgeKind.OpenChat
    }
    return nudges.take(3)
}
