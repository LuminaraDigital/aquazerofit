package fit.aquazero.app.core.network

import okhttp3.OkHttpClient

/** Release no-op twin of the debug logging hook. */
object NetworkLogging {
    @Suppress("UNUSED_PARAMETER")
    fun apply(builder: OkHttpClient.Builder) = Unit
}
