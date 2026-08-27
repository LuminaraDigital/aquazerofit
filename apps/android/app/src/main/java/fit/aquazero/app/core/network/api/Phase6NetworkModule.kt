package fit.aquazero.app.core.network.api

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Named
import javax.inject.Singleton
import retrofit2.Retrofit

/**
 * Retrofit bindings for the services added by the settings / account-lifecycle
 * lane. They ride the same authenticated `@Named("api")` Retrofit as everything
 * else; the module is separate only so the addition is additive — see the
 * contract note at the top of [AccountApi].
 */
@Module
@InstallIn(SingletonComponent::class)
object Phase6NetworkModule {

    @Provides
    @Singleton
    fun accountApi(@Named("api") retrofit: Retrofit): AccountApi =
        retrofit.create(AccountApi::class.java)

    @Provides
    @Singleton
    fun suggestionsApi(@Named("api") retrofit: Retrofit): SuggestionsApi =
        retrofit.create(SuggestionsApi::class.java)
}
