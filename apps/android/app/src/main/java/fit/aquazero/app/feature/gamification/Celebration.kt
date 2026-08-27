package fit.aquazero.app.feature.gamification

import fit.aquazero.app.core.model.CoachReactionDto
import fit.aquazero.app.core.model.ExperienceStatusDto
import fit.aquazero.app.core.model.ProgressionStatusDto
import fit.aquazero.app.core.model.ReactionAckRequest

/**
 * A moment the app owes the user.
 *
 * Every [reaction] string is authored — written into the roster, rendered by
 * the server with `{n}` / `{name}` substituted, and handed over as text. None
 * of it is model output, and the celebration surface has no path that could
 * make it so. That is what lets the warmest moment in the product also be the
 * only one that is instant, free, offline-capable and incapable of saying
 * something unsafe.
 */
sealed interface Celebration {

    /** The coach whose voice is speaking. */
    val coachId: String

    /** The authored line, already substituted server-side. */
    val reaction: String

    data class LevelUp(
        val level: Int,
        val rankName: String,
        override val coachId: String,
        override val reaction: String,
    ) : Celebration

    data class RankUp(
        val rankId: String,
        val rankName: String,
        val level: Int,
        override val coachId: String,
        override val reaction: String,
    ) : Celebration

    data class Achievement(
        override val coachId: String,
        override val reaction: String,
    ) : Celebration
}

/** Reaction kinds that earn a full-screen or banner moment. */
private const val KIND_LEVEL_UP = "levelUp"
private const val KIND_RANK_UP = "rankUp"
private const val KIND_ACHIEVEMENT = "achievement"

/**
 * Turn a progression snapshot into the queue of moments to play.
 *
 * Only the three celebratory kinds qualify. The rest — `greeting`, `steady`,
 * `returning`, `restDay`, `resting` — are the coach's ambient voice and belong
 * on the dashboard card, not behind a full-screen takeover; interrupting
 * someone's morning to tell them they rested would turn a kindness into a
 * nag. Order follows the server's, which already leads with the biggest news.
 */
fun celebrationsOf(status: ProgressionStatusDto): List<Celebration> {
    val experience = status.experience
    return status.reactions.mapNotNull { reaction -> reaction.toCelebration(experience) }
}

private fun CoachReactionDto.toCelebration(experience: ExperienceStatusDto): Celebration? =
    when (kind) {
        KIND_LEVEL_UP -> Celebration.LevelUp(
            level = experience.level,
            rankName = experience.rank.name,
            coachId = coachId,
            reaction = text,
        )
        KIND_RANK_UP -> Celebration.RankUp(
            rankId = experience.rank.id,
            rankName = experience.rank.name,
            level = experience.level,
            coachId = coachId,
            reaction = text,
        )
        KIND_ACHIEVEMENT -> Celebration.Achievement(
            coachId = coachId,
            reaction = text,
        )
        else -> null
    }

/**
 * The acknowledgement for a queue that has actually been shown.
 *
 * `POST /coaches/reactions/ack` takes no meaningful body — the server marks
 * whatever is currently outstanding as delivered. The request is still built
 * from the *displayed* queue rather than from the latest snapshot, because the
 * thing this call must never do is acknowledge a celebration nobody saw: an
 * unacknowledged reaction reappears, which is recoverable; a burned one is
 * gone for good.
 */
fun ackRequestFor(
    shown: List<Celebration>,
    experience: ExperienceStatusDto,
): ReactionAckRequest = ReactionAckRequest(
    level = shown.filterIsInstance<Celebration.LevelUp>().maxOfOrNull { it.level }
        ?: shown.filterIsInstance<Celebration.RankUp>().maxOfOrNull { it.level }
        ?: experience.level,
    rankId = shown.filterIsInstance<Celebration.RankUp>().lastOrNull()?.rankId,
    achievementIds = null,
)
