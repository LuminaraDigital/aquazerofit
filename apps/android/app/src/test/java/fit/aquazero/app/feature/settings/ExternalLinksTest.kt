package fit.aquazero.app.feature.settings

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ExternalLinksTest {

    @Test
    fun `accepts https URLs with a host`() {
        assertTrue(isAllowedExternalUrl("https://aquazerofit.com/privacy"))
        assertTrue(isAllowedExternalUrl("HTTPS://github.com/LuminaraDigital/aquazerofit"))
        assertTrue(isAllowedExternalUrl(ExternalLinks.PRIVACY))
        assertTrue(isAllowedExternalUrl(ExternalLinks.TERMS))
        assertTrue(isAllowedExternalUrl(ExternalLinks.SUPPORT))
        assertTrue(isAllowedExternalUrl(ExternalLinks.ACCOUNT_DELETION))
        assertTrue(isAllowedExternalUrl(ExternalLinks.SOURCE_CODE))
        assertTrue(isAllowedExternalUrl(ExternalLinks.LICENCE))
        assertTrue(isAllowedExternalUrl(ExternalLinks.PLAY_SUBSCRIPTION))
    }

    @Test
    fun `rejects non-https schemes and hostless URLs`() {
        listOf(
            "http://aquazerofit.com/privacy",
            "javascript:alert(1)",
            "file:///etc/passwd",
            "intent://scan/#Intent;scheme=zxing;end",
            "content://com.example.provider/data",
            "data:text/html,<h1>x</h1>",
            "tel:+15551234567",
            "https:opaque-no-host",
            "https://",
            "",
            "   ",
            "not a url",
        ).forEach { candidate ->
            assertFalse("Expected rejection for $candidate", isAllowedExternalUrl(candidate))
        }
    }
}
