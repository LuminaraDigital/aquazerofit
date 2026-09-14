package fit.aquazero.app.core.navigation

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class DeepLinkStoreTest {

    private val store = DeepLinkStore()

    @Test
    fun parseJoinChallengeIntent_acceptsCodeQuery() {
        val link = store.parseJoinChallengeUri("https://app.aquazero.fit/challenges?code=AQUA1234")
        assertEquals(PendingDeepLink.JoinChallenge("AQUA1234"), link)
    }

    @Test
    fun parseJoinChallengeIntent_acceptsChallengeQuery() {
        val link = store.parseJoinChallengeUri("https://app.aquazero.fit/challenges?challenge=AQUA5678")
        assertEquals(PendingDeepLink.JoinChallenge("AQUA5678"), link)
    }

    @Test
    fun parseJoinChallengeIntent_rejectsInvalidCode() {
        assertNull(store.parseJoinChallengeUri("https://app.aquazero.fit/challenges?code=AQ"))
    }

    // --- origin checks ------------------------------------------------------
    //
    // The manifest's App Link filter constrains scheme and host, but only for
    // IMPLICIT intents. Any installed app can send MainActivity an explicit
    // ACTION_VIEW intent, which never meets that filter — so these cases are
    // the only thing standing between a hostile app and driving navigation
    // here. Deleting them silently reopens that.

    @Test
    fun parseJoinChallengeUri_rejectsForeignScheme() {
        assertNull(store.parseJoinChallengeUri("evil://app.aquazero.fit/challenges?code=AQUA1234"))
        assertNull(store.parseJoinChallengeUri("http://app.aquazero.fit/challenges?code=AQUA1234"))
    }

    @Test
    fun parseJoinChallengeUri_rejectsForeignHost() {
        assertNull(store.parseJoinChallengeUri("https://evil.example/challenges?code=AQUA1234"))
        assertNull(store.parseJoinChallengeUri("https://aquazero.fit.evil.example/challenges?code=AQUA1234"))
    }

    @Test
    fun parseJoinChallengeUri_rejectsUserinfoImpersonatingTheHost() {
        // `https://app.aquazero.fit@evil.example/...` has host `evil.example`;
        // the real origin appears only as userinfo. Matching on the raw string
        // rather than the parsed host is how this one gets through.
        assertNull(
            store.parseJoinChallengeUri("https://app.aquazero.fit@evil.example/challenges?code=AQUA1234"),
        )
    }

    @Test
    fun parseJoinChallengeUri_acceptsMixedCaseOrigin() {
        // Scheme and host are case-insensitive per RFC 3986, and a link that
        // has been through a mail client or a QR round-trip may arrive cased
        // differently from how it was sent.
        val link = store.parseJoinChallengeUri("HTTPS://App.AquaZero.Fit/challenges?code=AQUA1234")
        assertEquals(PendingDeepLink.JoinChallenge("AQUA1234"), link)
    }

    @Test
    fun joinChallengeUrl_producesAnUrlThatParsesBack() {
        // The invite the app hands out must be one the app will accept. These
        // are the same two constants, so this pins them together.
        val url = DeepLinkStore.joinChallengeUrl("aqua1234")
        assertEquals(PendingDeepLink.JoinChallenge("AQUA1234"), store.parseJoinChallengeUri(url))
    }

    @Test
    fun joinChallengeUrl_normalizesCode() {
        assertEquals(
            "https://app.aquazero.fit/challenges?code=AQUA1234",
            DeepLinkStore.joinChallengeUrl("aqua1234"),
        )
    }

    // --- launcher shortcuts -------------------------------------------------
    //
    // These cover `parseShortcutDestination`, not `parseShortcutIntent`:
    // `android.content.Intent` is a throwing stub on the JVM test classpath, so
    // the Intent half (reading the extra, then removing it so a rotation cannot
    // re-navigate) is only reachable from an instrumented test. The
    // normalisation below is the part that shortcuts.xml can actually get
    // wrong, and it is checkable here.

    @Test
    fun parseShortcutDestination_normalisesCaseAndPadding() {
        assertEquals(
            PendingDeepLink.ShortcutDestination("log_weight"),
            store.parseShortcutDestination("  Log_Weight "),
        )
    }

    @Test
    fun parseShortcutDestination_matchesEveryDestinationShortcutsXmlDeclares() {
        // The three values baked into res/xml/shortcuts.xml. If a rename makes
        // one of these stop matching the shell's `when`, the shortcut silently
        // degrades to "opens the default surface" — which is exactly the bug
        // this wiring was added to fix, and it would otherwise be invisible.
        listOf("nutrition", "workouts", "log_weight").forEach { value ->
            assertEquals(
                PendingDeepLink.ShortcutDestination(value),
                store.parseShortcutDestination(value),
            )
        }
    }

    @Test
    fun parseShortcutDestination_ignoresAbsentOrBlankValue() {
        // A launcher intent with no extra at all is the ordinary MAIN launch.
        assertNull(store.parseShortcutDestination(null))
        assertNull(store.parseShortcutDestination("   "))
    }

    @Test
    fun parseShortcutDestination_passesUnknownValueThroughToBeDropped() {
        // Deliberate: an unrecognised name is carried to the shell, whose
        // `when` has no branch for it, so it is consumed and the app opens on
        // the default surface. Rejecting it here would be equivalent; failing
        // on it would not.
        assertEquals(
            PendingDeepLink.ShortcutDestination("destination_from_a_future_build"),
            store.parseShortcutDestination("destination_from_a_future_build"),
        )
    }

    @Test
    fun consume_isOneShot() {
        store.publish(PendingDeepLink.ShortcutDestination("nutrition"))
        assertEquals(PendingDeepLink.ShortcutDestination("nutrition"), store.consume())
        assertNull(store.consume())
        assertNull(store.pending.value)
    }
}
