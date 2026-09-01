package fit.aquazero.app.core.database

import androidx.room3.Dao
import androidx.room3.Query
import androidx.room3.Transaction

/**
 * Per-user overlays stored in catalog tables (coach unlock state, food recency).
 * Cleared on logout and different-user sign-in, not on catalog refresh.
 */
@Dao
interface UserOverlayDao {

    @Query("DELETE FROM coaches")
    suspend fun clearCoaches()

    @Query("UPDATE foods SET lastUsedAt = 0, useCount = 0")
    suspend fun resetFoodRecency()

    @Transaction
    suspend fun clearAll() {
        clearCoaches()
        resetFoodRecency()
    }
}
