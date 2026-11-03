package fit.aquazero.app.core.designsystem

import android.webkit.JavascriptInterface
import fit.aquazero.app.core.model.TurnstileFailure
import fit.aquazero.app.core.model.TurnstileOutcome
import java.net.URI
import java.util.concurrent.atomic.AtomicBoolean

/**
 * The non-Compose half of the Turnstile challenge: the JavaScript bridge, the
 * once-only result latch, and the origin check that keeps the bridge pointed
 * at the page we asked for.
 *
 * Kept apart from [TurnstileChallenge] because all of it is decidable off a
 * device — the latch and the origin comparison are covered by unit tests, and
 * a state machine that can only be exercised by solving a real CAPTCHA is a
 * state machine nobody exercises.
 */

/** Longest token accepted. Turnstile issues up to ~2048 chars; this is slack, not a limit to grow. */
private const val MAX_TOKEN_LENGTH = 4096

private const val HTTPS_PORT = 443
private const val HTTP_PORT = 80

/** scheme + host + port, the three things that make two URLs the same origin. */
internal data class WebOrigin(val scheme: String, val host: String, val port: Int)

/**
 * Parse [url] into its origin, or null when it has none we can compare.
 *
 * `java.net.URI` rather than `android.net.Uri` so this is testable on the JVM,
 * and because its strictness is the behaviour we want: anything it refuses to
 * parse — a backslash smuggled into the authority, a malformed escape — comes
 * back null and is therefore refused rather than guessed at.
 */
internal fun originOf(url: String?): WebOrigin? {
    if (url.isNullOrBlank()) return null
    val uri = runCatching { URI(url) }.getOrNull() ?: return null
    val scheme = uri.scheme?.lowercase() ?: return null
    val host = uri.host?.lowercase()?.takeIf { it.isNotEmpty() } ?: return null
    val port = when {
        uri.port != -1 -> uri.port
        scheme == "https" -> HTTPS_PORT
        scheme == "http" -> HTTP_PORT
        else -> -1
    }
    return WebOrigin(scheme, host, port)
}

/**
 * True when [candidate] is the same origin as [expected].
 *
 * Fails closed: an unparseable expected origin matches nothing, so a
 * misconfigured base URL blocks navigation rather than allowing it.
 */
internal fun isSameOrigin(expected: String, candidate: String?): Boolean {
    val target = originOf(expected) ?: return false
    return originOf(candidate) == target
}

/**
 * Delivers exactly one [TurnstileOutcome], whoever gets there first.
 *
 * Turnstile is chatty at the edges — a widget can hand over a token and then
 * fire an expiry callback moments later, a page error can land while a token
 * is already in flight, and the user can close the sheet during either. Those
 * callbacks arrive on different threads (the JS bridge runs on a private
 * binder thread, dismissal on the main thread), so "first one wins" has to be
 * enforced atomically rather than by a boolean anyone can race.
 */
internal class TurnstileLatch(private val deliver: (TurnstileOutcome) -> Unit) {

    private val settled = AtomicBoolean(false)

    /**
     * Accept a token from the page. A blank or implausibly long value is
     * treated as a failed challenge, never as success: the token is about to
     * be sent to the server as proof, and there is nothing to prove with an
     * empty string.
     */
    fun token(raw: String?): Boolean {
        val token = raw?.trim().orEmpty()
        return if (token.isEmpty() || token.length > MAX_TOKEN_LENGTH) {
            fail(TurnstileFailure.ChallengeFailed)
        } else {
            settle(TurnstileOutcome.Token(token))
        }
    }

    /** Record a terminal failure. Returns false if something already won. */
    fun fail(reason: TurnstileFailure): Boolean = settle(TurnstileOutcome.Failed(reason))

    /** True once any outcome has been delivered. */
    val isSettled: Boolean get() = settled.get()

    private fun settle(outcome: TurnstileOutcome): Boolean =
        if (settled.compareAndSet(false, true)) {
            deliver(outcome)
            true
        } else {
            false
        }
}

/**
 * The object exposed to the challenge page as `AzfCaptcha`.
 *
 * A `@JavascriptInterface` is a remote-code surface: every annotated method is
 * callable by any script running in the frame. That is why this class exposes
 * exactly two, both taking a single [String] and both returning nothing —
 * there is no third method to find, and no object handed back to walk. The
 * lambdas are private fields, which the bridge does not expose at all.
 *
 * Reachability is bounded on the other side too: `addJavascriptInterface`
 * injects only into the main frame, so the Turnstile iframe served from
 * `challenges.cloudflare.com` cannot see this object, and
 * [TurnstileChallenge] refuses main-frame navigation off the expected origin
 * so the page cannot move somewhere else and keep talking to it.
 */
internal class TurnstileJsBridge(
    private val tokenReceived: (String?) -> Unit,
    private val errorReceived: (String?) -> Unit,
) {

    /** Called by the page with a solved challenge token. */
    @JavascriptInterface
    fun onToken(token: String?) {
        tokenReceived(token)
    }

    /** Called by the page when the widget errors out, expires or times out. */
    @JavascriptInterface
    fun onError(reason: String?) {
        errorReceived(reason)
    }
}
