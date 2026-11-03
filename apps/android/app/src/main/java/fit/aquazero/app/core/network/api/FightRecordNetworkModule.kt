package fit.aquazero.app.core.network.api

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import retrofit2.Retrofit
import javax.inject.Named
import javax.inject.Singleton

/**
 * Retrofit binding for [FightRecordApi], on the same authenticated
 * `@Named("api")` Retrofit as everything else. New APIs get their own module
 * like this one, so `NetworkModule` stays under its detekt function cap.
 */
@Module
@InstallIn(SingletonComponent::class)
object FightRecordNetworkModule {

    @Provides
    @Singleton
    fun fightRecordApi(@Named("api") retrofit: Retrofit): FightRecordApi =
        retrofit.create(FightRecordApi::class.java)
}
