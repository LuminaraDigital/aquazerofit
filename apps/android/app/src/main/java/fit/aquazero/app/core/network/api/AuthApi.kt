package fit.aquazero.app.core.network.api

import fit.aquazero.app.core.network.dto.AuthResponseDto
import fit.aquazero.app.core.network.dto.AuthTokensDto
import fit.aquazero.app.core.network.dto.LoginRequest
import fit.aquazero.app.core.network.dto.LogoutRequest
import fit.aquazero.app.core.network.dto.PasswordResetConfirmRequest
import fit.aquazero.app.core.network.dto.PasswordResetRequest
import fit.aquazero.app.core.network.dto.RefreshRequest
import fit.aquazero.app.core.network.dto.RegisterRequest
import retrofit2.http.Body
import retrofit2.http.POST

/** Auth routes: registration, login, rotation, logout, password reset. */
interface AuthApi {

    @POST("auth/register")
    suspend fun register(@Body body: RegisterRequest): AuthResponseDto

    @POST("auth/login")
    suspend fun login(@Body body: LoginRequest): AuthResponseDto

    /** Body transport; returns a fresh token pair (CAS rotation server-side). */
    @POST("auth/refresh")
    suspend fun refresh(@Body body: RefreshRequest): AuthTokensDto

    @POST("auth/logout")
    suspend fun logout(@Body body: LogoutRequest)

    @POST("auth/password-reset/request")
    suspend fun requestPasswordReset(@Body body: PasswordResetRequest)

    @POST("auth/password-reset/confirm")
    suspend fun confirmPasswordReset(@Body body: PasswordResetConfirmRequest)
}
