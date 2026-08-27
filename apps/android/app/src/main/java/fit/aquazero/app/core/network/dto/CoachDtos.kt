package fit.aquazero.app.core.network.dto

import kotlinx.serialization.Serializable

/** Mirrors TS `CoachRank` (gamification.ts). */
@Serializable
data class CoachRankDto(
    val id: String,
    val name: String,
    val minLevel: Int = 1,
)

/** Mirrors TS `XpBreakdownEntry`. */
@Serializable
data class XpBreakdownEntryDto(
    val kind: String,
    val label: String,
    val points: Int,
)

/** Mirrors TS `ExperienceStatus`. */
@Serializable
data class ExperienceStatusDto(
    val totalXp: Int = 0,
    val level: Int = 1,
    val rank: CoachRankDto = CoachRankDto(id = "rookie", name = "Rookie"),
    val levelStartXp: Int = 0,
    val nextLevelXp: Int? = null,
    val levelProgress: Double = 0.0,
    val earnedToday: Int = 0,
    val todayBreakdown: List<XpBreakdownEntryDto> = emptyList(),
    val dailyCapReached: Boolean = false,
)

/** Mirrors TS `CoachEntitlement`. */
@Serializable
data class CoachEntitlementDto(
    val coachId: String,
    val unlocked: Boolean = false,
    val reason: CoachLockReason = CoachLockReason.LOCKED,
    val requiredLevel: Int = 0,
    val starsPrice: Int? = null,
    val bondXp: Int = 0,
    val bondLevel: Int = 1,
)

/** Mirrors TS `CoachReaction`. */
@Serializable
data class CoachReactionDto(
    val coachId: String,
    val kind: String,
    val text: String,
    val expression: CoachExpression = CoachExpression.NEUTRAL,
)

/** Mirrors TS `CoachRosterResponse` — `GET /coaches`. */
@Serializable
data class CoachRosterDto(
    val activeCoachId: String,
    val experience: ExperienceStatusDto = ExperienceStatusDto(),
    val entitlements: List<CoachEntitlementDto> = emptyList(),
    /** Present in the payload; Android never shows purchase UI. */
    val starsAvailable: Boolean = false,
)

/** Mirrors TS `ProgressionStatus` — `GET /coaches/progression`. */
@Serializable
data class ProgressionStatusDto(
    val experience: ExperienceStatusDto = ExperienceStatusDto(),
    val activeCoachId: String = "",
    val bondXp: Int = 0,
    val bondLevel: Int = 1,
    val reactions: List<CoachReactionDto> = emptyList(),
)

/** Body for `POST /coaches/select`. */
@Serializable
data class CoachSelectRequest(
    val coachId: String,
)

/** Body for `POST /coaches/reactions/ack`. */
@Serializable
data class ReactionAckRequest(
    val level: Int? = null,
    val rankId: String? = null,
    val achievementIds: List<String>? = null,
)
