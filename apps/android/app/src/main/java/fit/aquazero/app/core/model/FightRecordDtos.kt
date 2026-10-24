package fit.aquazero.app.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// Fight Record: seasons and Consistency Belts (AZF-W3-05 §4.3), mirroring
// `packages/shared/src/types/fightRecord.ts`.

/**
 * Mirrors TS `BELT_TIERS`. Ascending and load-bearing: a held-rung check is an
 * ordinal comparison, which is why the server only ever appends at the top.
 *
 * Every field typed with this enum is nullable with a `null` default, and that
 * is the whole forward-compatibility story: under `AzfJson.coerceInputValues`
 * a tier this build has never heard of decodes to `null` instead of failing
 * the payload. Callers read a null rung or belt tier as "skip that row" and a
 * null current tier as "No belt yet", so a server that appends a tier above
 * black degrades one row instead of blanking the whole surface.
 */
@Serializable
enum class BeltTier {
    @SerialName("white")
    WHITE,

    @SerialName("blue")
    BLUE,

    @SerialName("purple")
    PURPLE,

    @SerialName("brown")
    BROWN,

    @SerialName("black")
    BLACK,
}

/** Mirrors TS `Season`: a 56-day span of the user's local dates, inclusive. */
@Serializable
data class SeasonDto(
    val id: String = "",
    /** 1-based. */
    val number: Int,
    val name: String,
    /** ISO local date. */
    val startsOn: String,
    /** ISO local date, inclusive. */
    val endsOn: String,
)

/** Mirrors TS `BeltRung`: the active days in a season that earn [tier]. */
@Serializable
data class BeltRungDto(
    val tier: BeltTier? = null,
    val activeDays: Int = 0,
)

/** Mirrors TS `BeltAwardView`. The stored award's user id never leaves the API. */
@Serializable
data class BeltAwardDto(
    val id: String = "",
    val seasonNumber: Int = 0,
    val seasonName: String = "",
    val tier: BeltTier? = null,
    val awardedAt: String = "",
)

/** Mirrors TS `FightRecordSeasonProgress`. */
@Serializable
data class FightRecordSeasonProgressDto(
    val season: SeasonDto,
    /** Distinct active local dates inside the season, up to today. */
    val activeDays: Int = 0,
    /** Days remaining including today. Information, never a countdown. */
    val daysLeft: Int = 0,
    /** Highest belt held this season, or null before the first rung. */
    val tier: BeltTier? = null,
    /** The next rung, or null once black is held. */
    val next: BeltRungDto? = null,
)

/** Mirrors TS `EmojiStatusSetting`. Telegram-only; decoded, never shown here. */
@Serializable
data class EmojiStatusSettingDto(
    val available: Boolean = false,
    val enabled: Boolean = false,
)

/**
 * Mirrors TS `FightRecordStatus`. Android is display-only in R1a, so
 * [celebrate], [adult] and [emojiStatus] are decoded for contract parity and
 * never acted on here.
 */
@Serializable
data class FightRecordStatusDto(
    val current: FightRecordSeasonProgressDto,
    val ladder: List<BeltRungDto> = emptyList(),
    /** Highest belt from every season that has one, newest season first. */
    val belts: List<BeltAwardDto> = emptyList(),
    val celebrate: BeltAwardDto? = null,
    val adult: Boolean = false,
    val emojiStatus: EmojiStatusSettingDto = EmojiStatusSettingDto(),
)

/**
 * Envelope of `GET /fight-record` — `{fightRecord}`. A null [fightRecord] is
 * the server saying the feature is off for this account (US-10), not an
 * error: every surface then renders nothing at all.
 */
@Serializable
data class FightRecordEnvelopeDto(
    val fightRecord: FightRecordStatusDto? = null,
)
