package fit.aquazero.app.feature.onboarding

import fit.aquazero.app.core.designsystem.CAPTCHA_ACTION_PASSWORD_RESET
import fit.aquazero.app.core.designsystem.CAPTCHA_ACTION_REGISTER
import fit.aquazero.app.core.model.CaptchaRequirement
import fit.aquazero.app.core.model.TurnstileFailure
import fit.aquazero.app.core.model.TurnstileOutcome

/**
 * The bot-protection decision for the registration form, as two pure
 * functions.
 *
 * They are pure so the interesting half of the flow can be asserted on without
 * a device, a WebView or a live Cloudflare key: what happens when the server
 * says the challenge is off, when it says it is on, when the lookup itself
 * fails, and each of the four ways a challenge attempt can end. The view model
 * below them does nothing but execute the step it is handed.
 */

/** What the register button should do next. */
internal sealed interface SignInStep {

    /** Call the API now. [captchaToken] is null only when none is required. */
    data class Submit(val captchaToken: String?) : SignInStep

    /** Raise the challenge sheet for [action] and wait. */
    data class Challenge(val action: String) : SignInStep

    /** Stop, showing [message]. Never a silent stop and never a bypass. */
    data class Abort(val message: String) : SignInStep
}

/**
 * Turn the server's answer about bot protection into the next step.
 *
 * [CaptchaRequirement.Unavailable] aborts rather than submitting. That is the
 * fail-closed choice: `/auth/captcha` and `/auth/register` are the same host,
 * so a lookup that failed almost certainly means a register that would fail
 * too — and submitting anyway swaps a plain "check your connection" for the
 * server's `VALIDATION_FAILED`, which reads like the user typed something
 * wrong.
 */
internal fun registerStepFor(
    requirement: CaptchaRequirement,
    messages: SignInMessages,
): SignInStep = when (requirement) {
    is CaptchaRequirement.NotRequired -> SignInStep.Submit(captchaToken = null)
    is CaptchaRequirement.Required -> SignInStep.Challenge(CAPTCHA_ACTION_REGISTER)
    is CaptchaRequirement.Unavailable -> SignInStep.Abort(messages.challengeUnavailable)
}

/**
 * The same decision for a reset mail.
 *
 * `POST /auth/password-reset/request` sits behind the same `assertHuman` gate
 * as registration, so it needs the same detour — and the same fail-closed
 * answer when the gate itself cannot be reached. It is a separate function
 * rather than a parameter on [registerStepFor] because the action name is
 * what the server audits the attempt under, and the two must not be able to
 * drift into each other.
 */
internal fun passwordResetStepFor(
    requirement: CaptchaRequirement,
    messages: SignInMessages,
): SignInStep = when (requirement) {
    is CaptchaRequirement.NotRequired -> SignInStep.Submit(captchaToken = null)
    is CaptchaRequirement.Required -> SignInStep.Challenge(CAPTCHA_ACTION_PASSWORD_RESET)
    is CaptchaRequirement.Unavailable -> SignInStep.Abort(messages.challengeUnavailable)
}

/** Turn the challenge's single outcome into the next step. */
internal fun challengeStepFor(
    outcome: TurnstileOutcome,
    messages: SignInMessages,
): SignInStep = when (outcome) {
    is TurnstileOutcome.Token -> SignInStep.Submit(captchaToken = outcome.token)
    is TurnstileOutcome.Failed -> SignInStep.Abort(
        when (outcome.reason) {
            TurnstileFailure.PageUnavailable -> messages.challengeUnavailable
            TurnstileFailure.ChallengeFailed -> messages.challengeFailed
            TurnstileFailure.Dismissed -> messages.challengeCancelled
        },
    )
}
