package fit.aquazero.app.feature.training

import fit.aquazero.app.BuildConfig
import fit.aquazero.app.core.database.ExerciseMediaEntity
import fit.aquazero.app.core.database.ExerciseThumbnail
import fit.aquazero.app.core.model.ExerciseDto

/**
 * CC-BY-SA attribution assembly (plan §5.6 / AQF-12).
 *
 * The exercise corpus is imported from wger under CC-BY-SA, so **every**
 * surface that shows an exercise must show its attribution: the library card,
 * the detail sheet, and any media rendered inside it. This is a licence
 * obligation, not a nicety — the helpers below exist so no call site can
 * accidentally render an exercise without one.
 */
object ExerciseAttribution {

    /** One attribution line for a single media item. */
    data class MediaCredit(
        val text: String,
        val licenceUrl: String?,
        val source: String?,
    )

    /**
     * Card-level line for the exercise document itself. Returns null only when
     * the record genuinely carries no licence metadata (seed data authored
     * in-house), in which case there is nothing to attribute.
     */
    fun exerciseCredit(licenceAuthor: String, licence: String): String? {
        val author = licenceAuthor.trim()
        val lic = licence.trim()
        return when {
            author.isNotEmpty() && lic.isNotEmpty() -> "© $author, $lic"
            author.isNotEmpty() -> "© $author"
            lic.isNotEmpty() -> lic
            else -> null
        }
    }

    /** True when the exercise record points back at wger for the licence. */
    fun viaWger(exercise: ExerciseDto): Boolean =
        exercise.licenceUrl != null || exercise.wgerUuid != null

    /**
     * Per-image credits, de-duplicated. Media with no provenance at all is
     * skipped — the exercise-level credit still renders beneath it.
     */
    fun mediaCredits(media: List<ExerciseMediaEntity>): List<MediaCredit> {
        val seen = mutableSetOf<String>()
        return media.filter { it.kind == KIND_IMAGE }.mapNotNull { item ->
            val hasProvenance = listOf(
                item.source,
                item.attributionText,
                item.licence,
                item.licenceAuthor,
                item.licenceUrl,
            ).any { !it.isNullOrBlank() }
            if (!hasProvenance) return@mapNotNull null

            val composed = item.attributionText
                ?: listOfNotNull(
                    item.licenceAuthor?.takeIf { it.isNotBlank() }?.let { "© $it" },
                    item.licence?.takeIf { it.isNotBlank() },
                ).joinToString(", ")
            val text = if (!item.attributionText.isNullOrBlank() && !item.licence.isNullOrBlank()) {
                "${item.attributionText}, ${item.licence}"
            } else {
                composed
            }
            if (text.isBlank()) return@mapNotNull null
            val key = "$text|${item.licenceUrl.orEmpty()}|${item.source.orEmpty()}"
            if (!seen.add(key)) return@mapNotNull null
            MediaCredit(text = text, licenceUrl = item.licenceUrl, source = item.source)
        }
    }

    /**
     * True when the displayed pixels were AI-generated and must say so
     * (Play AI-generated-content policy). Per-media provenance wins; the
     * exercise-level flag is the legacy fallback.
     */
    fun isAiGenerated(exercise: ExerciseDto, media: List<ExerciseMediaEntity>): Boolean {
        val images = media.filter { it.kind == KIND_IMAGE }
        return images.any { it.isAiGenerated } || exercise.isAiGeneratedMedia == true
    }

    /** Images only — videos and other kinds are not rendered in the sheet. */
    fun images(media: List<ExerciseMediaEntity>): List<ExerciseMediaEntity> =
        media.filter { it.kind == KIND_IMAGE }

    /**
     * Is this a picture *of the exercise*, or the generic stand-in the server
     * hands back when it has nothing?
     *
     * Every exercise comes back with a media row, but 37 of the current 51
     * point at one of four shared category illustrations under
     * `/uploads/exercises/fallbacks/`. Those are not demonstrations: the same
     * `strength.webp` stands in for a Band Squat and a Bench Dip alike.
     *
     * Skipping them is a licence and safety obligation, not a taste call.
     * `apps/api/src/data/media/fallback-manifest.json` declares them
     * `"Decorative category fallback artwork; never exercise-form
     * instruction"`, and records `formSafetyReviewRequired: false` with the
     * reason that the art "is not presented as movement instruction". Drawing
     * one in the thumbnail slot next to an exercise name presents it as
     * exactly that, which would void the condition their approval rests on —
     * and `docs/plans/workout-media/plan.md` holds the line that "no
     * unreviewed AI image may be presented as exercise-form guidance".
     *
     * So the list draws reviewed art and keeps the equipment glyph everywhere
     * else. The path segment is the server's own marker; it is matched here
     * alone so the rule has one home when the corpus gains real media.
     */
    fun isGenericFallback(url: String): Boolean = url.contains(FALLBACK_PATH_MARKER)

    /**
     * The credit line for a card that is showing [thumbnail]'s pixels.
     *
     * The exercise document credits "wger.de community contributors"; the
     * image on it is often Everkinetic's, and CC-BY-SA asks to be told who
     * made *the work being reproduced*. So a card rendering real media
     * credits the media, and falls back to the exercise-level line when the
     * media carries no provenance of its own.
     */
    fun thumbnailCredit(
        thumbnail: ExerciseThumbnail?,
        licenceAuthor: String,
        licence: String,
    ): String? {
        if (thumbnail == null) return exerciseCredit(licenceAuthor, licence)
        thumbnail.attributionText?.takeIf { it.isNotBlank() }?.let { text ->
            val lic = thumbnail.licence?.takeIf { it.isNotBlank() }
            return if (lic != null) "$text, $lic" else text
        }
        val mediaCredit = exerciseCredit(
            licenceAuthor = thumbnail.licenceAuthor.orEmpty(),
            licence = thumbnail.licence.orEmpty(),
        )
        return mediaCredit ?: exerciseCredit(licenceAuthor, licence)
    }

    /**
     * Resolve a server-relative media path (`/uploads/…`) against
     * `MEDIA_BASE_URL`, mirroring the web's `mediaUrl()`.
     */
    fun mediaUrl(path: String): String = when {
        path.startsWith("http://") || path.startsWith("https://") -> path
        path.startsWith("/") -> BuildConfig.MEDIA_BASE_URL.trimEnd('/') + path
        else -> BuildConfig.MEDIA_BASE_URL.trimEnd('/') + "/" + path
    }

    private const val KIND_IMAGE = "image"

    /** Server path segment marking a generic category stand-in. */
    private const val FALLBACK_PATH_MARKER = "/exercises/fallbacks/"
}
