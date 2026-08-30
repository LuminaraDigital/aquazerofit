package fit.aquazero.app.core.model

import kotlinx.serialization.Serializable

/** Mirrors TS `WellnessProfile`. */
@Serializable
data class WellnessProfileDto(
    val userId: String,
    val weightKg: Double,
    val heightCm: Double,
    val age: Int,
    val sex: Sex = Sex.UNSPECIFIED,
    // The three below are defaulted for decode tolerance only: a value this
    // build does not recognise must not fail the whole profile. Each falls
    // back to the least assuming option rather than a flattering one.
    val goal: Goal = Goal.MAINTAIN,
    val activityLevel: ActivityLevel = ActivityLevel.SEDENTARY,
    val exerciseExperience: ExerciseExperience = ExerciseExperience.BEGINNER,
    val dietaryPreferences: List<DietaryPreference> = emptyList(),
    val allergies: List<Allergen> = emptyList(),
    val equipment: List<Equipment> = emptyList(),
    val unitPreference: UnitPreference = UnitPreference.METRIC,
    val targetWeightKg: Double? = null,
    val updatedAt: String,
)

/**
 * Body for `PUT /me/profile` (shared `profileSchema`).
 *
 * Outbound only — nothing ever decodes this type, so [goal], [activityLevel]
 * and [exerciseExperience] deliberately stay required. `coerceInputValues` has
 * no bearing on an encode, and a default here would buy nothing while making
 * it possible to silently ship someone else's goal for a user who chose one.
 */
@Serializable
data class ProfileInputDto(
    val weightKg: Double,
    val heightCm: Double,
    val age: Int,
    val sex: Sex = Sex.UNSPECIFIED,
    val goal: Goal,
    val activityLevel: ActivityLevel,
    val exerciseExperience: ExerciseExperience,
    val dietaryPreferences: List<DietaryPreference> = emptyList(),
    val allergies: List<Allergen> = emptyList(),
    val equipment: List<Equipment> = listOf(Equipment.NONE),
    val unitPreference: UnitPreference = UnitPreference.METRIC,
    val targetWeightKg: Double? = null,
)

/** Mirrors TS `DerivedTargets`. */
@Serializable
data class DerivedTargetsDto(
    val userId: String,
    val bmr: Double,
    val tdee: Double,
    val kcalTarget: Double,
    val proteinG: Double,
    val carbsG: Double,
    val fatG: Double,
    val waterMl: Double,
    val clamped: Boolean = false,
    val clampReason: String? = null,
    val computedAt: String,
    val formulaVersion: String,
)

/** Mirrors TS `ConsentState`. */
@Serializable
data class ConsentStateDto(
    val wellnessDataProcessing: Boolean,
    val aiPersonalisation: Boolean,
    val anonymisedAnalytics: Boolean,
    val reminders: Boolean,
    val updatedAt: String,
)

/** Body for `PUT /me/consents`. */
@Serializable
data class ConsentUpdateRequest(
    val wellnessDataProcessing: Boolean,
    val aiPersonalisation: Boolean,
    val anonymisedAnalytics: Boolean,
    val reminders: Boolean,
)

/** Response of `GET /me/entitlements`. */
@Serializable
data class EntitlementsDto(
    /** Defaults to the *least* entitled tier: an unreadable tier grants nothing. */
    val tier: UserTier = UserTier.FREE,
    val dailyCredits: Int,
    val creditsRemaining: Int,
    /**
     * Ceiling on a banked balance — the daily grant tops [creditsRemaining] up
     * towards this number and never past it.
     *
     * Defaults to 0, which is the sentinel for "this server did not say":
     * builds predating the ceiling omit the field and still carry unspent
     * credits over without limit. Any other default would be a number the plan
     * screen prints as fact, so a stale server would have the app quote a
     * savings ceiling nobody is enforcing.
     */
    val maxBankedCredits: Int = 0,
    val costs: Map<String, Int> = emptyMap(),
    val premiumLanes: List<String> = emptyList(),
)
