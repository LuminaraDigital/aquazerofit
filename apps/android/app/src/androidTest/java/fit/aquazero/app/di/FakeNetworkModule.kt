package fit.aquazero.app.di

import dagger.Module
import dagger.Provides
import dagger.hilt.components.SingletonComponent
import dagger.hilt.testing.TestInstallIn
import fit.aquazero.app.core.model.AzfJson
import fit.aquazero.app.core.network.NetworkModule
import fit.aquazero.app.core.network.api.AccountApi
import fit.aquazero.app.core.network.api.AuthApi
import fit.aquazero.app.core.network.api.BillingApi
import fit.aquazero.app.core.network.api.ChallengesApi
import fit.aquazero.app.core.network.api.ChatApi
import fit.aquazero.app.core.network.api.CoachesApi
import fit.aquazero.app.core.network.api.ExercisesApi
import fit.aquazero.app.core.network.api.FoodsApi
import fit.aquazero.app.core.network.api.LogsApi
import fit.aquazero.app.core.network.api.MeApi
import fit.aquazero.app.core.network.api.Phase6NetworkModule
import fit.aquazero.app.core.network.api.PlansApi
import fit.aquazero.app.core.network.api.ProgressApi
import fit.aquazero.app.core.network.api.RecipesApi
import fit.aquazero.app.core.network.api.RecommendationsApi
import fit.aquazero.app.core.network.api.SuggestionsApi
import fit.aquazero.app.core.network.api.VisionApi
import fit.aquazero.app.core.network.api.WorkoutsApi
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import javax.inject.Named
import javax.inject.Singleton

/** Base URL the fake client is pointed at; no host is ever contacted. */
private const val TEST_BASE_URL = "http://localhost/api/v1/"

/** Media host for the same reason; nothing resolves it either. */
private const val TEST_MEDIA_BASE_URL = "http://localhost"

private fun testRetrofit(client: OkHttpClient): Retrofit = Retrofit.Builder()
    .baseUrl(TEST_BASE_URL)
    .client(client)
    .addConverterFactory(AzfJson.asConverterFactory("application/json".toMediaType()))
    .build()

/**
 * Replaces the app's whole networking graph with one whose only difference is
 * that requests are answered by [FakeHttp] instead of by a socket.
 *
 * `NetworkModule` also installs `HeaderInterceptor` and `TokenAuthenticator`.
 * Both are deliberately left out here: an interceptor that never reaches the
 * network cannot 401, so the authenticator would be dead weight, and a test
 * that wants to exercise refresh does it through the `auth/refresh` reply
 * rather than through a retry loop it would then have to synchronise with.
 */
@Module
@TestInstallIn(components = [SingletonComponent::class], replaces = [NetworkModule::class])
object FakeNetworkModule {

    @Provides
    @Singleton
    @Named("apiBaseUrl")
    fun apiBaseUrl(): String = TEST_BASE_URL

    @Provides
    @Singleton
    @Named("mediaBaseUrl")
    fun mediaBaseUrl(): String = TEST_MEDIA_BASE_URL

    @Provides
    @Singleton
    @Named("authless")
    fun authlessClient(): OkHttpClient =
        OkHttpClient.Builder().addInterceptor(FakeHttp.interceptor()).build()

    @Provides
    @Singleton
    @Named("api")
    fun apiClient(@Named("authless") base: OkHttpClient): OkHttpClient = base

    @Provides
    @Singleton
    @Named("sse")
    fun sseClient(@Named("authless") base: OkHttpClient): OkHttpClient = base

    @Provides
    @Singleton
    @Named("api")
    fun apiRetrofit(@Named("api") client: OkHttpClient): Retrofit = testRetrofit(client)

    @Provides
    @Singleton
    @Named("authless")
    fun authlessRetrofit(@Named("authless") client: OkHttpClient): Retrofit = testRetrofit(client)

    @Provides
    @Singleton
    @Named("authless")
    fun authApi(@Named("authless") retrofit: Retrofit): AuthApi = retrofit.create(AuthApi::class.java)

    @Provides
    @Singleton
    fun meApi(@Named("api") retrofit: Retrofit): MeApi = retrofit.create(MeApi::class.java)

    @Provides
    @Singleton
    fun logsApi(@Named("api") retrofit: Retrofit): LogsApi = retrofit.create(LogsApi::class.java)

    @Provides
    @Singleton
    fun foodsApi(@Named("api") retrofit: Retrofit): FoodsApi = retrofit.create(FoodsApi::class.java)

    @Provides
    @Singleton
    fun exercisesApi(@Named("api") retrofit: Retrofit): ExercisesApi =
        retrofit.create(ExercisesApi::class.java)

    @Provides
    @Singleton
    fun recipesApi(@Named("api") retrofit: Retrofit): RecipesApi =
        retrofit.create(RecipesApi::class.java)

    @Provides
    @Singleton
    fun visionApi(@Named("api") retrofit: Retrofit): VisionApi = retrofit.create(VisionApi::class.java)

    @Provides
    @Singleton
    fun chatApi(@Named("api") retrofit: Retrofit): ChatApi = retrofit.create(ChatApi::class.java)

    @Provides
    @Singleton
    fun plansApi(@Named("api") retrofit: Retrofit): PlansApi = retrofit.create(PlansApi::class.java)

    @Provides
    @Singleton
    fun workoutsApi(@Named("api") retrofit: Retrofit): WorkoutsApi =
        retrofit.create(WorkoutsApi::class.java)

    @Provides
    @Singleton
    fun progressApi(@Named("api") retrofit: Retrofit): ProgressApi =
        retrofit.create(ProgressApi::class.java)

    @Provides
    @Singleton
    fun coachesApi(@Named("api") retrofit: Retrofit): CoachesApi =
        retrofit.create(CoachesApi::class.java)

    @Provides
    @Singleton
    fun challengesApi(@Named("api") retrofit: Retrofit): ChallengesApi =
        retrofit.create(ChallengesApi::class.java)

    @Provides
    @Singleton
    fun recommendationsApi(@Named("api") retrofit: Retrofit): RecommendationsApi =
        retrofit.create(RecommendationsApi::class.java)

    // `exportApi` was removed here to match NetworkModule, which dropped it
    // when ExportApi was deleted — export runs through AccountApi.export().
    // This binding outlived the interface it provided, so the whole androidTest
    // source set stopped compiling; nothing noticed because CI builds the debug
    // APK and the JVM tests, and neither touches androidTest.

    // This module @TestInstallIn-replaces NetworkModule wholesale, so every
    // binding NetworkModule gains has to be mirrored here or the test graph
    // loses it. BillingApi arrived with Play Billing and was not, which failed
    // the androidTest Hilt graph rather than the Kotlin compile — a later stage
    // than the source-set rot above, and a separate reason the suite was red.
    @Provides
    @Singleton
    fun billingApi(@Named("api") retrofit: Retrofit): BillingApi =
        retrofit.create(BillingApi::class.java)
}

/** The settings/account lane's Retrofit bindings, on the same fake client. */
@Module
@TestInstallIn(components = [SingletonComponent::class], replaces = [Phase6NetworkModule::class])
object FakePhase6NetworkModule {

    @Provides
    @Singleton
    fun accountApi(@Named("api") retrofit: Retrofit): AccountApi =
        retrofit.create(AccountApi::class.java)

    @Provides
    @Singleton
    fun suggestionsApi(@Named("api") retrofit: Retrofit): SuggestionsApi =
        retrofit.create(SuggestionsApi::class.java)
}
