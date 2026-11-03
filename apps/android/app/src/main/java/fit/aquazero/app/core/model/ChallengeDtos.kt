package fit.aquazero.app.core.model

import kotlinx.serialization.Serializable

/** Mirrors TS `BuddyChallengeMember`. */
@Serializable
data class BuddyChallengeMemberDto(
    val userId: String,
    val displayName: String = "",
    val joinedAt: String = "",
    val progressDays: Int = 0,
)

/** Mirrors TS `BuddyChallenge`. */
@Serializable
data class BuddyChallengeDto(
    val type: String = "buddyChallenge",
    val id: String,
    val code: String,
    val kind: BuddyChallengeKind = BuddyChallengeKind.LOGGING_STREAK,
    val targetDays: Int = 0,
    val durationDays: Int = 0,
    val status: BuddyChallengeStatus = BuddyChallengeStatus.OPEN,
    val createdBy: String = "",
    val members: List<BuddyChallengeMemberDto> = emptyList(),
    val startsAt: String = "",
    val endsAt: String = "",
    val createdAt: String = "",
    val updatedAt: String = "",
)

/** Envelope of `GET /challenges` — `{challenges}`. */
@Serializable
data class ChallengesDto(
    val challenges: List<BuddyChallengeDto> = emptyList(),
)

/** Envelope of single-challenge responses — `{challenge}`. */
@Serializable
data class ChallengeEnvelopeDto(
    val challenge: BuddyChallengeDto,
)

/**
 * What `GET /challenges/peek/:code` returns: enough to show an invite before
 * joining, and deliberately no `id` or member identities, since the caller is
 * not a member yet.
 */
@Serializable
data class ChallengePeekDto(
    val code: String,
    /** Defaulted to match [BuddyChallengeDto]: a new kind must not break the peek. */
    val kind: BuddyChallengeKind = BuddyChallengeKind.LOGGING_STREAK,
    val targetDays: Int,
    val durationDays: Int,
    val memberCount: Int,
    val endsAt: String,
    val status: String,
)

/** Envelope of the public peek — `{challenge}`. */
@Serializable
data class ChallengePeekEnvelopeDto(
    val challenge: ChallengePeekDto,
)

/** Body for `POST /challenges`. Outbound only, so [kind] stays required. */
@Serializable
data class CreateChallengeRequest(
    val kind: BuddyChallengeKind,
    val targetDays: Int,
    val durationDays: Int,
)

/** Body for `POST /challenges/join`. */
@Serializable
data class JoinChallengeRequest(
    val code: String,
)
