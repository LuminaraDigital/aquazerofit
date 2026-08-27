package fit.aquazero.app.core.network.api

import fit.aquazero.app.core.model.AuthResponseDto
import fit.aquazero.app.core.model.AuthTokensDto
import fit.aquazero.app.core.model.LoginRequest
import fit.aquazero.app.core.model.LogoutRequest
import fit.aquazero.app.core.model.PasswordResetConfirmRequest
import fit.aquazero.app.core.model.PasswordResetRequest
import fit.aquazero.app.core.model.RefreshRequest
import fit.aquazero.app.core.model.RegisterRequest
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
