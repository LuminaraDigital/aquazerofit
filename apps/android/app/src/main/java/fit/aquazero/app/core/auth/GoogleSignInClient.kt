package fit.aquazero.app.core.auth

import android.content.Context
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.android.libraries.identity.googleid.GoogleIdTokenParsingException
import com.google.firebase.FirebaseException
import com.google.firebase.FirebaseNetworkException
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseAuthException
import com.google.firebase.auth.GoogleAuthProvider
import fit.aquazero.app.R
import kotlinx.coroutines.tasks.await
import javax.inject.Inject
import javax.inject.Singleton

/** How the device half of "Continue with Google" ended, before the API is asked. */
sealed interface GoogleSignInResult {
    /** A Firebase ID token for the chosen account, ready for `POST /auth/firebase/token`. */
    data class Token(val firebaseIdToken: String, val email: String?) : GoogleSignInResult {
        override fun toString(): String = "Token(firebaseIdToken=***, email=$email)"
    }

    /** The user closed the account picker. Not an error. */
    data object Cancelled : GoogleSignInResult

    /** No Google account on the device, or none the picker could offer. */
    data object NoAccount : GoogleSignInResult

    data object Network : GoogleSignInResult

    /** Anything else. [reason] is a stable code for telemetry, never PII. */
    data class Failed(val reason: String) : GoogleSignInResult
}

/**
 * Credential Manager account picker → Google ID token → Firebase Auth → Firebase ID token.
 *
 * The API verifies Firebase ID tokens (the same path the web app uses), so the
 * Google token is converted here rather than sent as-is. Firebase is signed
 * out again straight away: the API's access/refresh pair is the app's only
 * session, so logout, token-family revocation and the account-switch purge in
 * [SessionManager] keep working unchanged.
 */
@Singleton
class GoogleSignInClient @Inject constructor() {

    /** [activityContext] must be an Activity: the picker is shown over it. */
    suspend fun signIn(activityContext: Context): GoogleSignInResult {
        val firebaseAuth = FirebaseAuth.getInstance()
        return try {
            val option = GetSignInWithGoogleOption
                .Builder(activityContext.getString(R.string.default_web_client_id))
                .build()
            val request = GetCredentialRequest.Builder().addCredentialOption(option).build()
            val credential = CredentialManager.create(activityContext)
                .getCredential(activityContext, request)
                .credential
            if (credential !is CustomCredential ||
                credential.type != GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
            ) {
                return GoogleSignInResult.Failed("unexpected_credential")
            }
            val googleIdToken = GoogleIdTokenCredential.createFrom(credential.data).idToken
            val user = firebaseAuth
                .signInWithCredential(GoogleAuthProvider.getCredential(googleIdToken, null))
                .await()
                .user ?: return GoogleSignInResult.Failed("no_firebase_user")
            val idToken = user.getIdToken(false).await().token
                ?: return GoogleSignInResult.Failed("no_firebase_token")
            GoogleSignInResult.Token(firebaseIdToken = idToken, email = user.email)
        } catch (e: GetCredentialException) {
            googleSignInFailure(e)
        } catch (e: FirebaseException) {
            googleSignInFailure(e)
        } catch (e: GoogleIdTokenParsingException) {
            googleSignInFailure(e)
        } finally {
            firebaseAuth.signOut()
        }
    }
}

/** Classify what the picker or Firebase threw. Pure, so it is unit-tested. */
internal fun googleSignInFailure(e: Exception): GoogleSignInResult = when (e) {
    is GetCredentialCancellationException -> GoogleSignInResult.Cancelled
    is NoCredentialException -> GoogleSignInResult.NoAccount
    is FirebaseNetworkException -> GoogleSignInResult.Network
    is GoogleIdTokenParsingException -> GoogleSignInResult.Failed("token_parse")
    is FirebaseAuthException -> GoogleSignInResult.Failed(e.errorCode)
    is GetCredentialException -> GoogleSignInResult.Failed(e.type)
    else -> GoogleSignInResult.Failed(e.javaClass.simpleName)
}
