package fit.aquazero.app.core.database

import androidx.room3.Entity
import androidx.room3.Index
import androidx.room3.PrimaryKey

/**
 * Server-owned catalog caches (read-only client-side). Each row keeps a few
 * queryable scalar columns plus the full API document as JSON ([docJson]) so
 * nothing the contract carries is ever lost in translation.
 */
@Entity(
    tableName = "foods",
    indices = [Index("name"), Index("barcode")],
)
data class FoodEntity(
    @PrimaryKey val id: String,
    val name: String,
    val brand: String? = null,
    val category: String = "",
    val barcode: String? = null,
    val kcalPer100g: Double = 0.0,
    /** Full `Food` document as JSON. */
    val docJson: String,
    /** Recency bookkeeping for the recent/frequent offline cache policy. */
    val lastUsedAt: Long = 0L,
    val useCount: Int = 0,
    val cachedAt: Long = 0L,
)

/** Cached `Recipe` document. */
@Entity(tableName = "recipes", indices = [Index("name")])
data class RecipeEntity(
    @PrimaryKey val id: String,
    val name: String,
    val tagsCsv: String = "",
    val docJson: String,
    val cachedAt: Long = 0L,
)

/** Cached `Exercise` document (attribution fields live in [docJson] too). */
@Entity(
    tableName = "exercises",
    indices = [Index("name"), Index("category")],
)
data class ExerciseEntity(
    @PrimaryKey val id: String,
    val name: String,
    val category: String = "strength",
    val difficulty: String = "beginner",
    val primaryMusclesCsv: String = "",
    val equipmentCsv: String = "",
    val licence: String = "",
    val licenceAuthor: String = "",
    val docJson: String,
    val cachedAt: Long = 0L,
)

/**
 * One media item of an exercise. CC-BY-SA attribution must render on every
 * card, so the licence fields are first-class columns.
 */
@Entity(
    tableName = "exercise_media",
    indices = [Index("exerciseId")],
)
data class ExerciseMediaEntity(
    @PrimaryKey(autoGenerate = true) val rowId: Long = 0L,
    val exerciseId: String,
    val kind: String,
    val url: String,
    val caption: String? = null,
    val source: String? = null,
    val licence: String? = null,
    val licenceAuthor: String? = null,
    val licenceUrl: String? = null,
    val attributionText: String? = null,
    val isAiGenerated: Boolean = false,
)

/**
 * Projection of the one image the library list draws per exercise.
 *
 * Carries the provenance columns rather than just the URL because a rendered
 * thumbnail has to credit *its own* author: the exercise document says
 * "wger.de community contributors" while the picture on it may be
 * Everkinetic's, and CC-BY-SA asks for the latter. See
 * `ExerciseAttribution.thumbnailCredit`.
 */
data class ExerciseThumbnail(
    val exerciseId: String,
    val url: String,
    val source: String? = null,
    val licence: String? = null,
    val licenceAuthor: String? = null,
    val attributionText: String? = null,
    val isAiGenerated: Boolean = false,
    /** Selection key only — [CatalogDao.thumbnailsFor] picks the lowest. */
    val rowId: Long = 0L,
)

/** Cached `AchievementDefinition`. */
@Entity(tableName = "achievement_definitions")
data class AchievementDefinitionEntity(
    @PrimaryKey val id: String,
    val name: String,
    val description: String = "",
    val icon: String = "",
    val ruleJson: String? = null,
)

/** Coach roster entry (static persona data + per-user entitlement snapshot). */
@Entity(tableName = "coaches")
data class CoachEntity(
    @PrimaryKey val coachId: String,
    val unlocked: Boolean = false,
    val reason: String = "locked",
    val requiredLevel: Int = 0,
    val bondXp: Int = 0,
    val bondLevel: Int = 1,
    val isActive: Boolean = false,
    val updatedAt: Long = 0L,
)
