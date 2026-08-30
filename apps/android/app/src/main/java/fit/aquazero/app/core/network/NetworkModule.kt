package fit.aquazero.app.core.network

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import fit.aquazero.app.BuildConfig
import fit.aquazero.app.core.model.AzfJson
import fit.aquazero.app.core.network.api.AuthApi
import fit.aquazero.app.core.network.api.BillingApi
import fit.aquazero.app.core.network.api.ChallengesApi
import fit.aquazero.app.core.network.api.ChatApi
import fit.aquazero.app.core.network.api.CoachesApi
import fit.aquazero.app.core.network.api.ExercisesApi
import fit.aquazero.app.core.network.api.FoodsApi
import fit.aquazero.app.core.network.api.LogsApi
import fit.aquazero.app.core.network.api.MeApi
import fit.aquazero.app.core.network.api.PlansApi
import fit.aquazero.app.core.network.api.ProgressApi
import fit.aquazero.app.core.network.api.RecipesApi
import fit.aquazero.app.core.network.api.RecommendationsApi
import fit.aquazero.app.core.network.api.VisionApi
import fit.aquazero.app.core.network.api.WorkoutsApi
import okhttp3.Dispatcher
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import java.util.concurrent.TimeUnit
import javax.inject.Named
import javax.inject.Singleton

/**
 * Networking graph. Three OkHttp clients share one connection pool:
 *  - `api`: headers + [TokenAuthenticator] - everything authenticated.
 *  - `authless`: headers only - used by the refresh coordinator so a refresh
 *    can never recursively trigger itself.
 *  - `sse`: `api` with the read timeout widened for streaming (see below).
 *
 * **Each client gets its own [Dispatcher]; only the connection pool is
 * shared.** `newBuilder()` copies the dispatcher *reference*, so deriving the
 * clients from one another silently pooled every call in the app into a
 * single `maxRequestsPerHost = 5` budget against the one host we talk to.
 * That made the refresh path self-blocking: [TokenAuthenticator] runs on a
 * dispatcher thread and blocks it while refreshing, so five concurrent 401s
 * held all five slots, and the refresh — enqueued on the same dispatcher —
 * waited behind the calls waiting on it. No read timeout applies, because the
 * refresh call never starts. Separate dispatchers make that deadlock
 * structurally impossible rather than merely unlikely.
 */
@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {

    /** Read-gap bound for the SSE chat stream; see [sseClient]. */
    private const val SSE_READ_TIMEOUT_SECONDS = 180L

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
        .dispatcher(apiDispatcher())
        .build()

    /**
     * Client for the streaming chat turn.
     *
     * OkHttp's read timeout is a gap-between-reads timeout, and on an SSE
     * response the gap that matters is the one before the first `token` frame:
     * the server flushes its headers immediately, then does guardrail and
     * context work and waits on the model. The 30s that suits a request/response
     * call is inside the range that wait can legitimately take, so a slow turn
     * gets killed mid-thought and surfaces as a dropped connection.
     *
     * Widened rather than disabled. The server sends no heartbeat frame, so
     * with no timeout at all a half-open socket would hang the turn until the
     * user navigated away; a bound well past any plausible model latency still
     * lets a genuinely dead connection fail.
     */
    @Provides
    @Singleton
    @Named("sse")
    fun sseClient(@Named("api") base: OkHttpClient): OkHttpClient = base.newBuilder()
        .readTimeout(SSE_READ_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        // Its own dispatcher too: an open stream occupies a slot for the whole
        // turn, so sharing the api budget would let a few streams starve
        // ordinary requests.
        .dispatcher(apiDispatcher())
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

    /** Purchase verification rides the authenticated client — the route is Bearer-only. */
    @Provides
    @Singleton
    fun billingApi(@Named("api") retrofit: Retrofit): BillingApi =
        retrofit.create(BillingApi::class.java)
}

/** Total in-flight cap for authenticated traffic (OkHttp default: 64). */
private const val MAX_REQUESTS = 64

/** Single-origin app, so this is a concurrency bound, not politeness. */
private const val MAX_REQUESTS_PER_HOST = 16

/**
 * A dedicated dispatcher for authenticated traffic, kept off the one the
 * refresh path uses. The per-host cap is also raised: the default of 5 is
 * tuned for a client spreading load over many hosts, and every call this app
 * makes goes to the same origin, so five was an arbitrary concurrency ceiling
 * on the whole app rather than a politeness bound.
 *
 * Top-level rather than a member so it does not count against the module
 * object's function budget.
 */
private fun apiDispatcher(): Dispatcher = Dispatcher().apply {
    maxRequests = MAX_REQUESTS
    maxRequestsPerHost = MAX_REQUESTS_PER_HOST
}
