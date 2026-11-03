package fit.aquazero.app.feature.onboarding

import fit.aquazero.app.core.model.ApiResult
import fit.aquazero.app.core.model.CaptchaRequirement
import fit.aquazero.app.core.model.TurnstileFailure
import fit.aquazero.app.core.model.TurnstileOutcome
import org.junit.Assert.assertEquals
import org.junit.Test
import java.io.IOException

/**
 * The registration bot-protection flow, end to end minus the WebView: what the
 * button does for each answer the server can give, and for each way a
 * challenge can end.
 *
 * The two invariants worth stating outright, because both are ways this could
 * quietly go wrong:
 *  - a token is NEVER invented; the only Submit carrying one is the one
 *    reached from a real [TurnstileOutcome.Token].
 *  - a failure is NEVER a submit; every non-token path aborts with a message.
 */
class CaptchaFlowTest {

    private val messages = SignInMessages(
        generic = "generic",
        offline = "offline",
        challengeUnavailable = "unavailable",
        challengeFailed = "failed",
        challengeCancelled = "cancelled",
    )

    @Test
    fun `bot protection off submits immediately with no token`() {
        assertEquals(
            SignInStep.Submit(captchaToken = null),
            registerStepFor(CaptchaRequirement.NotRequired, messages),
        )
    }

    @Test
    fun `bot protection on raises the register challenge`() {
        assertEquals(
            SignInStep.Challenge("register"),
            registerStepFor(CaptchaRequirement.Required, messages),
        )
    }

    @Test
    fun `an undeterminable requirement aborts rather than submitting`() {
        val requirement = CaptchaRequirement.Unavailable(ApiResult.Failure.Network(IOException()))

        assertEquals(SignInStep.Abort("unavailable"), registerStepFor(requirement, messages))
    }

    @Test
    fun `a solved challenge submits with the token`() {
        assertEquals(
            SignInStep.Submit(captchaToken = "cf-token"),
            challengeStepFor(TurnstileOutcome.Token("cf-token"), messages),
        )
    }

    @Test
    fun `each failure aborts with its own message`() {
        val expected = mapOf(
            TurnstileFailure.PageUnavailable to "unavailable",
            TurnstileFailure.ChallengeFailed to "failed",
            TurnstileFailure.Dismissed to "cancelled",
        )

        TurnstileFailure.entries.forEach { reason ->
            assertEquals(
                reason.name,
                SignInStep.Abort(expected.getValue(reason)),
                challengeStepFor(TurnstileOutcome.Failed(reason), messages),
            )
        }
    }

    @Test
    fun `no failure path ever produces a submit`() {
        TurnstileFailure.entries.forEach { reason ->
            val step = challengeStepFor(TurnstileOutcome.Failed(reason), messages)
            assertEquals(reason.name, true, step is SignInStep.Abort)
        }
    }
}
