package fit.aquazero.app.feature.settings

import fit.aquazero.app.core.database.ConsentEntity
import fit.aquazero.app.core.model.ConsentUpdateRequest

/**
 * Building the body of `PUT /me/consents`.
 *
 * The route takes all four bits and replaces the stored document with what it
 * receives (`consentsSchema` — every field required, `saveConsents` writes the
 * whole doc). So flipping one switch means sending the other three back
 * unchanged: a body built from anything less than the current state silently
 * withdraws consents the person never touched.
 *
 * That is worth its own tested function rather than being inlined at each of
 * the two call sites, because the failure is invisible — the request succeeds,
 * and three consents quietly become false.
 */
object ConsentUpdates {

    /** The current state with exactly [key] set to [value]. */
    fun with(current: ConsentEntity, key: ConsentKey, value: Boolean): ConsentUpdateRequest =
        ConsentUpdateRequest(
            wellnessDataProcessing = if (key == ConsentKey.WELLNESS) {
                value
            } else {
                current.wellnessDataProcessing
            },
            aiPersonalisation = if (key == ConsentKey.AI_PERSONALISATION) {
                value
            } else {
                current.aiPersonalisation
            },
            anonymisedAnalytics = if (key == ConsentKey.ANALYTICS) {
                value
            } else {
                current.anonymisedAnalytics
            },
            reminders = if (key == ConsentKey.REMINDERS) value else current.reminders,
        )
}
