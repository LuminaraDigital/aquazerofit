package fit.aquazero.app.feature.training

import fit.aquazero.app.core.database.ExerciseThumbnail
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The library list draws an exercise image only when that image is a reviewed
 * demonstration of the exercise. These tests pin the two rules that decide it:
 * which media is eligible, and whose name goes under it.
 */
class ExerciseThumbnailTest {

    // ----- which media may be drawn -----

    @Test
    fun `generic category fallbacks are not exercise demonstrations`() {
        // fallback-manifest.json approves these as decorative only, on the
        // stated basis that they are "not presented as movement instruction".
        listOf("strength", "cardio", "core", "mobility").forEach { category ->
            assertTrue(
                "$category fallback must not be drawn as a demonstration",
                ExerciseAttribution.isGenericFallback("/uploads/exercises/fallbacks/$category.webp"),
            )
        }
    }

    @Test
    fun `mirrored wger media is an exercise demonstration`() {
        val url = "/uploads/exercises/7c8eb1ac-2d7e-4ca7-919a-1848ba38e0f4/" +
            "e543fb73-06d0-4e1b-8645-d5706da9504a.png"
        assertFalse(ExerciseAttribution.isGenericFallback(url))
    }

    @Test
    fun `a fallback stays a fallback behind an absolute media host`() {
        // mediaUrl() may have already resolved the path against MEDIA_BASE_URL
        // before anything asks whether it is a demonstration.
        assertTrue(
            ExerciseAttribution.isGenericFallback(
                "https://app.aquazero.fit/uploads/exercises/fallbacks/core.webp",
            ),
        )
    }

    // ----- whose name goes under it -----

    @Test
    fun `a rendered image is credited to its own author not the exercise's`() {
        // The exercise document says "wger.de community contributors"; the
        // picture is Everkinetic's, and CC-BY-SA asks for the author of the
        // work actually reproduced.
        val credit = ExerciseAttribution.thumbnailCredit(
            thumbnail = thumbnail(attributionText = "© Everkinetic", licence = "CC-BY-SA 3"),
            licenceAuthor = "wger.de community contributors",
            licence = "CC-BY-SA 4",
        )
        assertEquals("© Everkinetic, CC-BY-SA 3", credit)
    }

    @Test
    fun `media with no provenance falls back to the exercise credit`() {
        val credit = ExerciseAttribution.thumbnailCredit(
            thumbnail = thumbnail(attributionText = null, licence = null, licenceAuthor = null),
            licenceAuthor = "wger.de community contributors",
            licence = "CC-BY-SA 4",
        )
        assertEquals("© wger.de community contributors, CC-BY-SA 4", credit)
    }

    @Test
    fun `a card with no image still carries the exercise credit`() {
        // The 37 fallback exercises render a glyph, but the licence line on
        // the row is not optional.
        val credit = ExerciseAttribution.thumbnailCredit(
            thumbnail = null,
            licenceAuthor = "wger.de community contributors",
            licence = "CC-BY-SA 4",
        )
        assertEquals("© wger.de community contributors, CC-BY-SA 4", credit)
    }

    @Test
    fun `media author without a licence is still credited`() {
        val credit = ExerciseAttribution.thumbnailCredit(
            thumbnail = thumbnail(attributionText = null, licence = null, licenceAuthor = "Franpol"),
            licenceAuthor = "wger.de community contributors",
            licence = "CC-BY-SA 4",
        )
        assertEquals("© Franpol", credit)
    }

    @Test
    fun `a seed exercise with no licence metadata at all has no credit line`() {
        assertNull(ExerciseAttribution.thumbnailCredit(null, licenceAuthor = "", licence = ""))
    }

    private fun thumbnail(
        attributionText: String? = null,
        licence: String? = null,
        licenceAuthor: String? = null,
        isAiGenerated: Boolean = false,
    ) = ExerciseThumbnail(
        exerciseId = "ex-chair-dip",
        url = "/uploads/exercises/uuid/file.png",
        source = "wger",
        licence = licence,
        licenceAuthor = licenceAuthor,
        attributionText = attributionText,
        isAiGenerated = isAiGenerated,
    )
}
