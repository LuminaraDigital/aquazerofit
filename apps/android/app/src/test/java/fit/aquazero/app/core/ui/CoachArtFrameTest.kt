package fit.aquazero.app.core.ui

import androidx.compose.ui.Alignment
import androidx.compose.ui.layout.ContentScale
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Framing for `assets/coaches/<id>/`.
 *
 * `portrait.webp` is 600x900. Cropping it from the centre into a square
 * drops the top sixth, which is the head. `avatar.webp` is the face file.
 */
class CoachArtFrameTest {

    @Test
    fun `a circular face crops from the top of the avatar`() {
        val frame = coachArtFrame(fullBody = false, portraitFile = false)
        assertEquals(ContentScale.Crop, frame.scale)
        assertEquals(Alignment.TopCenter, frame.alignment)
    }

    @Test
    fun `a circular fallback to the full-body portrait still crops from the top`() {
        val frame = coachArtFrame(fullBody = false, portraitFile = true)
        assertEquals(ContentScale.Crop, frame.scale)
        assertEquals(Alignment.TopCenter, frame.alignment)
    }

    @Test
    fun `a full-body tile fits the whole figure and stands it on the bottom`() {
        val frame = coachArtFrame(fullBody = true, portraitFile = true)
        assertEquals(ContentScale.Fit, frame.scale)
        assertEquals(Alignment.BottomCenter, frame.alignment)
    }

    @Test
    fun `a full-body tile with only an avatar still keeps the face at the top`() {
        val frame = coachArtFrame(fullBody = true, portraitFile = false)
        assertEquals(ContentScale.Crop, frame.scale)
        assertEquals(Alignment.TopCenter, frame.alignment)
    }
}
