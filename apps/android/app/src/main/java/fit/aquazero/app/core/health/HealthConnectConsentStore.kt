package fit.aquazero.app.core.health

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.preferencesDataStore
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import java.io.IOException
import javax.inject.Inject
import javax.inject.Named
import javax.inject.Singleton

/** Device-local Health Connect opt-in (`azf_health`). */
private val Context.healthDataStore: DataStore<Preferences> by
    preferencesDataStore(name = "azf_health")

/**
 * Whether the user has connected Health Connect, kept on the device.
 *
 * A second gate on top of the platform's own permissions, and not redundant
 * with them. An Android permission grant is durable and coarse: once given it
 * stays given, and the same grant covers this app reading in the foreground,
 * on a resume, and from any future background job. This flag is the answer to
 * a different question — *does the user still want us doing this* — and it can
 * be withdrawn from the app's own settings without a trip to another app's UI.
 *
 * It is checked before every read, so `disconnect()` stops the reading
 * immediately even though the platform grant survives it.
 *
 * Device-local rather than an account consent because the connection is a
 * property of one handset: the same account on a tablet with no Health Connect
 * has nothing to connect to, and syncing an opt-in to it would be a claim
 * about a device the user never made.
 */
@Singleton
class HealthConnectConsentStore @Inject constructor(
    @param:Named(HEALTH_DATASTORE) private val dataStore: DataStore<Preferences>,
) {

    /**
     * Whether the user has opted in. An unreadable store reads as *not*
     * connected: failing closed is the only safe direction for a gate on
     * health data.
     */
    val connected: Flow<Boolean> = dataStore.data
        .catch { cause -> if (cause is IOException) emit(emptyPreferences()) else throw cause }
        .map { it[Keys.CONNECTED] == true }

    /** One-shot read for the repository, which checks this before every read. */
    suspend fun current(): Boolean = connected.first()

    /** Record the user's choice. */
    suspend fun setConnected(connected: Boolean) {
        dataStore.edit { it[Keys.CONNECTED] = connected }
    }

    private object Keys {
        val CONNECTED = booleanPreferencesKey("connected")
    }
}

/**
 * Qualifier for the health DataStore. The auth module provides an unqualified
 * `DataStore<Preferences>`, so this one must be named or the bindings collide.
 */
const val HEALTH_DATASTORE = "healthDataStore"

/** Provides the health DataStore. */
@Module
@InstallIn(SingletonComponent::class)
object HealthConnectStoreModule {

    @Provides
    @Singleton
    @Named(HEALTH_DATASTORE)
    fun healthDataStore(@ApplicationContext context: Context): DataStore<Preferences> =
        context.healthDataStore
}
