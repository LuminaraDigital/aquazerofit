package fit.aquazero.app.core.model

import kotlinx.serialization.json.Json

/**
 * The single JSON configuration for the API contract.
 *
 * - `ignoreUnknownKeys`: the server may add fields; the client must not break.
 * - `explicitNulls = false`: optional fields are omitted, not sent as null,
 *   matching the zod schemas (`.optional()` ≠ nullable).
 * - `coerceInputValues`: an unknown enum value (or an explicit `null` for a
 *   non-nullable property) falls back to that property's DEFAULT instead of
 *   failing the whole payload — and *only* when the property actually has one,
 *   or is nullable. This flag on its own buys nothing: a non-nullable enum
 *   field declared without a default still throws
 *   `IllegalArgumentException`, which `safeCall` reports as
 *   `ApiResult.Failure.Malformed` for a response the server considered a
 *   perfectly good 2xx. Every enum-typed field in `*Dtos.kt` therefore carries
 *   a default or is nullable, and a new one must too — that, not this flag, is
 *   what survives the server adding a union member.
 *
 *   Two shapes are still outside the flag's reach, because a default has
 *   nowhere to live: an enum used as a `Map` key (`MealDayDto.meals`,
 *   `DailyNutritionDto.meals`) and an enum inside a `List`. A new `MealType`
 *   server-side breaks those regardless, so the drain treats an undecodable
 *   2xx as "probably landed" rather than "failed" (see `OutboxDrainer`).
 */
val AzfJson: Json = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
    coerceInputValues = true
}
