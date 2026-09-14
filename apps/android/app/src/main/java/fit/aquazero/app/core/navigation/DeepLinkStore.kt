package fit.aquazero.app.core.navigation

import android.content.Intent
import fit.aquazero.app.core.data.ChallengesRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

/** Deep-link destinations the shell knows how to route. */
sealed interface PendingDeepLink {
    data class JoinChallenge(val code: String) : PendingDeepLink
    data class ShortcutDestination(val destination: String) : PendingDeepLink
}

/**
 * Holds a deep link until the authed shell can consume it.
 *
 * MainActivity parses VIEW intents; [AzfNavigation] drains the queue once
 * the user is signed in.
 */
@Singleton
class DeepLinkStore @Inject constructor() {

    private val _pending = MutableStateFlow<PendingDeepLink?>(null)
    val pending: StateFlow<PendingDeepLink?> = _pending.asStateFlow()

    fun publish(link: PendingDeepLink) {
        _pending.value = link
    }

    fun consume(): PendingDeepLink? {
        val current = _pending.value
        _pending.value = null
        return current
    }

    /**
     * Parse a URI string into a join-challenge deep link, if applicable.
     *
     * Origin is checked first, and it is a security check rather than a
     * tidiness one. The manifest's `autoVerify` intent-filter constrains
     * scheme and host, but that filter only governs *implicit* intents: any
     * app on the device can send [MainActivity] an **explicit**
     * `ACTION_VIEW` intent naming this activity directly, and that intent
     * never passes through the filter at all. Without this check a hostile
     * app could hand us `evil://anything/challenges?code=AQUA1234` and drive
     * navigation in someone else's app.
     *
     * The blast radius was small — the shell routes to a fixed `when`, the
     * code is validated below, and joining still needs a deliberate tap on
     * the Join button — so this closes nuisance navigation and UI redress
     * rather than a data leak. It is cheap, and "small" is not "none".
     *
     * [ORIGIN] is shared with [joinChallengeUrl], so the URL this app hands
     * out and the URL it will accept cannot drift apart.
     */
    fun parseJoinChallengeUri(uriString: String?): PendingDeepLink? {
        if (uriString.isNullOrBlank()) return null
        val uri = runCatching { java.net.URI(uriString) }.getOrNull() ?: return null

        // Compared case-insensitively: scheme and host are case-insensitive per
        // RFC 3986, and `URI` preserves whatever case the sender used. Reading
        // `host` rather than splitting the string is deliberate — it is what
        // makes `https://app.aquazero.fit@evil.example/challenges` resolve to
        // the host `evil.example` and be refused, instead of matching on a
        // userinfo field that merely looks like the real origin.
        if (!SCHEME.equals(uri.scheme, ignoreCase = true)) return null
        if (!HOST.equals(uri.host, ignoreCase = true)) return null

        val path = uri.path?.trim('/') ?: return null
        if (path != "challenges" && !path.endsWith("/challenges")) return null

        val queryParams = uri.query?.split('&')?.associate {
            val parts = it.split('=', limit = 2)
            parts[0] to (parts.getOrNull(1) ?: "")
        } ?: emptyMap()

        val rawCode = queryParams["challenge"]
            ?: queryParams["code"]
            ?: path.substringAfterLast('/').takeIf { it.startsWith("AQUA", ignoreCase = true) }
            ?: return null

        val normalised = ChallengesRepository.normaliseCode(rawCode)
        if (!ChallengesRepository.isPlausibleCode(normalised)) return null
        return PendingDeepLink.JoinChallenge(normalised)
    }

    /** Parse a VIEW intent into a join-challenge deep link, if applicable. */
    fun parseJoinChallengeIntent(intent: Intent?): PendingDeepLink? {
        if (intent == null || intent.action != Intent.ACTION_VIEW) return null
        return parseJoinChallengeUri(intent.dataString)
    }

    companion object {
        /**
         * The only origin a challenge invite may arrive from.
         *
         * These two must stay in step with the App Link `<data>` element in
         * AndroidManifest.xml. They are duplicated rather than shared because
         * manifest placeholders are not substituted into arbitrary attributes
         * and a build-time constant cannot be read from XML — so if the host
         * ever moves, both this pair and the manifest filter change together,
         * or verified links stop arriving.
         */
        private const val SCHEME = "https"
        private const val HOST = "app.aquazero.fit"

        /** Public invite URL for buddy huddles (App Link + web fallback). */
        fun joinChallengeUrl(code: String): String {
            val normalised = ChallengesRepository.normaliseCode(code)
            return "$SCHEME://$HOST/challenges?code=$normalised"
        }

        private const val SHORTCUT_EXTRA = "fit.aquazero.app.extra.SHORTCUT_DESTINATION"
    }

    /**
     * Parse launcher shortcut extras into a navigation destination, removing
     * the extra from [intent] as it goes.
     *
     * The removal is the point. The launcher's intent outlives the parse: the
     * activity holds it (`setIntent` in `onNewIntent`), and Android hands the
     * same instance back to `onCreate` on every configuration change and after
     * process death. Reading it non-destructively meant a rotation on the
     * weight screen re-published "log_weight" and pushed a second copy of it
     * over whatever the user had navigated to since. Stripping the extra makes
     * the shortcut a one-shot regardless of who re-reads the intent later.
     *
     * An unrecognised value is still returned here and dropped by the shell's
     * `when`, so a shortcut naming a destination this build does not have opens
     * the default surface rather than crashing.
     */
    fun parseShortcutIntent(intent: Intent?): PendingDeepLink? {
        val link = parseShortcutDestination(intent?.getStringExtra(SHORTCUT_EXTRA))
            ?: return null
        intent?.removeExtra(SHORTCUT_EXTRA)
        return link
    }

    /**
     * The pure half of [parseShortcutIntent], split out for the same reason
     * [parseJoinChallengeUri] is: `android.content.Intent` is a stub on the JVM
     * test classpath (no Robolectric here), so anything reachable only through
     * an Intent can be exercised on a device and nowhere else. Normalisation is
     * where the bugs live — a shortcut value is authored by hand in
     * `res/xml/shortcuts.xml` — so it belongs on this side of the line.
     */
    fun parseShortcutDestination(raw: String?): PendingDeepLink? {
        val destination = raw?.trim()?.lowercase()
        if (destination.isNullOrEmpty()) return null
        return PendingDeepLink.ShortcutDestination(destination)
    }
}
