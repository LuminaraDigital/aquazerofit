package fit.aquazero.app.core.model

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The credential-carrying DTOs must not print their secrets, and must still
 * send them.
 *
 * Both halves matter, and the second is why this test exists rather than a
 * code review note. Redacting a `data class` by overriding `toString()` is
 * only safe because kotlinx.serialization writes through the generated
 * serializer; someone who "fixed" the redaction by changing the property
 * itself — renaming it, wrapping it in a value class, marking it `@Transient`
 * — would break authentication in a way no `toString` assertion would catch.
 * So every case below asserts the wire body as well.
 */
class AuthDtoRedactionTest {

    private val json = Json { encodeDefaults = true }

    @Test
    fun `login request hides the password but still sends it`() {
        val request = LoginRequest(email = "a@b.test", password = "hunter2-correct-horse")

        assertFalse("password leaked into toString", request.toString().contains("hunter2"))
        assertTrue("email is not a secret and stays readable", request.toString().contains("a@b.test"))

        val wire = json.encodeToString(LoginRequest.serializer(), request)
        assertTrue("the real password must still reach the server", wire.contains("hunter2-correct-horse"))
    }

    @Test
    fun `register request hides password and captcha token`() {
        val request = RegisterRequest(
            email = "a@b.test",
            password = "hunter2-correct-horse",
            displayName = "Sam",
            captchaToken = "0.turnstile-token-value",
        )

        val printed = request.toString()
        assertFalse(printed.contains("hunter2"))
        assertFalse("a captcha token is a bearer credential too", printed.contains("turnstile-token-value"))
        assertTrue("display name is not a secret", printed.contains("Sam"))

        val wire = json.encodeToString(RegisterRequest.serializer(), request)
        assertTrue(wire.contains("hunter2-correct-horse"))
        assertTrue(wire.contains("0.turnstile-token-value"))
    }

    @Test
    fun `token carrying responses hide both tokens`() {
        val response = AuthResponseDto(
            accessToken = "access-token-secret-value",
            refreshToken = "refresh-token-secret-value",
            user = PublicUserDto(id = "u1", email = "a@b.test", displayName = "Sam", createdAt = "2026-01-01"),
        )

        val printed = response.toString()
        assertFalse(printed.contains("access-token-secret-value"))
        assertFalse(printed.contains("refresh-token-secret-value"))
        assertTrue("the user block is safe and useful when debugging", printed.contains("u1"))

        val wire = json.encodeToString(AuthResponseDto.serializer(), response)
        assertTrue(wire.contains("access-token-secret-value"))
        assertTrue(wire.contains("refresh-token-secret-value"))
    }

    @Test
    fun `refresh and logout bodies hide the refresh token`() {
        val refresh = RefreshRequest(refreshToken = "refresh-token-secret-value")
        val logout = LogoutRequest(refreshToken = "refresh-token-secret-value")

        assertFalse(refresh.toString().contains("refresh-token-secret-value"))
        assertFalse(logout.toString().contains("refresh-token-secret-value"))

        assertTrue(
            json.encodeToString(RefreshRequest.serializer(), refresh)
                .contains("refresh-token-secret-value"),
        )
    }

    @Test
    fun `a null secret renders as null rather than a fake length`() {
        // The redaction reports length so a value stays debuggable; an absent
        // token and a present one must not look alike, or "is it even being
        // sent" becomes unanswerable from a log.
        assertTrue(LogoutRequest(refreshToken = null).toString().contains("null"))
    }

    @Test
    fun `the redaction reports length, which is what makes it useful`() {
        val request = LoginRequest(email = "a@b.test", password = "12345678")

        assertEquals(
            "LoginRequest(email=a@b.test, password=***(8 chars))",
            request.toString(),
        )
    }
}
