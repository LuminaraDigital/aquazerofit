package fit.aquazero.app.core.sync

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import fit.aquazero.app.core.data.SyncScheduler
import javax.inject.Singleton

/** Binds the WorkManager scheduler to the capability `core.data` declares. */
@Module
@InstallIn(SingletonComponent::class)
interface SyncBindings {

    @Binds
    @Singleton
    fun syncScheduler(impl: WorkManagerSyncScheduler): SyncScheduler
}
