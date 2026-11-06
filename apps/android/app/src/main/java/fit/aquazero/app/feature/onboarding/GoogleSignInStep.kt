package fit.aquazero.app.feature.onboarding

import fit.aquazero.app.core.auth.GoogleSignInResult

/** What "Continue with Google" does once the account picker has answered. */
internal sealed interface GoogleSignInStep {

    /** Ask the API for a session with this Firebase ID token. */
    data class Exchange(val firebaseIdToken: String) : GoogleSignInStep

    /** Stop. [message] is null when the user simply closed the picker. */
    data class Stop(val message: String?) : GoogleSignInStep
}

/**
 * Pure so every branch is asserted without a device.
 *
 * The organisation's managed email-domain rule ([isEmailAllowed]) applies to
 * the Google account exactly as it does to a typed address, and before the API
 * is called: an account outside the domain must not get a session at all.
 */
internal fun googleSignInStepFor(
    result: GoogleSignInResult,
    isEmailAllowed: (String) -> Boolean,
    allowedDomain: String?,
    messages: SignInMessages,
): GoogleSignInStep = when (result) {
    is GoogleSignInResult.Token ->
        if (isEmailAllowed(result.email.orEmpty())) {
            GoogleSignInStep.Exchange(result.firebaseIdToken)
        } else {
            GoogleSignInStep.Stop(messages.domainRestricted(allowedDomain.orEmpty()))
        }
    GoogleSignInResult.Cancelled -> GoogleSignInStep.Stop(message = null)
    GoogleSignInResult.NoAccount -> GoogleSignInStep.Stop(messages.googleNoAccount)
    GoogleSignInResult.Network -> GoogleSignInStep.Stop(messages.offline)
    is GoogleSignInResult.Failed -> GoogleSignInStep.Stop(messages.googleFailed)
}
