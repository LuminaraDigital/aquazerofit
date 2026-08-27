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
    val goal: Goal,
    val activityLevel: ActivityLevel,
    val exerciseExperience: ExerciseExperience,
    val dietaryPreferences: List<DietaryPreference> = emptyList(),
    val allergies: List<Allergen> = emptyList(),
    val equipment: List<Equipment> = emptyList(),
    val unitPreference: UnitPreference = UnitPreference.METRIC,
    val targetWeightKg: Double? = null,
    val updatedAt: String,
)

/** Body for `PUT /me/profile` (shared `profileSchema`). */
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
    val tier: UserTier,
    val dailyCredits: Int,
    val creditsRemaining: Int,
    val costs: Map<String, Int> = emptyMap(),
    val premiumLanes: List<String> = emptyList(),
)
