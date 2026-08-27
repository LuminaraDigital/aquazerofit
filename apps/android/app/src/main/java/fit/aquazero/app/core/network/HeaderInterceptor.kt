package fit.aquazero.app.core.network

import fit.aquazero.app.core.auth.AuthTokenStore
import java.util.Locale
import java.util.TimeZone
import javax.inject.Inject
import javax.inject.Singleton
import okhttp3.Interceptor
import okhttp3.Response

/**
 * Adds the standing headers to every request:
 * - `X-Timezone`: IANA zone id, so server-side day-keying matches the device.
 * - `User-Agent`: `AquaZeroFit-Android/<version>` for client identification.
 * - `Accept-Language`: device locale, used for crisis-signpost localization.
 * - `Authorization`: bearer access token from the in-memory store, when present
 *   and the request has not set its own.
 */
@Singleton
class HeaderInterceptor @Inject constructor(
    private val tokenStore: AuthTokenStore,
) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val original = chain.request()
        val builder = original.newBuilder()
            .header("X-Timezone", TimeZone.getDefault().id)
            .header("User-Agent", USER_AGENT)
            .header("Accept-Language", Locale.getDefault().toLanguageTag())

        if (original.header("Authorization") == null) {
            tokenStore.current()?.let { builder.header("Authorization", "Bearer $it") }
        }
        return chain.proceed(builder.build())
    }

    companion object {
        /** Client identification string (plan §6.2). */
        const val USER_AGENT: String = "AquaZeroFit-Android/1.0.0"
    }
}
