package fit.aquazero.app.core.auth

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext
import java.util.Base64
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Persists the refresh token as Keystore-AEAD-encrypted bytes in the auth
 * DataStore (`azf_auth`, excluded from backup). The plaintext token exists
 * only transiently in memory during read/rotate.
 *
 * Rotation is atomic at this layer: [store] writes ciphertext + IV in a
 * single DataStore transaction, and [read] treats any decrypt failure as
 * "no token" (a desynced Keystore key after restore yields a clean
 * signed-out state, not a crash loop).
 */
@Singleton
class RefreshTokenVault @Inject constructor(
    private val dataStore: DataStore<Preferences>,
    private val aead: KeystoreAead,
) {

    /**
     * Decrypt and return the vaulted refresh token, or null when
     * absent/unreadable.
     *
     * On [Dispatchers.IO] because of the crypto, not the file. DataStore
     * already does its own I/O off the main thread, but [KeystoreAead] runs on
     * whatever dispatcher calls it — and `obtainKey()` generates an AES-256 key
     * inside the TEE on first use. This is reached from app start via
     * `AuthRepository.restore()`, on `Dispatchers.Main.immediate`, so without
     * this the first launch after install blocks the main thread on hardware
     * key generation — tens of milliseconds typically, seconds on
     * StrongBox-backed devices.
     */
    suspend fun read(): String? = withContext(Dispatchers.IO) {
        val prefs = dataStore.data.first()
        val ciphertext = prefs[KEY_CIPHERTEXT] ?: return@withContext null
        val iv = prefs[KEY_IV] ?: return@withContext null
        runCatching {
            val sealed = SealedBytes(
                ciphertext = Base64.getDecoder().decode(ciphertext),
                iv = Base64.getDecoder().decode(iv),
            )
            String(aead.decrypt(sealed), Charsets.UTF_8)
        }.getOrNull()
    }

    /**
     * Encrypt and persist [refreshToken], replacing any previous value.
     * Returns whether it was actually stored.
     *
     * Guarded, where it used to throw. [read] has always caught its decrypt —
     * the class doc above promises "a desynced Keystore key after restore
     * yields a clean signed-out state, not a crash loop" — but the encrypt was
     * bare, so the promise only held in one direction. `obtainKey()` raises
     * `ProviderException`, `KeyStoreException` and `UnrecoverableKeyException`,
     * none of which `safeCall` covers, and both call sites run *after*
     * `safeCall` has already returned Success. A device-to-device migration or
     * a flaky StrongBox provisioning therefore crashed on the sign-in tap.
     *
     * Failing here is not harmless and callers should not ignore it lightly:
     * the session keeps working on the access token it already has and then
     * ends silently when that expires, with no refresh token to rotate. That
     * is a bad fifteen minutes, but it is recoverable by signing in again,
     * which a crash on the sign-in button is not.
     */
    suspend fun store(refreshToken: String): Boolean = withContext(Dispatchers.IO) {
        runCatching {
            val sealed = aead.encrypt(refreshToken.toByteArray(Charsets.UTF_8))
            dataStore.edit { prefs ->
                prefs[KEY_CIPHERTEXT] = Base64.getEncoder().encodeToString(sealed.ciphertext)
                prefs[KEY_IV] = Base64.getEncoder().encodeToString(sealed.iv)
            }
        }.isSuccess
    }

    /** Remove the vaulted token (logout / forced logout). */
    suspend fun clear() {
        dataStore.edit { prefs ->
            prefs.remove(KEY_CIPHERTEXT)
            prefs.remove(KEY_IV)
        }
    }

    private companion object {
        val KEY_CIPHERTEXT = stringPreferencesKey("rt_ciphertext")
        val KEY_IV = stringPreferencesKey("rt_iv")
    }
}
