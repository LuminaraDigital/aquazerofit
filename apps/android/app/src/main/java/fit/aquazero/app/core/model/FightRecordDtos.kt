package fit.aquazero.app.core.model

import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder

// Fight Record: seasons and Consistency Belts (AZF-W3-05 §4.3), mirroring
// `packages/shared/src/types/fightRecord.ts`.

/**
 * Mirrors TS `BELT_TIERS`. Ascending and load-bearing: a held-rung check is an
 * ordinal comparison, which is why the server only ever appends at the top.
 *
 * [UNKNOWN] is a tier added after this build shipped, read by
 * [BeltTierSerializer] instead of failing the payload. It sits last for the
 * same append-only reason, so every known rung counts as held beneath it.
 * "No belt yet" is a different fact and stays a null tier: folding the two
 * together would tell the holder of a new belt that they have none.
 */
@Serializable(with = BeltTierSerializer::class)
enum class BeltTier(internal val wire: String) {
    WHITE("white"),
    BLUE("blue"),
    PURPLE("purple"),
    BROWN("brown"),
    BLACK("black"),
    UNKNOWN("unknown"),
}

/**
 * Wire names in, [BeltTier.UNKNOWN] for anything else. A plain enum would
 * need a non-null default to coerce into, and with `explicitNulls = false` a
 * defaulted nullable field cannot survive the offline cache: the encoder
 * drops a null, and decoding the gap would bring back the default.
 */
internal object BeltTierSerializer : KSerializer<BeltTier> {
    override val descriptor: SerialDescriptor =
        PrimitiveSerialDescriptor("fit.aquazero.app.core.model.BeltTier", PrimitiveKind.STRING)

    override fun deserialize(decoder: Decoder): BeltTier {
        val wire = decoder.decodeString()
        return BeltTier.entries.firstOrNull { it.wire == wire } ?: BeltTier.UNKNOWN
    }

    override fun serialize(encoder: Encoder, value: BeltTier) = encoder.encodeString(value.wire)
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
    val tier: BeltTier,
    val activeDays: Int = 0,
)

/** Mirrors TS `BeltAwardView`. The stored award's user id never leaves the API. */
@Serializable
data class BeltAwardDto(
    val id: String = "",
    val seasonNumber: Int = 0,
    val seasonName: String = "",
    val tier: BeltTier,
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
