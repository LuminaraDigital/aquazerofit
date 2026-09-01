package fit.aquazero.app.feature.onboarding

import fit.aquazero.app.core.designsystem.CAPTCHA_ACTION_PASSWORD_RESET
import fit.aquazero.app.core.designsystem.CAPTCHA_ACTION_REGISTER
import fit.aquazero.app.core.model.ApiResult
import fit.aquazero.app.core.model.CaptchaRequirement
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test
import java.io.IOException

/**
 * The reset-mail request's half of the bot-protection flow.
 *
 * An Android-only user who forgot their password previously had no route at
 * all: `AuthApi.requestPasswordReset`, `AuthRepository.requestPasswordReset`
 * and [CAPTCHA_ACTION_PASSWORD_RESET] all existed with nothing calling them.
 * These tests pin the two things that make the new entry point safe rather
 * than merely present — it is gated like registration, and it is audited
 * under its own action name.
 */
class PasswordResetFlowTest {

    /** Any failure will do; the step function branches on the case, not the cause. */
    private val unavailable =
        CaptchaRequirement.Unavailable(ApiResult.Failure.Network(IOException()))

    private val messages = SignInMessages(
        generic = "generic",
        offline = "offline",
        challengeUnavailable = "unavailable",
        challengeFailed = "failed",
        challengeCancelled = "cancelled",
    )

    @Test
    fun `bot protection off requests the mail immediately with no token`() {
        assertEquals(
            SignInStep.Submit(captchaToken = null),
            passwordResetStepFor(CaptchaRequirement.NotRequired, messages),
        )
    }

    @Test
    fun `bot protection on raises the challenge under the password-reset action`() {
        assertEquals(
            SignInStep.Challenge(CAPTCHA_ACTION_PASSWORD_RESET),
            passwordResetStepFor(CaptchaRequirement.Required, messages),
        )
    }

    @Test
    fun `an unreachable captcha gate aborts rather than requesting anyway`() {
        // Fail closed, matching registration: /auth/captcha and
        // /auth/password-reset/request are the same host, so a lookup that
        // failed almost certainly means a request that would fail too — and
        // submitting anyway trades a plain "check your connection" for the
        // server's VALIDATION_FAILED.
        assertEquals(
            SignInStep.Abort(messages.challengeUnavailable),
            passwordResetStepFor(unavailable, messages),
        )
    }

    @Test
    fun `reset and register are audited under different action names`() {
        // The action name is what the server records the attempt under. If
        // these two ever collapsed onto one constant, reset traffic would be
        // indistinguishable from registration traffic in the abuse signal.
        val reset = passwordResetStepFor(CaptchaRequirement.Required, messages)
        val register = registerStepFor(CaptchaRequirement.Required, messages)
        assertNotEquals(reset, register)
        assertEquals(SignInStep.Challenge(CAPTCHA_ACTION_REGISTER), register)
    }

    @Test
    fun `both flows agree on what an unreachable gate means`() {
        // Divergence here would mean one entry point fails closed and the
        // other does not.
        assertEquals(
            registerStepFor(unavailable, messages),
            passwordResetStepFor(unavailable, messages),
        )
    }
}
