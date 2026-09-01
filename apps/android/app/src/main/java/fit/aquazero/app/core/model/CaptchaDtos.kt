package fit.aquazero.app.core.model

import kotlinx.serialization.Serializable

/**
 * Bot protection, client side (server contract: `apps/api/src/platform/botProtection.ts`).
 *
 * The wire contract this file mirrors is frozen and shipped separately from
 * the server, so a mismatch fails either silently (an unchallenged form) or
 * loudly (a form nobody can submit):
 *
 *   GET  /api/v1/auth/captcha                -> {enabled:false} | {enabled:true, siteKey}
 *   POST /api/v1/auth/register                 body carries `captchaToken`
 *   POST /api/v1/auth/password-reset/request   likewise
 *
 * Rejections come back as `VALIDATION_FAILED` with
 * `details.fieldErrors.captchaToken`, which is how a client tells a challenge
 * problem from a field problem.
 */

/**
 * Body of `GET /auth/captcha`.
 *
 * [siteKey] is public by design — Cloudflare scopes it to the hostnames
 * configured on the widget — and is present only when [enabled] is true. The
 * Android client does not consume it: the widget is rendered by the web page
 * at `/mobile/captcha`, which reads the same endpoint from its own origin and
 * so is the half that needs the key. It is decoded here for contract fidelity
 * and for diagnostics, not for use.
 */
@Serializable
data class CaptchaConfigDto(
    val enabled: Boolean,
    val siteKey: String? = null,
)

/** Whether a bot-gated call needs a challenge token before it is worth making. */
sealed interface CaptchaRequirement {

    /**
     * Bot protection is off server-side. Send no token; the request proceeds.
     * This is the local development path (no Turnstile keys configured) and it
     * must stay working with no WebView involved at all.
     */
    data object NotRequired : CaptchaRequirement

    /** Bot protection is on. A token must be obtained before submitting. */
    data object Required : CaptchaRequirement

    /**
     * The requirement could not be determined. Deliberately NOT a licence to
     * submit without a token: if `/auth/captcha` is unreachable, the write it
     * guards is very likely unreachable too, and guessing "not required" turns
     * a retryable network error into a confusing `VALIDATION_FAILED`.
     */
    data class Unavailable(val failure: ApiResult.Failure) : CaptchaRequirement
}

/** Terminal result of one challenge attempt. Exactly one of these is delivered. */
sealed interface TurnstileOutcome {

    /** A non-blank challenge token, ready for `captchaToken`. */
    data class Token(val token: String) : TurnstileOutcome

    /** No token. [reason] decides which message the user sees. */
    data class Failed(val reason: TurnstileFailure) : TurnstileOutcome
}

/** Why a challenge produced no token. Every value is retryable by the user. */
enum class TurnstileFailure {

    /** The challenge page did not load — offline, DNS, 5xx, TLS, dead renderer. */
    PageUnavailable,

    /** The page loaded and the widget reported an error, an expiry or a timeout. */
    ChallengeFailed,

    /** The user closed the sheet without completing the challenge. */
    Dismissed,
}
