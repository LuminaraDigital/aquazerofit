package fit.aquazero.app.core.auth

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.inject.Inject
import javax.inject.Singleton

/** Ciphertext plus the IV it was sealed with. */
data class SealedBytes(
    val ciphertext: ByteArray,
    val iv: ByteArray,
) {
    override fun equals(other: Any?): Boolean =
        other is SealedBytes &&
            ciphertext.contentEquals(other.ciphertext) &&
            iv.contentEquals(other.iv)

    override fun hashCode(): Int = 31 * ciphertext.contentHashCode() + iv.contentHashCode()
}

/**
 * AEAD abstraction over the refresh-token encryption. Interface-first so unit
 * tests can substitute a fake without Robolectric; production binds
 * [AndroidKeystoreAead].
 */
interface KeystoreAead {
    /** Seal [plaintext] with the app's device-bound key. */
    fun encrypt(plaintext: ByteArray): SealedBytes

    /** Open [sealed]; throws on tamper or key mismatch. */
    fun decrypt(sealed: SealedBytes): ByteArray
}

/**
 * AES/GCM via the Android Keystore. The key (alias `azf_rt_key`) is generated
 * on first use, never leaves secure hardware, and is not backed up — which is
 * why the DataStore file holding the ciphertext is excluded from backup too.
 */
@Singleton
class AndroidKeystoreAead @Inject constructor() : KeystoreAead {

    private fun obtainKey(): SecretKey {
        val keyStore = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return generator.generateKey()
    }

    override fun encrypt(plaintext: ByteArray): SealedBytes {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, obtainKey())
        return SealedBytes(ciphertext = cipher.doFinal(plaintext), iv = cipher.iv)
    }

    override fun decrypt(sealed: SealedBytes): ByteArray {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(
            Cipher.DECRYPT_MODE,
            obtainKey(),
            GCMParameterSpec(GCM_TAG_BITS, sealed.iv),
        )
        return cipher.doFinal(sealed.ciphertext)
    }

    private companion object {
        const val KEYSTORE = "AndroidKeyStore"
        const val KEY_ALIAS = "azf_rt_key"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val GCM_TAG_BITS = 128
    }
}
