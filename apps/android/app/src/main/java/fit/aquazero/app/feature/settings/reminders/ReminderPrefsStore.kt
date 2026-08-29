package fit.aquazero.app.feature.settings.reminders

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.MutablePreferences
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
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
import java.time.DayOfWeek
import javax.inject.Inject
import javax.inject.Named
import javax.inject.Singleton

/** Device-local reminder preferences (`azf_reminders`). */
private val Context.reminderDataStore: DataStore<Preferences> by
    preferencesDataStore(name = "azf_reminders")

/**
 * Per-type reminder choices, stored on the device.
 *
 * Deliberately device-local: a reminder time is a property of the handset a
 * person carries, and the API has no route for it. The one account-level piece
 * is the `reminders` consent bit, which lives with the other three consents.
 */
@Singleton
class ReminderPrefsStore @Inject constructor(
    @Named(REMINDER_DATASTORE) private val dataStore: DataStore<Preferences>,
) {

    /** Current preferences; a corrupt or unreadable store falls back to defaults. */
    val prefs: Flow<ReminderPrefs> = dataStore.data
        .catch { cause -> if (cause is IOException) emit(emptyPreferences()) else throw cause }
        .map { it.toPrefs() }

    /** One-shot read for the worker, which has no lifecycle to collect on. */
    suspend fun current(): ReminderPrefs = prefs.first()

    /** Apply a change and return the result, so callers can reschedule from it. */
    suspend fun update(transform: (ReminderPrefs) -> ReminderPrefs): ReminderPrefs {
        val next = transform(current())
        dataStore.edit { it.write(next) }
        return next
    }

    private fun Preferences.toPrefs(): ReminderPrefs {
        val defaults = ReminderPrefs()
        return ReminderPrefs(
            mealsEnabled = this[Keys.MEALS_ENABLED] ?: defaults.mealsEnabled,
            mealsTime = TimeOfDay.parse(this[Keys.MEALS_TIME], defaults.mealsTime),
            waterEnabled = this[Keys.WATER_ENABLED] ?: defaults.waterEnabled,
            waterFrequency = this[Keys.WATER_FREQUENCY]
                ?.let(WaterFrequency::fromHours) ?: defaults.waterFrequency,
            workoutEnabled = this[Keys.WORKOUT_ENABLED] ?: defaults.workoutEnabled,
            workoutTime = TimeOfDay.parse(this[Keys.WORKOUT_TIME], defaults.workoutTime),
            weighInEnabled = this[Keys.WEIGH_IN_ENABLED] ?: defaults.weighInEnabled,
            weighInDay = this[Keys.WEIGH_IN_DAY]?.let { parseDay(it) } ?: defaults.weighInDay,
            weighInTime = TimeOfDay.parse(this[Keys.WEIGH_IN_TIME], defaults.weighInTime),
        )
    }

    private fun parseDay(value: String): DayOfWeek? =
        runCatching { DayOfWeek.valueOf(value) }.getOrNull()

    private fun MutablePreferences.write(prefs: ReminderPrefs) {
        this[Keys.MEALS_ENABLED] = prefs.mealsEnabled
        this[Keys.MEALS_TIME] = prefs.mealsTime.toIso()
        this[Keys.WATER_ENABLED] = prefs.waterEnabled
        this[Keys.WATER_FREQUENCY] = prefs.waterFrequency.hours
        this[Keys.WORKOUT_ENABLED] = prefs.workoutEnabled
        this[Keys.WORKOUT_TIME] = prefs.workoutTime.toIso()
        this[Keys.WEIGH_IN_ENABLED] = prefs.weighInEnabled
        this[Keys.WEIGH_IN_DAY] = prefs.weighInDay.name
        this[Keys.WEIGH_IN_TIME] = prefs.weighInTime.toIso()
    }

    private object Keys {
        val MEALS_ENABLED = booleanPreferencesKey("meals_enabled")
        val MEALS_TIME = stringPreferencesKey("meals_time")
        val WATER_ENABLED = booleanPreferencesKey("water_enabled")
        val WATER_FREQUENCY = intPreferencesKey("water_frequency_hours")
        val WORKOUT_ENABLED = booleanPreferencesKey("workout_enabled")
        val WORKOUT_TIME = stringPreferencesKey("workout_time")
        val WEIGH_IN_ENABLED = booleanPreferencesKey("weigh_in_enabled")
        val WEIGH_IN_DAY = stringPreferencesKey("weigh_in_day")
        val WEIGH_IN_TIME = stringPreferencesKey("weigh_in_time")
    }
}

/**
 * Qualifier for the reminder DataStore. The auth module already provides an
 * unqualified `DataStore<Preferences>`, so this one must be named or the two
 * bindings collide.
 */
const val REMINDER_DATASTORE = "remindersDataStore"

/** Provides the reminder DataStore. */
@Module
@InstallIn(SingletonComponent::class)
object ReminderPrefsModule {

    @Provides
    @Singleton
    @Named(REMINDER_DATASTORE)
    fun reminderDataStore(@ApplicationContext context: Context): DataStore<Preferences> =
        context.reminderDataStore
}
