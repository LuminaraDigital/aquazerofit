package fit.aquazero.app.core.auth

import fit.aquazero.app.core.model.ApiResult
import fit.aquazero.app.core.model.CaptchaConfigDto
import fit.aquazero.app.core.model.CaptchaRequirement
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException
import java.util.concurrent.atomic.AtomicInteger

/**
 * The enabled/disabled decision, which is the half of bot protection that has
 * to keep working when nobody has any Turnstile keys at all.
 */
class CaptchaGateTest {

    private fun gate(
        calls: AtomicInteger = AtomicInteger(),
        result: () -> ApiResult<CaptchaConfigDto>,
    ) = CaptchaGate {
        calls.incrementAndGet()
        result()
    }

    @Test
    fun `a server with bot protection off needs no challenge`() = runTest {
        val requirement = gate { ApiResult.Success(CaptchaConfigDto(enabled = false)) }.requirement()

        assertEquals(CaptchaRequirement.NotRequired, requirement)
    }

    @Test
    fun `a server with bot protection on needs a challenge`() = runTest {
        val requirement = gate {
            ApiResult.Success(CaptchaConfigDto(enabled = true, siteKey = "0x4AAA"))
        }.requirement()

        assertEquals(CaptchaRequirement.Required, requirement)
    }

    @Test
    fun `enabled with no site key is still a challenge, not a skip`() = runTest {
        // The site key is the challenge page's business, not this client's. A
        // server that says it is enforcing is taken at its word.
        val requirement = gate {
            ApiResult.Success(CaptchaConfigDto(enabled = true, siteKey = null))
        }.requirement()

        assertEquals(CaptchaRequirement.Required, requirement)
    }

    @Test
    fun `a lookup failure is unavailable, never a silent bypass`() = runTest {
        val failure = ApiResult.Failure.Network(IOException("offline"))

        val requirement = gate { failure }.requirement()

        assertEquals(CaptchaRequirement.Unavailable(failure), requirement)
    }

    @Test
    fun `an http failure is unavailable too`() = runTest {
        val failure = ApiResult.Failure.Api(httpStatus = 503, code = "HTTP_503", message = "down")

        assertTrue(gate { failure }.requirement() is CaptchaRequirement.Unavailable)
    }

    @Test
    fun `a server with no captcha route at all predates the gate and needs no challenge`() = runTest {
        // Not a hole: a deployment without /auth/captcha has no assertHuman on
        // /auth/register either. Reading this as unavailable would brick
        // registration against an older server and protect nothing.
        val notFound = ApiResult.Failure.Api(httpStatus = 404, code = "NOT_FOUND", message = "no route")

        assertEquals(CaptchaRequirement.NotRequired, gate { notFound }.requirement())
    }

    @Test
    fun `a resolved answer is asked for once and cached`() = runTest {
        val calls = AtomicInteger()
        val gate = gate(calls) { ApiResult.Success(CaptchaConfigDto(enabled = true)) }

        repeat(5) { assertEquals(CaptchaRequirement.Required, gate.requirement()) }

        assertEquals(1, calls.get())
    }

    @Test
    fun `a failed lookup is not cached, so the next attempt really retries`() = runTest {
        val calls = AtomicInteger()
        val gate = CaptchaGate {
            if (calls.incrementAndGet() == 1) {
                ApiResult.Failure.Network(IOException("offline"))
            } else {
                ApiResult.Success(CaptchaConfigDto(enabled = false))
            }
        }

        assertTrue(gate.requirement() is CaptchaRequirement.Unavailable)
        assertEquals(CaptchaRequirement.NotRequired, gate.requirement())
        assertEquals(2, calls.get())
    }
}
