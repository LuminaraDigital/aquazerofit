package fit.aquazero.app.di

import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Protocol
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody

/** One canned HTTP reply: a status code and a JSON body. */
internal data class CannedResponse(val status: Int, val body: String)

/**
 * The whole HTTP surface of the app, answered in process.
 *
 * An interceptor rather than a fake for each of the twenty-odd Retrofit
 * interfaces: the point of these tests is that the app's real DI graph boots
 * and its real screens render, so everything from `OkHttpClient` down through
 * `Retrofit`, the serializer and `safeCall` should be the shipped code. Only
 * the socket is missing — [FakeHttp.respond] returns before OkHttp ever tries
 * to open one, so a test cannot accidentally depend on a dev server being up,
 * and cannot leak a request off the device.
 *
 * The handler is process-global because Hilt builds a fresh component per
 * test while the interceptor is constructed inside it; a test sets the
 * handler in `@Before`, before the graph is used.
 */
internal object FakeHttp {

    /** Default reply: an honest 404 in the API's error-envelope shape. */
    val NOT_FOUND = CannedResponse(
        status = 404,
        body = """{"error":{"code":"NOT_FOUND","message":"Not found"}}""",
    )

    /** Replies to a request path (e.g. `auth/refresh`), or null for [NOT_FOUND]. */
    @Volatile
    var handler: (String) -> CannedResponse? = { null }

    /** Every path this test run was asked for, in order. */
    val requestedPaths: MutableList<String> = mutableListOf()

    fun reset() {
        handler = { null }
        synchronized(requestedPaths) { requestedPaths.clear() }
    }

    /** Answer only these exact paths; everything else stays a 404. */
    fun respondTo(vararg replies: Pair<String, CannedResponse>) {
        val table = replies.toMap()
        handler = { path -> table[path] }
    }

    fun interceptor(): Interceptor = Interceptor { chain ->
        val request = chain.request()
        val path = request.url.encodedPath.trimStart('/').removePrefix("api/v1/")
        synchronized(requestedPaths) { requestedPaths.add(path) }
        val canned = handler(path) ?: NOT_FOUND
        Response.Builder()
            .request(request)
            .protocol(Protocol.HTTP_1_1)
            .code(canned.status)
            .message(if (canned.status < 400) "OK" else "Error")
            .body(canned.body.toResponseBody("application/json".toMediaType()))
            .build()
    }
}
