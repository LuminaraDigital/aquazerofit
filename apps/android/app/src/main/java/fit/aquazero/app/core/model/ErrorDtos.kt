package fit.aquazero.app.core.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/**
 * The API's error envelope: `{ code, message, details? }`.
 * `details` is intentionally schemaless (validation issue lists, conflict
 * payloads such as `mealLogId`), so it is kept as raw JSON for the caller
 * to interpret per endpoint.
 */
@Serializable
data class ApiErrorEnvelope(
    val code: String,
    val message: String,
    val details: JsonElement? = null,
)

/** Well-known API error codes the client branches on. */
object ApiErrorCodes {
    const val UNAUTHORIZED = "UNAUTHORIZED"
    const val VALIDATION_FAILED = "VALIDATION_FAILED"
    const val NOT_FOUND = "NOT_FOUND"
    const val CONFLICT = "CONFLICT"
    const val RATE_LIMITED = "RATE_LIMITED"
    const val SAFETY_INPUT = "SAFETY_INPUT"
    const val SAFETY_OUTPUT = "SAFETY_OUTPUT"
    const val AI_UNAVAILABLE = "AI_UNAVAILABLE"
}
