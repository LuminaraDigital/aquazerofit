package fit.aquazero.app.core.designsystem

import fit.aquazero.app.core.model.TurnstileFailure
import fit.aquazero.app.core.model.TurnstileOutcome
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * The parts of the Turnstile surface that can be decided without a device: the
 * once-only result latch, the origin comparison the navigation lock is built
 * on, and the challenge URL.
 *
 * Nothing here solves a real challenge — that needs live Cloudflare keys and a
 * person tapping a checkbox, and a test that pretends otherwise would be
 * asserting on a mock of the thing under test.
 */
class TurnstileBridgeTest {

    // -- latch ---------------------------------------------------------------

    @Test
    fun `a token is delivered once`() {
        val seen = mutableListOf<TurnstileOutcome>()
        val latch = TurnstileLatch(seen::add)

        assertTrue(latch.token("cf-token-value"))

        assertEquals(listOf(TurnstileOutcome.Token("cf-token-value")), seen)
        assertTrue(latch.isSettled)
    }

    @Test
    fun `an expiry arriving after a token cannot overwrite it`() {
        val seen = mutableListOf<TurnstileOutcome>()
        val latch = TurnstileLatch(seen::add)

        latch.token("cf-token-value")
        assertFalse(latch.fail(TurnstileFailure.ChallengeFailed))
        assertFalse(latch.fail(TurnstileFailure.Dismissed))

        assertEquals(listOf(TurnstileOutcome.Token("cf-token-value")), seen)
    }

    @Test
    fun `a token arriving after a dismissal cannot revive the attempt`() {
        val seen = mutableListOf<TurnstileOutcome>()
        val latch = TurnstileLatch(seen::add)

        latch.fail(TurnstileFailure.Dismissed)
        assertFalse(latch.token("cf-token-value"))

        assertEquals(listOf(TurnstileOutcome.Failed(TurnstileFailure.Dismissed)), seen)
    }

    @Test
    fun `a blank token is a failed challenge, never a success`() {
        val seen = mutableListOf<TurnstileOutcome>()
        val latch = TurnstileLatch(seen::add)

        latch.token("   ")

        assertEquals(listOf(TurnstileOutcome.Failed(TurnstileFailure.ChallengeFailed)), seen)
    }

    @Test
    fun `a null token is a failed challenge`() {
        val seen = mutableListOf<TurnstileOutcome>()
        val latch = TurnstileLatch(seen::add)

        latch.token(null)

        assertEquals(listOf(TurnstileOutcome.Failed(TurnstileFailure.ChallengeFailed)), seen)
    }

    @Test
    fun `an absurdly long token is refused rather than forwarded`() {
        val seen = mutableListOf<TurnstileOutcome>()
        val latch = TurnstileLatch(seen::add)

        latch.token("a".repeat(4097))

        assertEquals(listOf(TurnstileOutcome.Failed(TurnstileFailure.ChallengeFailed)), seen)
    }

    @Test
    fun `surrounding whitespace is trimmed off a token`() {
        val seen = mutableListOf<TurnstileOutcome>()
        TurnstileLatch(seen::add).token("\n cf-token-value \t")

        assertEquals(listOf(TurnstileOutcome.Token("cf-token-value")), seen)
    }

    @Test
    fun `concurrent settlers produce exactly one outcome`() {
        val seen = java.util.Collections.synchronizedList(mutableListOf<TurnstileOutcome>())
        val latch = TurnstileLatch(seen::add)
        val threads = 16
        val start = CountDownLatch(1)
        val done = CountDownLatch(threads)
        val pool = Executors.newFixedThreadPool(threads)

        repeat(threads) { i ->
            pool.execute {
                start.await()
                if (i % 2 == 0) latch.token("token-$i") else latch.fail(TurnstileFailure.Dismissed)
                done.countDown()
            }
        }
        start.countDown()
        assertTrue(done.await(5, TimeUnit.SECONDS))
        pool.shutdown()

        assertEquals(1, seen.size)
    }

    // -- origin lock ---------------------------------------------------------

    @Test
    fun `the challenge page itself is same-origin`() {
        assertTrue(
            isSameOrigin(
                "https://app.aquazero.fit",
                "https://app.aquazero.fit/mobile/captcha?action=register",
            ),
        )
    }

    @Test
    fun `implicit and explicit https ports are the same origin`() {
        assertTrue(isSameOrigin("https://app.aquazero.fit", "https://app.aquazero.fit:443/x"))
    }

    @Test
    fun `host case is not a difference`() {
        assertTrue(isSameOrigin("https://App.AquaZero.Fit", "https://app.aquazero.fit/mobile/captcha"))
    }

    @Test
    fun `a different host is refused`() {
        assertFalse(isSameOrigin("https://app.aquazero.fit", "https://evil.example/mobile/captcha"))
    }

    @Test
    fun `a subdomain of the expected host is refused`() {
        assertFalse(isSameOrigin("https://app.aquazero.fit", "https://evil.app.aquazero.fit/"))
    }

    @Test
    fun `a host that merely ends with the expected one is refused`() {
        assertFalse(isSameOrigin("https://app.aquazero.fit", "https://notapp.aquazero.fit/"))
    }

    @Test
    fun `downgrading the scheme is refused`() {
        assertFalse(isSameOrigin("https://app.aquazero.fit", "http://app.aquazero.fit/"))
    }

    @Test
    fun `a different port is refused`() {
        assertFalse(isSameOrigin("https://app.aquazero.fit", "https://app.aquazero.fit:8443/"))
    }

    @Test
    fun `non-http schemes the page could try to escape through are refused`() {
        listOf(
            "intent://app.aquazero.fit/#Intent;scheme=https;end",
            "javascript:AzfCaptcha.onToken('x')",
            "file:///android_asset/index.html",
            "data:text/html,<script>1</script>",
            "about:blank",
            "market://details?id=fit.aquazero.app",
        ).forEach { url ->
            assertFalse(url, isSameOrigin("https://app.aquazero.fit", url))
        }
    }

    @Test
    fun `null, blank and unparseable candidates are refused`() {
        assertFalse(isSameOrigin("https://app.aquazero.fit", null))
        assertFalse(isSameOrigin("https://app.aquazero.fit", ""))
        assertFalse(isSameOrigin("https://app.aquazero.fit", "https://evil.example\\@app.aquazero.fit/"))
        assertFalse(isSameOrigin("https://app.aquazero.fit", "not a url at all"))
    }

    @Test
    fun `an unparseable expected origin matches nothing`() {
        assertFalse(isSameOrigin("", "https://app.aquazero.fit/"))
        assertFalse(isSameOrigin("https://", "https://app.aquazero.fit/"))
    }

    // -- url -----------------------------------------------------------------

    @Test
    fun `the challenge url carries the action and tolerates a trailing slash`() {
        assertEquals(
            "https://app.aquazero.fit/mobile/captcha?action=register",
            challengeUrl("https://app.aquazero.fit", CAPTCHA_ACTION_REGISTER),
        )
        assertEquals(
            "https://app.aquazero.fit/mobile/captcha?action=password-reset",
            challengeUrl("https://app.aquazero.fit/", CAPTCHA_ACTION_PASSWORD_RESET),
        )
    }

    @Test
    fun `the challenge url stays on the expected origin`() {
        assertTrue(
            isSameOrigin(
                "https://app.aquazero.fit",
                challengeUrl("https://app.aquazero.fit", CAPTCHA_ACTION_REGISTER),
            ),
        )
    }
}
