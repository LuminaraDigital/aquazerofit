package fit.aquazero.app.core.auth

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.preferencesDataStore
import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

/**
 * The auth DataStore (`azf_auth`). Its file
 * (`files/datastore/azf_auth.preferences_pb`) is excluded from Auto Backup and
 * device transfer — see `backup_rules.xml` / `data_extraction_rules.xml`.
 */
private val Context.authDataStore: DataStore<Preferences> by preferencesDataStore(name = "azf_auth")

/** Auth bindings: Keystore AEAD implementation + the auth DataStore. */
@Module
@InstallIn(SingletonComponent::class)
abstract class AuthModule {

    @Binds
    @Singleton
    abstract fun keystoreAead(impl: AndroidKeystoreAead): KeystoreAead

    companion object {
        @Provides
        @Singleton
        fun authDataStore(@ApplicationContext context: Context): DataStore<Preferences> =
            context.authDataStore
    }
}
