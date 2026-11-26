package fit.aquazero.app.core.data

import android.content.Context
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import fit.aquazero.app.core.health.HealthConnectConsentStore
import fit.aquazero.app.core.sync.MealPhotoUploadScheduler
import fit.aquazero.app.core.ui.reminders.ReminderPrefsStore
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Per-user state that lives outside Room, wiped by [LocalCachePurger] with the
 * tables. Without it the next account on the handset inherited the last one's
 * reminder schedule and Health Connect opt-in, and a meal photo queued before
 * logout uploaded under the next account. Anything new of this kind belongs
 * here, or it leaks across accounts the same way.
 */
fun interface UserScopedExtras {
    suspend fun clear()
}

@Singleton
class DeviceUserScopedExtras @Inject constructor(
    @param:ApplicationContext private val context: Context,
    private val photoUploads: MealPhotoUploadScheduler,
    private val reminderPrefs: ReminderPrefsStore,
    private val healthConsent: HealthConnectConsentStore,
) : UserScopedExtras {
    override suspend fun clear() {
        // Cancel before deleting, so a run that starts now finds no file.
        photoUploads.cancel()
        discardStagedMealPhotos(context.cacheDir)
        reminderPrefs.clear()
        healthConsent.clear()
    }
}

@Module
@InstallIn(SingletonComponent::class)
abstract class UserScopedExtrasModule {
    @Binds
    abstract fun bindUserScopedExtras(impl: DeviceUserScopedExtras): UserScopedExtras
}
