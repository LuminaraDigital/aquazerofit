package fit.aquazero.app.core.model

import kotlinx.serialization.json.Json

/**
 * The single JSON configuration for the API contract.
 *
 * - `ignoreUnknownKeys`: the server may add fields; the client must not break.
 * - `explicitNulls = false`: optional fields are omitted, not sent as null,
 *   matching the zod schemas (`.optional()` ≠ nullable).
 * - `coerceInputValues`: unknown enum values fall back to the property default
 *   instead of failing the whole payload.
 */
val AzfJson: Json = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
    coerceInputValues = true
}
