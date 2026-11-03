package fit.aquazero.app.core.database

import androidx.room3.Dao
import androidx.room3.Query
import androidx.room3.Upsert
import kotlinx.coroutines.flow.Flow

/** DAO for the server-owned catalog caches. */
@Dao
interface CatalogDao {

    // ----- foods (recent/frequent cache; corpus search stays server-side) -----

    @Upsert
    suspend fun upsertFoods(foods: List<FoodEntity>)

    @Query("SELECT * FROM foods WHERE name LIKE '%' || :query || '%' ORDER BY useCount DESC LIMIT :limit")
    suspend fun searchCachedFoods(query: String, limit: Int): List<FoodEntity>

    @Query("SELECT * FROM foods WHERE id = :id")
    suspend fun foodById(id: String): FoodEntity?

    @Query("SELECT * FROM foods ORDER BY lastUsedAt DESC LIMIT :limit")
    fun recentFoods(limit: Int): Flow<List<FoodEntity>>

    @Query("UPDATE foods SET lastUsedAt = :nowMs, useCount = useCount + 1 WHERE id = :id")
    suspend fun touchFood(id: String, nowMs: Long)

    // ----- recipes -----

    @Upsert
    suspend fun upsertRecipes(recipes: List<RecipeEntity>)

    @Query("SELECT * FROM recipes ORDER BY name")
    fun recipes(): Flow<List<RecipeEntity>>

    @Query("SELECT * FROM recipes WHERE id = :id")
    suspend fun recipeById(id: String): RecipeEntity?

    // ----- coaches -----

    // The `achievement_definitions` accessors were removed: nothing ever wrote
    // or read them — achievements come straight from the network. The entity
    // and its table are still registered, because dropping them is a schema
    // change and this database forbids destructive migration; that removal is
    // a migration of its own. Deleting only the accessors costs nothing.

    @Upsert
    suspend fun upsertCoaches(coaches: List<CoachEntity>)

    @Query("SELECT * FROM coaches")
    fun coaches(): Flow<List<CoachEntity>>

    @Query("SELECT * FROM coaches WHERE isActive = 1 LIMIT 1")
    fun activeCoach(): Flow<CoachEntity?>
}
