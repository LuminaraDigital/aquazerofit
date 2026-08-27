package fit.aquazero.app.core.network

import fit.aquazero.app.core.network.dto.ApiErrorEnvelope
import java.io.IOException
import kotlinx.serialization.json.JsonElement
import retrofit2.HttpException

/**
 * Result wrapper for every API call. [Failure.Api] maps the server's error
 * envelope `{code, message, details?}`; [Failure.Network] is transport-level
 * (offline, timeout) and always retryable.
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

        /** Transport failure — no HTTP response at all. */
        data class Network(val cause: IOException) : Failure
    }
}

/** True for failures worth retrying automatically (network or 5xx or 429). */
fun ApiResult.Failure.isRetryable(): Boolean = when (this) {
    is ApiResult.Failure.Network -> true
    is ApiResult.Failure.Api -> httpStatus >= 500 || httpStatus == 429
}

/** Map a successful result, passing failures through. */
inline fun <T, R> ApiResult<T>.map(transform: (T) -> R): ApiResult<R> = when (this) {
    is ApiResult.Success -> ApiResult.Success(transform(data))
    is ApiResult.Failure -> this
}

/** The success value, or null on any failure. */
fun <T> ApiResult<T>.getOrNull(): T? = (this as? ApiResult.Success)?.data

/**
 * Run a Retrofit suspend call and map its outcome into [ApiResult],
 * decoding the API error envelope when present.
 */
suspend fun <T> safeCall(block: suspend () -> T): ApiResult<T> = try {
    ApiResult.Success(block())
} catch (e: HttpException) {
    val bodyText = try {
        e.response()?.errorBody()?.string()
    } catch (_: IOException) {
        null
    }
    val envelope = bodyText?.let {
        runCatching { AzfJson.decodeFromString(ApiErrorEnvelope.serializer(), it) }.getOrNull()
    }
    val retryAfter = e.response()?.headers()?.get("Retry-After")?.let(RetryAfter::parseSeconds)
    ApiResult.Failure.Api(
        httpStatus = e.code(),
        code = envelope?.code ?: "HTTP_${e.code()}",
        message = envelope?.message ?: e.message(),
        details = envelope?.details,
        retryAfterSeconds = retryAfter,
    )
} catch (e: IOException) {
    ApiResult.Failure.Network(e)
}
