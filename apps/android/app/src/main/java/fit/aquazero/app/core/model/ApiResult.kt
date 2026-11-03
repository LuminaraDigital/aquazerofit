package fit.aquazero.app.core.model

import kotlinx.serialization.json.JsonElement
import java.io.IOException

/**
 * Result wrapper for every API call. [Failure.Api] maps the server's error
 * envelope `{code, message, details?}`; [Failure.Network] is transport-level
 * (offline, timeout) and always retryable.
 *
 * This type is deliberately free of Retrofit and of Android: it crosses the
 * whole app, from the HTTP layer up into feature view models, and nothing
 * above the data layer should have to see an HTTP client to handle a result.
 * The Retrofit-aware half lives in `core.network.safeCall`.
 */
sealed interface ApiResult<out T> {
    /** 2xx with a decoded body. */
    data class Success<T>(val data: T) : ApiResult<T>

    sealed interface Failure : ApiResult<Nothing> {
        /** Server replied with an error envelope. */
        data class Api(
            val httpStatus: Int,
            val code: String,
            val message: String,
            val details: JsonElement? = null,
            /** Parsed `Retry-After`, in seconds, when the server sent one (429). */
            val retryAfterSeconds: Long? = null,
        ) : Failure

        /** Transport failure - no HTTP response at all. */
        data class Network(val cause: IOException) : Failure

        /**
         * A 2xx body that did not match the declared shape.
         *
         * This is a client/server contract disagreement, not a user-visible
         * fault, but it must surface as a [Failure] rather than escaping as a
         * thrown exception: an uncaught decode error kills the calling
         * coroutine and leaves a screen spinning forever.
         */
        data class Malformed(val cause: Throwable) : Failure
    }
}

/** Map a successful result, passing failures through. */
inline fun <T, R> ApiResult<T>.map(transform: (T) -> R): ApiResult<R> = when (this) {
    is ApiResult.Success -> ApiResult.Success(transform(data))
    is ApiResult.Failure -> this
}

/** The success value, or null on any failure. */
fun <T> ApiResult<T>.getOrNull(): T? = (this as? ApiResult.Success)?.data
