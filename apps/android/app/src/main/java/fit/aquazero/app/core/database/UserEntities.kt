package fit.aquazero.app.core.database

import androidx.room3.Entity
import androidx.room3.PrimaryKey

/**
 * Cached account/profile documents (server-owned, online-write). Singleton
 * rows keyed by a constant id — there is exactly one signed-in user.
 */
@Entity(tableName = "user")
data class UserEntity(
    @PrimaryKey val id: String,
    val email: String,
    val displayName: String,
    val role: String = "user",
    val tier: String = "free",
    val emailVerified: Boolean = false,
    val hasProfile: Boolean = false,
    val timezone: String? = null,
    val createdAt: String = "",
    val updatedAtMs: Long = 0L,
)

/** Cached `WellnessProfile` (full document JSON + a few hot columns). */
@Entity(tableName = "profile")
data class ProfileEntity(
    @PrimaryKey val userId: String,
    val weightKg: Double,
    val goal: String,
    val unitPreference: String = "metric",
    val allergiesCsv: String = "",
    val docJson: String,
    val updatedAt: String = "",
)

/** Cached `DerivedTargets`. */
@Entity(tableName = "targets")
data class TargetsEntity(
    @PrimaryKey val userId: String,
    val kcalTarget: Double = 0.0,
    val proteinG: Double = 0.0,
    val carbsG: Double = 0.0,
    val fatG: Double = 0.0,
    val waterMl: Double = 0.0,
    val docJson: String,
    val computedAt: String = "",
)

/** Cached `ConsentState` — the four granular consent bits. */
@Entity(tableName = "consents")
data class ConsentEntity(
    @PrimaryKey val userId: String,
    val wellnessDataProcessing: Boolean = false,
    val aiPersonalisation: Boolean = false,
    val anonymisedAnalytics: Boolean = false,
    val reminders: Boolean = false,
    val updatedAt: String = "",
)

/** Cached entitlements snapshot (`GET /me/entitlements`). */
@Entity(tableName = "entitlements")
data class EntitlementsEntity(
    @PrimaryKey val userId: String,
    val tier: String = "free",
    val dailyCredits: Int = 0,
    val creditsRemaining: Int = 0,
    val docJson: String,
    val updatedAtMs: Long = 0L,
)
