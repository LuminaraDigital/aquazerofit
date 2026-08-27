package fit.aquazero.app.core.network.api

import fit.aquazero.app.core.model.ChallengeEnvelopeDto
import fit.aquazero.app.core.model.ChallengePeekEnvelopeDto
import fit.aquazero.app.core.model.ChallengesDto
import fit.aquazero.app.core.model.CreateChallengeRequest
import fit.aquazero.app.core.model.JoinChallengeRequest
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

/** `/challenges/…` — buddy huddles (create / join by `AQUA…` code / peek). */
interface ChallengesApi {

    /**
     * Public peek for invite links (no auth required server-side).
     *
     * Returns a reduced summary, not a full challenge - notably it has no
     * `id`, since the caller is not a member yet.
     */
    @GET("challenges/peek/{code}")
    suspend fun peek(@Path("code") code: String): ChallengePeekEnvelopeDto

    @GET("challenges")
    suspend fun challenges(): ChallengesDto

    @GET("challenges/{id}")
    suspend fun challenge(@Path("id") id: String): ChallengeEnvelopeDto

    @POST("challenges")
    suspend fun create(@Body body: CreateChallengeRequest): ChallengeEnvelopeDto

    @POST("challenges/join")
    suspend fun join(@Body body: JoinChallengeRequest): ChallengeEnvelopeDto
}
