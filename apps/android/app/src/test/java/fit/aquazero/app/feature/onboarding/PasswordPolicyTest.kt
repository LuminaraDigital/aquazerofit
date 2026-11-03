package fit.aquazero.app.feature.onboarding

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The register form's password rules against the server's.
 *
 * `passwordSchema` in `packages/shared/src/schemas.ts` is the authority:
 * at least 12 characters, with a lowercase letter, an uppercase letter and a
 * digit. Android cannot import it, so the rule is duplicated — and it had
 * already drifted: the client asked for 8 characters and never checked for a
 * lowercase letter at all.
 *
 * That is worse than no client validation. A rule LOOSER than the server's
 * turns the checklist into a lie: every row ticks green, Register enables, and
 * the server answers 400 with the checklist still showing all-clear, so the
 * user has no way to tell what is wrong. These tests exist so the next drift
 * fails here instead of in the signup funnel.
 */
class PasswordPolicyTest {

    @Test
    fun `a password meeting every server rule is accepted`() {
        assertTrue(stateWith("Correct-Horse1").passwordValid)
    }

    @Test
    fun `eleven characters is rejected because the server wants twelve`() {
        // The exact regression: the old client floor was 8.
        assertFalse(stateWith("Abcdefghij1").passwordValid)
    }

    @Test
    fun `twelve characters is the boundary and is accepted`() {
        assertTrue(stateWith("Abcdefghij1k").passwordValid)
    }

    @Test
    fun `no lowercase letter is rejected`() {
        // "PASSWORD1234" passed the old client rule and was refused by the
        // server, which is precisely the dead end this pins shut.
        assertFalse(stateWith("PASSWORD1234").passwordValid)
    }

    @Test
    fun `no uppercase letter is rejected`() {
        assertFalse(stateWith("password1234").passwordValid)
    }

    @Test
    fun `no digit is rejected`() {
        assertFalse(stateWith("PasswordAbcde").passwordValid)
    }

    @Test
    fun `register cannot be submitted while the password is invalid`() {
        // passwordValid alone is not the guard the UI uses — canSubmit is.
        val short = stateWith("Abcdefghij1", registerMode = true)
        assertFalse(short.canSubmit)
        assertTrue(stateWith("Correct-Horse1", registerMode = true).canSubmit)
    }

    @Test
    fun `sign-in mode does not apply the register rules`() {
        // An existing account may predate the current policy; refusing to let
        // them type their real password would lock them out of their own data.
        assertTrue(stateWith("old-short", registerMode = false).canSubmit)
    }

    private fun stateWith(password: String, registerMode: Boolean = false) = SignInUiState(
        registerMode = registerMode,
        email = "someone@example.com",
        password = password,
    )
}
