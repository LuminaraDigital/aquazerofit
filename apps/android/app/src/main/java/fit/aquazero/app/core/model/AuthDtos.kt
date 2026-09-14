package fit.aquazero.app.core.model

import kotlinx.serialization.Serializable

/*
 * A note on the `toString()` overrides below.
 *
 * These are the only types in the app that carry a plaintext password or a
 * refresh token, and `data class` generates a `toString()` that prints every
 * property. Nothing logs a DTO today — there is no `Log.*` or
 * `recordNonFatal` anywhere in `core/network`, `core/auth` or
 * `AuthRepository`, and that was checked rather than assumed. The overrides
 * exist because the leak does not need a deliberate log line to happen: an
 * exception message that interpolates a request, a breadcrumb added while
 * debugging and left in, or a future `recordNonFatal(e, mapOf("body" to
 * "$request"))` would each put a credential into Crashlytics, where it is
 * replicated off-device and outside the user's control.
 *
 * They redact rather than return a constant so a value stays debuggable:
 * whether the field was set, and the length, are usually what you actually
 * want at 2am, and neither reveals the secret.
 *
 * Serialization is unaffected — kotlinx.serialization writes through the
 * generated serializer and never calls `toString()`. The wire bodies are
 * unchanged; only what a log statement can see is.
 */

/** How a secret renders in a log: present-or-not and how long, never the value. */
private fun redact(secret: String?): String =
    if (secret == null) "null" else "***(${secret.length} chars)"

/** Mirrors TS `PublicUser`. */
@Serializable
data class PublicUserDto(
    val id: String,
    val email: String,
    val displayName: String,
    val role: UserRole = UserRole.USER,
    val tier: UserTier = UserTier.FREE,
    val emailVerified: Boolean = false,
    val hasProfile: Boolean = false,
    val telegramLinked: Boolean = false,
    val hasPassword: Boolean = true,
    val timezone: String? = null,
    val createdAt: String,
)

/** Mirrors TS `AuthTokens`. */
@Serializable
data class AuthTokensDto(
    val accessToken: String,
    val refreshToken: String,
) {
    override fun toString(): String =
        "AuthTokensDto(accessToken=${redact(accessToken)}, refreshToken=${redact(refreshToken)})"
}

/** Mirrors TS `AuthResponse` (`AuthTokens` + `user`). */
@Serializable
data class AuthResponseDto(
    val accessToken: String,
    val refreshToken: String,
    val user: PublicUserDto,
) {
    override fun toString(): String =
        "AuthResponseDto(accessToken=${redact(accessToken)}, " +
            "refreshToken=${redact(refreshToken)}, user=$user)"
}

/** Body for `POST /auth/register` (shared `registerSchema`). */
@Serializable
data class RegisterRequest(
    val email: String,
    val password: String,
    val displayName: String? = null,
    /** Turnstile / Play Integrity token when the server demands bot protection. */
    val captchaToken: String? = null,
) {
    override fun toString(): String =
        "RegisterRequest(email=$email, password=${redact(password)}, " +
            "displayName=$displayName, captchaToken=${redact(captchaToken)})"
}

/** Body for `POST /auth/login` (shared `loginSchema`). */
@Serializable
data class LoginRequest(
    val email: String,
    val password: String,
) {
    override fun toString(): String = "LoginRequest(email=$email, password=${redact(password)})"
}

/** Body for `POST /auth/refresh` — Android always uses body transport. */
@Serializable
data class RefreshRequest(
    val refreshToken: String,
) {
    override fun toString(): String = "RefreshRequest(refreshToken=${redact(refreshToken)})"
}

/** Body for `POST /auth/logout`. */
@Serializable
data class LogoutRequest(
    val refreshToken: String? = null,
) {
    override fun toString(): String = "LogoutRequest(refreshToken=${redact(refreshToken)})"
}

/** Body for `POST /auth/password-reset/request`. */
@Serializable
data class PasswordResetRequest(
    val email: String,
    val captchaToken: String? = null,
) {
    override fun toString(): String =
        "PasswordResetRequest(email=$email, captchaToken=${redact(captchaToken)})"
}
