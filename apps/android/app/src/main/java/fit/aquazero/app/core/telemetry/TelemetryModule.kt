package fit.aquazero.app.core.telemetry

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

/**
 * Binds the telemetry SPI to its Firebase implementations.
 *
 * The whole backend choice is these three lines; feature code injects the
 * interfaces in `Telemetry.kt` and never names a vendor.
 */
@Module
@InstallIn(SingletonComponent::class)
abstract class TelemetryModule {

    @Binds
    @Singleton
    abstract fun crashReporter(impl: CrashlyticsCrashReporter): CrashReporter

    @Binds
    @Singleton
    abstract fun analyticsTracker(impl: FirebaseAnalyticsTracker): AnalyticsTracker

    @Binds
    @Singleton
    abstract fun telemetryCollection(impl: FirebaseTelemetryCollection): TelemetryCollection
}
