package fit.aquazero.app.core.network.api

import fit.aquazero.app.core.model.FightRecordEnvelopeDto
import retrofit2.http.GET

/**
 * `/fight-record` — seasons and Consistency Belts (AZF-W3-05 §4.3).
 *
 * Read only, deliberately. Android ships the display half of R1a: the ack and
 * the Telegram emoji-status routes belong to surfaces this client does not
 * have, so they are not declared where a later change could call them by
 * accident.
 */
interface FightRecordApi {

    /** `{fightRecord: null}` when the feature is off for this account. */
    @GET("fight-record")
    suspend fun fightRecord(): FightRecordEnvelopeDto
}
