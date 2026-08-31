package fit.aquazero.app.feature.gamification

import android.content.Intent
import fit.aquazero.app.core.ui.CoachPersona

/**
 * Brag Card Data representing shareable milestones, streaks, and coach rank.
 */
data class BragCardData(
    val userDisplayName: String,
    val coach: CoachPersona?,
    val level: Int,
    val consistencyDays: Int,
    val totalWorkouts: Int,
    val recentPr: String? = null,
)

/**
 * Brag Card & Progress Story Generator (Viral Distribution Engine).
 *
 * Builds branded, high-engagement progress stories and share payloads for
 * Telegram channels, Telegram Stories, Instagram Stories, and X/Twitter.
 */
object BragCardGenerator {

    /**
     * Format a viral brag text payload with deep-link invitation.
     */
    fun formatShareText(data: BragCardData, inviteUrl: String = "https://t.me/AquaZeroFitBot"): String {
        val coachName = data.coach?.name ?: "Aqua Coach"
        return buildString {
            appendLine("⚡ AquaZeroFit Milestone")
            appendLine("🥊 Coach: $coachName · Level ${data.level}")
            appendLine("🔥 Consistency: ${data.consistencyDays} active days")
            appendLine("🏋️ Workouts Completed: ${data.totalWorkouts}")
            data.recentPr?.let { appendLine("🏆 New PR: $it") }
            appendLine()
            appendLine("Join my squad on AquaZeroFit:")
            appendLine(inviteUrl)
        }
    }

    /**
     * Create a standard Android chooser intent for sharing progress.
     *
     * Takes no Context: this share is text-only, and `Intent.createChooser` is
     * static. A future image share would attach the rendered bitmap through a
     * FileProvider uri and would need one back.
     */
    fun createShareIntent(
        data: BragCardData,
        inviteUrl: String = "https://t.me/AquaZeroFitBot",
    ): Intent {
        val text = formatShareText(data, inviteUrl)
        val sendIntent = Intent().apply {
            action = Intent.ACTION_SEND
            putExtra(Intent.EXTRA_TEXT, text)
            putExtra(Intent.EXTRA_TITLE, "Share AquaZeroFit Progress")
            type = "text/plain"
        }
        return Intent.createChooser(sendIntent, "Share your milestone")
    }
}
