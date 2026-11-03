package fit.aquazero.app.core.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Client-side meal-photo validation, mirroring `MEAL_PHOTO_MAX_BYTES` and
 * `MEAL_PHOTO_MIME`. The server re-validates everything — this exists so a
 * doomed upload is refused before it costs the user data and a wait.
 */
class MealPhotoRulesTest {

    @Test
    fun `the API's three mime types are accepted`() {
        assertTrue(MealPhotoRules.isAcceptedMime("image/jpeg"))
        assertTrue(MealPhotoRules.isAcceptedMime("image/png"))
        assertTrue(MealPhotoRules.isAcceptedMime("image/heic"))
    }

    @Test
    fun `heif is accepted because pickers report it for heic`() {
        assertTrue(MealPhotoRules.isAcceptedMime("image/heif"))
    }

    @Test
    fun `mime matching ignores case and parameters`() {
        assertTrue(MealPhotoRules.isAcceptedMime("IMAGE/JPEG"))
        assertTrue(MealPhotoRules.isAcceptedMime("image/jpeg; charset=binary"))
    }

    @Test
    fun `other types are rejected`() {
        assertFalse(MealPhotoRules.isAcceptedMime("image/gif"))
        assertFalse(MealPhotoRules.isAcceptedMime("image/webp"))
        assertFalse(MealPhotoRules.isAcceptedMime("application/pdf"))
        assertFalse(MealPhotoRules.isAcceptedMime("video/mp4"))
        assertFalse(MealPhotoRules.isAcceptedMime(null))
        assertFalse(MealPhotoRules.isAcceptedMime(""))
    }

    @Test
    fun `a mime-less heic falls back to its extension`() {
        assertTrue(MealPhotoRules.accepts(mime = null, name = "IMG_0421.HEIC"))
        assertTrue(MealPhotoRules.accepts(mime = "", name = "lunch.jpeg"))
        assertFalse(MealPhotoRules.accepts(mime = null, name = "notes.txt"))
        assertFalse(MealPhotoRules.accepts(mime = null, name = "no-extension"))
    }

    @Test
    fun `a wrong mime is not rescued by a right extension`() {
        // A declared type we cannot use is a refusal, not something to
        // second-guess from the filename.
        assertFalse(MealPhotoRules.accepts(mime = "image/gif", name = "lunch.jpg"))
    }

    @Test
    fun `the size limit is exactly 10MB`() {
        assertEquals(10L * 1024 * 1024, MealPhotoRules.MAX_BYTES)
        assertFalse(MealPhotoRules.exceedsMax(MealPhotoRules.MAX_BYTES))
        assertFalse(MealPhotoRules.exceedsMax(0L))
        assertTrue(MealPhotoRules.exceedsMax(MealPhotoRules.MAX_BYTES + 1))
    }

    @Test
    fun `sample size is a power of two that keeps the image above the target`() {
        assertEquals(1, MealPhotoRules.sampleSizeFor(1200, 900, maxEdge = 1600))
        assertEquals(1, MealPhotoRules.sampleSizeFor(3000, 2000, maxEdge = 1600))
        assertEquals(2, MealPhotoRules.sampleSizeFor(4032, 3024, maxEdge = 1600))
        assertEquals(4, MealPhotoRules.sampleSizeFor(8000, 6000, maxEdge = 1600))
    }

    @Test
    fun `degenerate dimensions never divide by zero`() {
        assertEquals(1, MealPhotoRules.sampleSizeFor(0, 0))
        assertEquals(1, MealPhotoRules.sampleSizeFor(-10, 40))
        assertEquals(1, MealPhotoRules.sampleSizeFor(4000, 3000, maxEdge = 0))
    }

    @Test
    fun `the scale factor never upscales a small photo`() {
        assertEquals(1.0, MealPhotoRules.scaleFactorFor(800, 600, maxEdge = 1600), 0.0)
        assertEquals(0.5, MealPhotoRules.scaleFactorFor(3200, 2400, maxEdge = 1600), 1e-9)
    }

    @Test
    fun `the quality ladder only ever goes down`() {
        val ladder = MealPhotoRules.QUALITY_LADDER
        assertTrue(ladder.isNotEmpty())
        assertEquals(ladder.sortedDescending(), ladder)
        assertTrue(ladder.all { it in 1..100 })
    }
}
