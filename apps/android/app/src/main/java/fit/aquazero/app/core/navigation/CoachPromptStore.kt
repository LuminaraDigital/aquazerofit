package fit.aquazero.app.core.navigation

import javax.inject.Inject
import javax.inject.Singleton

/** A coach message queued before switching to the Coach tab. */
data class PendingCoachPrompt(
    val prompt: String,
    val autoSend: Boolean = false,
)

/**
 * Holds a one-shot coach prompt until [CoachViewModel] consumes it.
 *
 * Tab switches recreate the coach ViewModel, so a NavKey parameter would be
 * lost on every bottom-nav tap. This store survives [switchTab]'s stack clear
 * the same way [DeepLinkStore] survives until the shell routes it.
 */
@Singleton
class CoachPromptStore @Inject constructor() {

    private var pending: PendingCoachPrompt? = null

    fun publish(prompt: String, autoSend: Boolean = false) {
        val trimmed = prompt.trim()
        if (trimmed.isEmpty()) return
        pending = PendingCoachPrompt(trimmed, autoSend)
    }

    fun consume(): PendingCoachPrompt? {
        val current = pending
        pending = null
        return current
    }
}
