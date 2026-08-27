package fit.aquazero.app.core.network.api

import fit.aquazero.app.core.network.dto.CoachRosterDto
import fit.aquazero.app.core.network.dto.CoachSelectRequest
import fit.aquazero.app.core.network.dto.ProgressionStatusDto
import fit.aquazero.app.core.network.dto.ReactionAckRequest
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST

/**
 * `/coaches/…` — roster, selection, progression, reaction acks.
 * The purchase route exists server-side but Android never calls it
 * (free app; level-unlock is the only door).
 */
interface CoachesApi {

    @GET("coaches")
    suspend fun roster(): CoachRosterDto

    @POST("coaches/select")
    suspend fun select(@Body body: CoachSelectRequest): CoachRosterDto

    @GET("coaches/progression")
    suspend fun progression(): ProgressionStatusDto

    /** Ack displayed reactions — after composition, never before (plan §5). */
    @POST("coaches/reactions/ack")
    suspend fun ackReactions(@Body body: ReactionAckRequest): ProgressionStatusDto
}
