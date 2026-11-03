package fit.aquazero.app.core.network

import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor

/**
 * Debug-variant network logging. The release source set ships a no-op twin,
 * which is why `logging-interceptor` can stay `debugImplementation`.
 */
object NetworkLogging {
    fun apply(builder: OkHttpClient.Builder) {
        val interceptor = HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BASIC
            redactHeader("Authorization")
        }
        builder.addInterceptor(interceptor)
    }
}
