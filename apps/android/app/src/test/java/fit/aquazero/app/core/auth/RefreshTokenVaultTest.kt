package fit.aquazero.app.core.auth

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.emptyPreferences
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** In-memory stand-in for the auth DataStore. */
private class FakeDataStore : DataStore<Preferences> {
    private val state = MutableStateFlow<Preferences>(emptyPreferences())

    override val data: Flow<Preferences> = state

    override suspend fun updateData(transform: suspend (t: Preferences) -> Preferences): Preferences {
        val next = transform(state.value)
        state.value = next
        return next
    }
}

/**
 * Deterministic fake AEAD: XOR with a fixed byte plus a synthetic IV, so the
 * vault's encrypt→persist→read→decrypt roundtrip is testable on the JVM
 * without Robolectric or a real Keystore.
 */
private class FakeAead : KeystoreAead {
    override fun encrypt(plaintext: ByteArray): SealedBytes = SealedBytes(
        ciphertext = plaintext.map { (it.toInt() xor 0x5A).toByte() }.toByteArray(),
        iv = ByteArray(12) { it.toByte() },
    )

    override fun decrypt(sealed: SealedBytes): ByteArray {
        check(sealed.iv.size == 12) { "IV lost in persistence" }
        return sealed.ciphertext.map { (it.toInt() xor 0x5A).toByte() }.toByteArray()
    }
}

/** A decrypt-failing AEAD simulating a desynced Keystore key after restore. */
private class BrokenAead : KeystoreAead {
    override fun encrypt(plaintext: ByteArray): SealedBytes = FakeAead().encrypt(plaintext)

    override fun decrypt(sealed: SealedBytes): ByteArray = error("key mismatch")
}

class RefreshTokenVaultTest {

    @Test
    fun `store then read roundtrips the token through ciphertext and iv`() = runTest {
        val vault = RefreshTokenVault(FakeDataStore(), FakeAead())
        vault.store("rt_secret.token-123")
        assertEquals("rt_secret.token-123", vault.read())
    }

    @Test
    fun `store replaces the previous token atomically`() = runTest {
        val vault = RefreshTokenVault(FakeDataStore(), FakeAead())
        vault.store("first")
        vault.store("second")
        assertEquals("second", vault.read())
    }

    @Test
    fun `read returns null when nothing stored`() = runTest {
        val vault = RefreshTokenVault(FakeDataStore(), FakeAead())
        assertNull(vault.read())
    }

    @Test
    fun `clear removes the token`() = runTest {
        val vault = RefreshTokenVault(FakeDataStore(), FakeAead())
        vault.store("doomed")
        vault.clear()
        assertNull(vault.read())
    }

    @Test
    fun `decrypt failure reads as signed-out, not a crash`() = runTest {
        val dataStore = FakeDataStore()
        RefreshTokenVault(dataStore, FakeAead()).store("token")
        // Same persisted bytes, but the key no longer matches (device restore).
        val vault = RefreshTokenVault(dataStore, BrokenAead())
        assertNull(vault.read())
    }
}
