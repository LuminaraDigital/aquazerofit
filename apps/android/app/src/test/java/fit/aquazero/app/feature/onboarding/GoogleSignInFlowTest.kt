package fit.aquazero.app.feature.onboarding

import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialUnknownException
import androidx.credentials.exceptions.NoCredentialException
import fit.aquazero.app.core.auth.GoogleSignInResult
import fit.aquazero.app.core.auth.googleSignInFailure
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

/** "Continue with Google": what each picker / Firebase outcome turns into. */
class GoogleSignInFlowTest {

    private val messages = SignInMessages(
        generic = "generic",
        offline = "offline",
        challengeUnavailable = "unavailable",
        challengeFailed = "failed",
        challengeCancelled = "cancelled",
        domainRestricted = { "domain:$it" },
        googleFailed = "google-failed",
        googleNoAccount = "no-account",
    )

    private val anyEmail: (String) -> Boolean = { true }

    private fun step(result: GoogleSignInResult, allowed: (String) -> Boolean = anyEmail, domain: String? = null) =
        googleSignInStepFor(result, allowed, domain, messages)

    @Test
    fun `a token is exchanged with the API`() {
        assertEquals(
            GoogleSignInStep.Exchange("fb-token"),
            step(GoogleSignInResult.Token("fb-token", "a@example.com")),
        )
    }

    @Test
    fun `an account outside the managed email domain never reaches the API`() {
        val onlyCorp: (String) -> Boolean = { it.endsWith("@corp.example") }
        assertEquals(
            GoogleSignInStep.Stop("domain:corp.example"),
            step(GoogleSignInResult.Token("fb-token", "me@gmail.com"), onlyCorp, "corp.example"),
        )
        // A Google identity with no email cannot satisfy a domain rule either.
        assertEquals(
            GoogleSignInStep.Stop("domain:corp.example"),
            step(GoogleSignInResult.Token("fb-token", null), onlyCorp, "corp.example"),
        )
    }

    @Test
    fun `closing the picker stops quietly`() {
        assertEquals(GoogleSignInStep.Stop(message = null), step(GoogleSignInResult.Cancelled))
    }

    @Test
    fun `each failure shows its own message`() {
        assertEquals(GoogleSignInStep.Stop("no-account"), step(GoogleSignInResult.NoAccount))
        assertEquals(GoogleSignInStep.Stop("offline"), step(GoogleSignInResult.Network))
        assertEquals(GoogleSignInStep.Stop("google-failed"), step(GoogleSignInResult.Failed("x")))
    }

    @Test
    fun `picker exceptions are classified`() {
        assertEquals(GoogleSignInResult.Cancelled, googleSignInFailure(GetCredentialCancellationException()))
        assertEquals(GoogleSignInResult.NoAccount, googleSignInFailure(NoCredentialException()))
        val unknown = GetCredentialUnknownException()
        assertEquals(GoogleSignInResult.Failed(unknown.type), googleSignInFailure(unknown))
    }

    @Test
    fun `a token never prints in logs`() {
        val printed = GoogleSignInResult.Token("secret-firebase-token", "a@example.com").toString()
        assertFalse(printed.contains("secret-firebase-token"))
    }
}
