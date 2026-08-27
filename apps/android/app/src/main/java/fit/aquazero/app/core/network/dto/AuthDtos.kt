package fit.aquazero.app.core.network.dto

import kotlinx.serialization.Serializable

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
)

/** Mirrors TS `AuthResponse` (`AuthTokens` + `user`). */
@Serializable
data class AuthResponseDto(
    val accessToken: String,
    val refreshToken: String,
    val user: PublicUserDto,
)

/** Body for `POST /auth/register` (shared `registerSchema`). */
@Serializable
data class RegisterRequest(
    val email: String,
    val password: String,
    val displayName: String? = null,
    /** Turnstile / Play Integrity token when the server demands bot protection. */
    val captchaToken: String? = null,
)

/** Body for `POST /auth/login` (shared `loginSchema`). */
@Serializable
data class LoginRequest(
    val email: String,
    val password: String,
)

/** Body for `POST /auth/refresh` — Android always uses body transport. */
@Serializable
data class RefreshRequest(
    val refreshToken: String,
)

/** Body for `POST /auth/logout`. */
@Serializable
data class LogoutRequest(
    val refreshToken: String? = null,
)

/** Body for `POST /auth/password-reset/request`. */
@Serializable
data class PasswordResetRequest(
    val email: String,
    val captchaToken: String? = null,
)

/** Body for `POST /auth/password-reset/confirm`. */
@Serializable
data class PasswordResetConfirmRequest(
    val token: String,
    val newPassword: String,
)
