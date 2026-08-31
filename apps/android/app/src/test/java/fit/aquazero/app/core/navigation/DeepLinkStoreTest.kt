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

    @Test
    fun joinChallengeUrl_normalizesCode() {
        assertEquals(
            "https://app.aquazero.fit/challenges?code=AQUA1234",
            DeepLinkStore.joinChallengeUrl("aqua1234"),
        )
    }
}
