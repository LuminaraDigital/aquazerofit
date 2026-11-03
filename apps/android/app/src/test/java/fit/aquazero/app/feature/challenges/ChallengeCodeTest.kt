package fit.aquazero.app.feature.challenges

import fit.aquazero.app.core.data.ChallengesRepository
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Invite codes are typed by hand off a screenshot or a message, so the client
 * normalises them the same way `joinBuddyChallengeSchema` does before deciding
 * whether a round trip is worth making.
 */
class ChallengeCodeTest {

    @Test
    fun `normalising matches the server transform`() {
        assertEquals("AQUA-7K3M2P", ChallengesRepository.normaliseCode("  aqua-7k3m2p  "))
        assertEquals("AQUA-7K3M2P", ChallengesRepository.normaliseCode("AQUA - 7K3M2P"))
        assertEquals("AQUA-7K3M2P", ChallengesRepository.normaliseCode("aqua\t-\n7k3m2p"))
    }

    @Test
    fun `a real code is plausible`() {
        assertTrue(ChallengesRepository.isPlausibleCode("AQUA-7K3M2P"))
        assertTrue(ChallengesRepository.isPlausibleCode("aqua-7k3m2p"))
    }

    @Test
    fun `too short or too long is rejected before the network sees it`() {
        assertFalse(ChallengesRepository.isPlausibleCode(""))
        assertFalse(ChallengesRepository.isPlausibleCode("AQ"))
        assertFalse(ChallengesRepository.isPlausibleCode("   "))
        assertFalse(ChallengesRepository.isPlausibleCode("A".repeat(25)))
    }

    @Test
    fun `the join button follows the same rule as the pre-flight`() {
        val short = ChallengesUiState(joinCode = "AQ")
        val good = ChallengesUiState(joinCode = "AQUA-7K3M2P")
        val busy = ChallengesUiState(joinCode = "AQUA-7K3M2P", joining = true)
        assertFalse(short.canJoin)
        assertTrue(good.canJoin)
        assertFalse("a join already in flight must not be startable twice", busy.canJoin)
    }

    @Test
    fun `the code prefix and member cap mirror the shared constants`() {
        assertEquals("AQUA", ChallengesRepository.CODE_PREFIX)
        assertEquals(4, ChallengesRepository.MAX_MEMBERS)
        assertEquals(7, ChallengesRepository.DEFAULT_TARGET_DAYS)
        assertEquals(14, ChallengesRepository.DEFAULT_DURATION_DAYS)
    }

    @Test
    fun `an empty roster is an empty state, not a failure`() {
        val state = ChallengesUiState(loading = false, challenges = emptyList())
        assertTrue(state.isEmpty)
        assertFalse(state.loadFailed)
    }
}
