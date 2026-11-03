package fit.aquazero.app.core.common

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import java.time.Clock
import javax.inject.Singleton

/**
 * The app's single source of "now".
 *
 * Injected rather than read statically so that anything holding a day across
 * time can be tested across a midnight boundary. A test binds
 * `Clock.fixed(...)` and advances it; production gets the system clock in the
 * device's current zone, which is what [LocalDates] needs to key days the way
 * the web client does.
 */
@Module
@InstallIn(SingletonComponent::class)
object TimeModule {

    @Provides
    @Singleton
    fun clock(): Clock = Clock.systemDefaultZone()
}
