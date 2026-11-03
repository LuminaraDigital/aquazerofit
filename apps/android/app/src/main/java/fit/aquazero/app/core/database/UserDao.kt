package fit.aquazero.app.core.database

import androidx.room3.Dao
import androidx.room3.Query
import androidx.room3.Transaction
import androidx.room3.Upsert
import kotlinx.coroutines.flow.Flow

/** DAO for account, profile, targets, consents and entitlements caches. */
@Dao
interface UserDao {

    @Upsert
    suspend fun upsertUser(user: UserEntity)

    @Query("SELECT * FROM user LIMIT 1")
    fun user(): Flow<UserEntity?>

    @Query("SELECT * FROM user LIMIT 1")
    suspend fun userOnce(): UserEntity?

    @Upsert
    suspend fun upsertProfile(profile: ProfileEntity)

    @Query("SELECT * FROM profile LIMIT 1")
    fun profile(): Flow<ProfileEntity?>

    @Query("SELECT * FROM profile LIMIT 1")
    suspend fun profileOnce(): ProfileEntity?

    @Upsert
    suspend fun upsertTargets(targets: TargetsEntity)

    @Query("SELECT * FROM targets LIMIT 1")
    fun targets(): Flow<TargetsEntity?>

    @Query("SELECT * FROM targets LIMIT 1")
    suspend fun targetsOnce(): TargetsEntity?

    @Upsert
    suspend fun upsertConsents(consents: ConsentEntity)

    @Query("SELECT * FROM consents LIMIT 1")
    fun consents(): Flow<ConsentEntity?>

    @Upsert
    suspend fun upsertEntitlements(entitlements: EntitlementsEntity)

    @Query("SELECT * FROM entitlements LIMIT 1")
    fun entitlements(): Flow<EntitlementsEntity?>

    /** Purge all per-user rows (different-user sign-in; plan §4.2 policy). */
    @Query("DELETE FROM user")
    suspend fun clearUser()

    @Query("DELETE FROM profile")
    suspend fun clearProfile()

    @Query("DELETE FROM targets")
    suspend fun clearTargets()

    @Query("DELETE FROM consents")
    suspend fun clearConsents()

    @Query("DELETE FROM entitlements")
    suspend fun clearEntitlements()

    @Transaction
    suspend fun clearAllAccountRows() {
        clearUser()
        clearProfile()
        clearTargets()
        clearConsents()
        clearEntitlements()
    }
}
