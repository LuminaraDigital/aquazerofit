package fit.aquazero.app.core.telemetry

/**
 * What the app is allowed to know about its own failures, expressed without
 * naming a vendor.
 *
 * Features depend on these interfaces rather than on Firebase directly for two
 * reasons. The first is ordinary: swapping the backend, or running one in tests,
 * should not touch call sites. The second matters more here — an interface this
 * narrow is what makes the privacy rule checkable. Nothing in this file accepts
 * a photo, a meal description, a chat turn or an email address, so no call site
 * can casually send one, and reviewing what leaves the device means reading the
 * implementations in this package rather than auditing every screen.
 *
 * Collection is off until the user turns it on. See [TelemetryCollection].
 */

/** Diagnostics for problems the user should never have to report by hand. */
interface CrashReporter {

    /**
     * Leave a developer-authored breadcrumb on the current session.
     *
     * [message] must be a constant or a value the developer chose — a state
     * name, an error code, an endpoint path. Never user content.
     */
    fun log(message: String)

    /**
     * Record a caught failure that the app recovered from but should not have
     * hit: a malformed response, an outbox op that failed permanently.
     *
     * [context] carries developer-chosen key/value pairs; values are redacted
     * and truncated before they leave the device.
     */
    fun recordNonFatal(throwable: Throwable, context: Map<String, String> = emptyMap())

    /**
     * Associate the session with an account, or clear it on sign-out.
     *
     * [userId] is the server's opaque account id — never an email address.
     */
    fun setUserId(userId: String?)
}

/** Product analytics: which flows people finish, which they abandon. */
interface AnalyticsTracker {

    /** Record a named event. [name] and [params] keys must be constants. */
    fun track(name: String, params: Map<String, String> = emptyMap())
}

/**
 * The consent switch, separated from the reporting interfaces because it is
 * driven by something else entirely: the user's `anonymisedAnalytics` consent
 * rather than by anything the feature code does.
 */
interface TelemetryCollection {

    /**
     * Turn collection on or off.
     *
     * Turning it off must also discard whatever has been gathered and not yet
     * sent — a user who withdraws consent is not agreeing to one last upload.
     */
    fun setEnabled(enabled: Boolean)
}

/**
 * Redaction applied to every value before it leaves the device.
 *
 * The interfaces above are documented as "developer-chosen values only", and
 * this is what happens when that documentation is wrong. It is a backstop, not
 * the primary control: an exception message is developer-authored right up
 * until it interpolates the thing that broke, which is how an email address or
 * a bearer token ends up in a crash report nobody meant to send.
 */
object TelemetryRedaction {

    /** Longest value kept; anything beyond this is truncated. */
    const val MAX_VALUE_LENGTH = 256

    private val EMAIL = Regex("""[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}""")

    /** JWTs and opaque bearer tokens — three dot-separated base64url runs. */
    private val JWT = Regex("""\beyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+""")

    private val BEARER = Regex("""(?i)\bbearer\s+[A-Za-z0-9._\-]+""")

    /** Replacement left in place of a redacted match, so its absence is visible. */
    const val REDACTED = "[redacted]"

    /** Redact then truncate [value]. */
    fun scrub(value: String): String {
        val redacted = value
            .replace(JWT, REDACTED)
            .replace(BEARER, REDACTED)
            .replace(EMAIL, REDACTED)
        return if (redacted.length <= MAX_VALUE_LENGTH) {
            redacted
        } else {
            redacted.take(MAX_VALUE_LENGTH) + "…"
        }
    }

    /** Scrub every value in [params], leaving keys (developer constants) alone. */
    fun scrub(params: Map<String, String>): Map<String, String> =
        params.mapValues { (_, value) -> scrub(value) }
}

/**
 * Default bindings for builds with no telemetry backend, and for tests.
 *
 * Kept as real objects rather than nullable dependencies so call sites never
 * branch on whether reporting exists.
 */
object NoOpCrashReporter : CrashReporter {
    override fun log(message: String) = Unit
    override fun recordNonFatal(throwable: Throwable, context: Map<String, String>) = Unit
    override fun setUserId(userId: String?) = Unit
}

/** No-op twin of [AnalyticsTracker]. See [NoOpCrashReporter]. */
object NoOpAnalyticsTracker : AnalyticsTracker {
    override fun track(name: String, params: Map<String, String>) = Unit
}
