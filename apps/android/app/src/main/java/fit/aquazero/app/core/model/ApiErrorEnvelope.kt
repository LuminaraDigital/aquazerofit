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
