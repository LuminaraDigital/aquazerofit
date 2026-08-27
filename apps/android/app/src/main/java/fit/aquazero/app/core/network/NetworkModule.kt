package fit.aquazero.app.core.network

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import fit.aquazero.app.BuildConfig
import fit.aquazero.app.core.network.api.AuthApi
import fit.aquazero.app.core.network.api.ChallengesApi
import fit.aquazero.app.core.network.api.ChatApi
import fit.aquazero.app.core.network.api.CoachesApi
import fit.aquazero.app.core.network.api.ExercisesApi
import fit.aquazero.app.core.network.api.ExportApi
import fit.aquazero.app.core.network.api.FoodsApi
import fit.aquazero.app.core.network.api.LogsApi
import fit.aquazero.app.core.network.api.MeApi
import fit.aquazero.app.core.network.api.PlansApi
import fit.aquazero.app.core.network.api.ProgressApi
import fit.aquazero.app.core.network.api.RecipesApi
import fit.aquazero.app.core.network.api.RecommendationsApi
import fit.aquazero.app.core.network.api.VisionApi
import fit.aquazero.app.core.network.api.WorkoutsApi
import java.util.concurrent.TimeUnit
import javax.inject.Named
import javax.inject.Singleton
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory

/**
 * Networking graph. Two OkHttp clients share one connection pool:
 *  - `api`: headers + [TokenAuthenticator] - everything authenticated.
 *  - `authless`: headers only - used by the refresh coordinator so a refresh
 *    can never recursively trigger itself.
 */
@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {

    @Provides
    @Singleton
    @Named("apiBaseUrl")
    fun apiBaseUrl(): String = BuildConfig.API_BASE_URL

    @Provides
    @Singleton
    @Named("mediaBaseUrl")
    fun mediaBaseUrl(): String = BuildConfig.MEDIA_BASE_URL

    @Provides
    @Singleton
    @Named("authless")
    fun authlessClient(headerInterceptor: HeaderInterceptor): OkHttpClient =
        OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .addInterceptor(headerInterceptor)
            .also(NetworkLogging::apply)
            .build()

    @Provides
    @Singleton
    @Named("api")
    fun apiClient(
        @Named("authless") base: OkHttpClient,
        authenticator: TokenAuthenticator,
    ): OkHttpClient = base.newBuilder()
        .authenticator(authenticator)
        .build()

    private fun retrofit(client: OkHttpClient, baseUrl: String): Retrofit =
        Retrofit.Builder()
            .baseUrl(baseUrl.trimEnd('/') + "/")
            .client(client)
            .addConverterFactory(AzfJson.asConverterFactory("application/json".toMediaType()))
            .build()

    @Provides
    @Singleton
    @Named("api")
    fun apiRetrofit(
        @Named("api") client: OkHttpClient,
        @Named("apiBaseUrl") baseUrl: String,
    ): Retrofit = retrofit(client, baseUrl)

    @Provides
    @Singleton
    @Named("authless")
    fun authlessRetrofit(
        @Named("authless") client: OkHttpClient,
        @Named("apiBaseUrl") baseUrl: String,
    ): Retrofit = retrofit(client, baseUrl)

    /** Auth endpoints run WITHOUT the authenticator (no refresh recursion). */
    @Provides
    @Singleton
    @Named("authless")
    fun authApi(@Named("authless") retrofit: Retrofit): AuthApi =
        retrofit.create(AuthApi::class.java)

    @Provides
    @Singleton
    fun meApi(@Named("api") retrofit: Retrofit): MeApi =
        retrofit.create(MeApi::class.java)

    @Provides
    @Singleton
    fun logsApi(@Named("api") retrofit: Retrofit): LogsApi =
        retrofit.create(LogsApi::class.java)

    @Provides
    @Singleton
    fun foodsApi(@Named("api") retrofit: Retrofit): FoodsApi =
        retrofit.create(FoodsApi::class.java)

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
    fun visionApi(@Named("api") retrofit: Retrofit): VisionApi =
        retrofit.create(VisionApi::class.java)

    @Provides
    @Singleton
    fun chatApi(@Named("api") retrofit: Retrofit): ChatApi =
        retrofit.create(ChatApi::class.java)

    @Provides
    @Singleton
    fun plansApi(@Named("api") retrofit: Retrofit): PlansApi =
        retrofit.create(PlansApi::class.java)

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

    @Provides
    @Singleton
    fun exportApi(@Named("api") retrofit: Retrofit): ExportApi =
        retrofit.create(ExportApi::class.java)
}
