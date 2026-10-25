package fit.aquazero.app.feature.nutrition

import fit.aquazero.app.R
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Meal-photo FORBIDDEN is the premium refusal. Other upload failures are not. */
class CaptureFailureBannerTest {

    @Test
    fun `a premium refusal keeps the server sentence and offers the plan`() {
        val banner = captureUploadFailureBanner(
            code = "FORBIDDEN",
            message = "This feature is part of AquaZeroFit Premium.",
        )
        assertTrue(banner.showPlan)
        assertEquals("This feature is part of AquaZeroFit Premium.", banner.message)
        assertEquals(R.string.capture_premium_required, banner.messageRes)
    }

    @Test
    fun `a blank premium message falls back to the local sentence`() {
        val banner = captureUploadFailureBanner(code = "FORBIDDEN", message = "  ")
        assertTrue(banner.showPlan)
        assertEquals(null, banner.message)
        assertEquals(R.string.capture_premium_required, banner.messageRes)
    }

    @Test
    fun `any other failure stays a retry, with no plan link`() {
        val banner = captureUploadFailureBanner(code = "VALIDATION_FAILED", message = "Photo is too large")
        assertFalse(banner.showPlan)
        assertEquals("Photo is too large", banner.message)
        assertEquals(R.string.capture_upload_failed, banner.messageRes)
    }
}
