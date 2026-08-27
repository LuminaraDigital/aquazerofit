package fit.aquazero.app.core.auth

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import java.util.Base64
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.first

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

    /** Decrypt and return the vaulted refresh token, or null when absent/unreadable. */
    suspend fun read(): String? {
        val prefs = dataStore.data.first()
        val ciphertext = prefs[KEY_CIPHERTEXT] ?: return null
        val iv = prefs[KEY_IV] ?: return null
        return runCatching {
            val sealed = SealedBytes(
                ciphertext = Base64.getDecoder().decode(ciphertext),
                iv = Base64.getDecoder().decode(iv),
            )
            String(aead.decrypt(sealed), Charsets.UTF_8)
        }.getOrNull()
    }

    /** Encrypt and persist [refreshToken], replacing any previous value. */
    suspend fun store(refreshToken: String) {
        val sealed = aead.encrypt(refreshToken.toByteArray(Charsets.UTF_8))
        dataStore.edit { prefs ->
            prefs[KEY_CIPHERTEXT] = Base64.getEncoder().encodeToString(sealed.ciphertext)
            prefs[KEY_IV] = Base64.getEncoder().encodeToString(sealed.iv)
        }
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
