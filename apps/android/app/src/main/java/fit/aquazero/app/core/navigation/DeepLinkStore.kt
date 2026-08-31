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

    /** Parse a URI string into a join-challenge deep link, if applicable. */
    fun parseJoinChallengeUri(uriString: String?): PendingDeepLink? {
        if (uriString.isNullOrBlank()) return null
        val uri = runCatching { java.net.URI(uriString) }.getOrNull() ?: return null
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
        /** Public invite URL for buddy huddles (App Link + web fallback). */
        fun joinChallengeUrl(code: String): String {
            val normalised = ChallengesRepository.normaliseCode(code)
            return "https://app.aquazero.fit/challenges?code=$normalised"
        }

        private const val SHORTCUT_EXTRA = "fit.aquazero.app.extra.SHORTCUT_DESTINATION"
    }

    /** Parse launcher shortcut extras into a navigation destination. */
    fun parseShortcutIntent(intent: Intent?): PendingDeepLink? {
        val destination = intent?.getStringExtra(SHORTCUT_EXTRA)?.trim()?.lowercase()
            ?: return null
        return PendingDeepLink.ShortcutDestination(destination)
    }
}
