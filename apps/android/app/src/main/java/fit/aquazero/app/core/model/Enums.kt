// The serial name and the constant belong on one line here: this file mirrors
// `packages/shared/src/types.ts` one entry per union member, and splitting each
// entry across three lines makes drift between the two files harder to spot in
// review. Both rules stay on everywhere else.
@file:Suppress(
    "ktlint:standard:annotation",
    "ktlint:standard:spacing-between-declarations-with-annotations",
)

package fit.aquazero.app.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Controlled vocabularies mirroring `packages/shared/src/types.ts`.
 * Serial names match the TS string unions exactly.
 */

@Serializable
enum class Sex {
    @SerialName("male") MALE,
    @SerialName("female") FEMALE,
    @SerialName("unspecified") UNSPECIFIED,
}

@Serializable
enum class Goal {
    @SerialName("lose") LOSE,
    @SerialName("maintain") MAINTAIN,
    @SerialName("gain") GAIN,
}

@Serializable
enum class ActivityLevel {
    @SerialName("sedentary") SEDENTARY,
    @SerialName("light") LIGHT,
    @SerialName("moderate") MODERATE,
    @SerialName("active") ACTIVE,
    @SerialName("veryActive") VERY_ACTIVE,
}

@Serializable
enum class ExerciseExperience {
    @SerialName("beginner") BEGINNER,
    @SerialName("intermediate") INTERMEDIATE,
    @SerialName("advanced") ADVANCED,
}

@Serializable
enum class UnitPreference {
    @SerialName("metric") METRIC,
    @SerialName("imperial") IMPERIAL,
}

@Serializable
enum class NutritionEmphasis {
    @SerialName("standard") STANDARD,
    @SerialName("protein_first") PROTEIN_FIRST,
}

@Serializable
enum class MealType {
    @SerialName("breakfast") BREAKFAST,
    @SerialName("lunch") LUNCH,
    @SerialName("dinner") DINNER,
    @SerialName("snack") SNACK,
}

@Serializable
enum class UserRole {
    @SerialName("user") USER,
    @SerialName("admin") ADMIN,
}

@Serializable
enum class UserTier {
    @SerialName("free") FREE,
    @SerialName("premium") PREMIUM,
}

@Serializable
enum class DietaryPreference {
    @SerialName("vegetarian") VEGETARIAN,
    @SerialName("vegan") VEGAN,
    @SerialName("pescatarian") PESCATARIAN,
    @SerialName("halal") HALAL,
    @SerialName("kosher") KOSHER,
    @SerialName("glutenFree") GLUTEN_FREE,
    @SerialName("dairyFree") DAIRY_FREE,
    @SerialName("lowCarb") LOW_CARB,
    @SerialName("highProtein") HIGH_PROTEIN,
}

@Serializable
enum class Allergen {
    @SerialName("peanuts") PEANUTS,
    @SerialName("treeNuts") TREE_NUTS,
    @SerialName("milk") MILK,
    @SerialName("eggs") EGGS,
    @SerialName("fish") FISH,
    @SerialName("shellfish") SHELLFISH,
    @SerialName("soy") SOY,
    @SerialName("wheat") WHEAT,
    @SerialName("sesame") SESAME,
}

@Serializable
enum class Equipment {
    @SerialName("none") NONE,
    @SerialName("dumbbells") DUMBBELLS,
    @SerialName("resistanceBands") RESISTANCE_BANDS,
    @SerialName("kettlebell") KETTLEBELL,
    @SerialName("pullUpBar") PULL_UP_BAR,
    @SerialName("bench") BENCH,
    @SerialName("yogaMat") YOGA_MAT,
    @SerialName("jumpRope") JUMP_ROPE,
    @SerialName("barbell") BARBELL,
    @SerialName("ezBar") EZ_BAR,
    @SerialName("cableMachine") CABLE_MACHINE,
    @SerialName("smithMachine") SMITH_MACHINE,
    @SerialName("swissBall") SWISS_BALL,
    @SerialName("inclineBench") INCLINE_BENCH,
}

/** MealLog provenance. */
@Serializable
enum class MealLogSource {
    @SerialName("manual") MANUAL,
    @SerialName("photo") PHOTO,
    @SerialName("recommendation") RECOMMENDATION,
    @SerialName("chat") CHAT,
}

@Serializable
enum class SafetyCategory {
    @SerialName("safe") SAFE,
    @SerialName("medical") MEDICAL,
    @SerialName("crisis") CRISIS,
    @SerialName("extremeDiet") EXTREME_DIET,
    @SerialName("outOfScope") OUT_OF_SCOPE,
}

@Serializable
enum class ConsistencyState {
    @SerialName("resting") RESTING,
    @SerialName("building") BUILDING,
    @SerialName("recovering") RECOVERING,
    @SerialName("steady") STEADY,
}

@Serializable
enum class ReadinessMode {
    @SerialName("protect") PROTECT,
    @SerialName("maintain") MAINTAIN,
    @SerialName("progress") PROGRESS,
}

@Serializable
enum class MemoryFactCategory {
    @SerialName("preference") PREFERENCE,
    @SerialName("constraint") CONSTRAINT,
    @SerialName("goal") GOAL,
    @SerialName("milestone") MILESTONE,
    @SerialName("context") CONTEXT,
}

@Serializable
enum class MemoryFactStatus {
    @SerialName("suggested") SUGGESTED,
    @SerialName("confirmed") CONFIRMED,
    @SerialName("rejected") REJECTED,
}

@Serializable
enum class Nutriscore {
    @SerialName("a") A,
    @SerialName("b") B,
    @SerialName("c") C,
    @SerialName("d") D,
    @SerialName("e") E,
}

@Serializable
enum class VisionJobStatus {
    @SerialName("queued") QUEUED,
    @SerialName("processing") PROCESSING,
    @SerialName("succeeded") SUCCEEDED,
    @SerialName("failed") FAILED,
    @SerialName("confirmed") CONFIRMED,
}

@Serializable
enum class WorkoutSessionStatus {
    @SerialName("pending") PENDING,
    @SerialName("inProgress") IN_PROGRESS,
    @SerialName("completed") COMPLETED,
    @SerialName("skipped") SKIPPED,
}

@Serializable
enum class BuddyChallengeKind {
    @SerialName("logging_streak") LOGGING_STREAK,
    @SerialName("workouts") WORKOUTS,
    @SerialName("meal_logs") MEAL_LOGS,
}

@Serializable
enum class BuddyChallengeStatus {
    @SerialName("open") OPEN,
    @SerialName("active") ACTIVE,
    @SerialName("completed") COMPLETED,
    @SerialName("expired") EXPIRED,
}

@Serializable
enum class ChatRole {
    @SerialName("user") USER,
    @SerialName("assistant") ASSISTANT,
    @SerialName("system") SYSTEM,
}

@Serializable
enum class ChatMealDraftStatus {
    @SerialName("proposed") PROPOSED,
    @SerialName("empty") EMPTY,
    @SerialName("confirmed") CONFIRMED,
    @SerialName("dismissed") DISMISSED,
}

@Serializable
enum class ChatMealItemStatus {
    @SerialName("resolved") RESOLVED,
    @SerialName("ambiguous") AMBIGUOUS,
    @SerialName("unmatched") UNMATCHED,
}

@Serializable
enum class GramsBasis {
    @SerialName("statedMass") STATED_MASS,
    @SerialName("statedVolume") STATED_VOLUME,
    @SerialName("namedServing") NAMED_SERVING,
    @SerialName("defaultServing") DEFAULT_SERVING,
    @SerialName("assumed") ASSUMED,
}

/** How a coach is or is not currently unlocked. */
@Serializable
enum class CoachLockReason {
    @SerialName("free") FREE,
    @SerialName("level") LEVEL,
    @SerialName("purchased") PURCHASED,
    @SerialName("locked") LOCKED,
}

@Serializable
enum class CoachExpression {
    @SerialName("neutral") NEUTRAL,
    @SerialName("celebrate") CELEBRATE,
    @SerialName("encourage") ENCOURAGE,
}
