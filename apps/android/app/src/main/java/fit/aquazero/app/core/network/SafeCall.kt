package fit.aquazero.app.core.network

import fit.aquazero.app.core.model.ApiErrorEnvelope
import fit.aquazero.app.core.model.ApiResult
import fit.aquazero.app.core.model.AzfJson
import java.io.IOException
import kotlinx.serialization.SerializationException
import retrofit2.HttpException

/**
 * Run a Retrofit suspend call and map its outcome into [ApiResult],
 * decoding the API error envelope when present.
 *
 * This is the only part of the result pipeline that knows about HTTP, which
 * is why it lives here rather than beside [ApiResult] in `core.model`.
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
} catch (e: SerializationException) {
    // A 2xx whose body does not match the declared type. Without this the
    // exception escapes and kills the calling coroutine, so the screen never
    // leaves its loading state and nothing explains why.
    ApiResult.Failure.Malformed(e)
} catch (e: IllegalArgumentException) {
    // kotlinx.serialization also raises this for a body that decodes but
    // violates the type - a missing non-null field, an unknown enum value.
    ApiResult.Failure.Malformed(e)
}
