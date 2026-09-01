package fit.aquazero.app.feature.settings

import androidx.annotation.StringRes
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import fit.aquazero.app.R
import fit.aquazero.app.core.data.AccountRepository
import fit.aquazero.app.core.database.ConsentEntity
import fit.aquazero.app.core.model.ApiResult
import fit.aquazero.app.core.ui.reminders.ReminderNotifier
import fit.aquazero.app.core.ui.reminders.ReminderPrefs
import fit.aquazero.app.core.ui.reminders.ReminderPrefsStore
import fit.aquazero.app.core.ui.reminders.ReminderScheduler
import fit.aquazero.app.core.ui.reminders.TimeOfDay
import fit.aquazero.app.core.ui.reminders.WaterFrequency
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch
import java.time.DayOfWeek
import javax.inject.Inject

/** Where the POST_NOTIFICATIONS permission stands. */
enum class NotificationPermissionState {
    /** Granted (or implicitly held below API 33) and delivery is enabled. */
    GRANTED,

    /** Not granted yet — a runtime prompt is worth showing. */
    DENIED,

    /**
     * Granted at the OS level but the user has switched notifications off for
     * the app, so a prompt would do nothing and only system settings can fix it.
     */
    BLOCKED,
}

/** Immutable state of the reminders screen. */
data class NotificationSettingsUiState(
    val loading: Boolean = true,
    val prefs: ReminderPrefs = ReminderPrefs(),
    /**
     * The whole cached consent row. All four bits are kept because
     * `PUT /me/consents` takes the complete object — sending a partial would
     * blank the three this screen does not own.
     */
    val consents: ConsentEntity? = null,
    val savingConsent: Boolean = false,
    val permission: NotificationPermissionState = NotificationPermissionState.DENIED,
) {
    /** The account-level `reminders` consent bit — the master switch. */
    val remindersConsented: Boolean get() = consents?.reminders == true

    /** True when a reminder could actually be delivered right now. */
    val canDeliver: Boolean
        get() = remindersConsented && permission == NotificationPermissionState.GRANTED

    /** The per-type controls only do anything once both gates are open. */
    val granularEnabled: Boolean get() = canDeliver
}

/** One-shot effects. */
sealed interface NotificationSettingsEvent {
    data class Message(@param:StringRes val messageRes: Int, val isError: Boolean = false) :
        NotificationSettingsEvent

    /** Ask Android for POST_NOTIFICATIONS. */
    data object RequestPermission : NotificationSettingsEvent

    /** Send the user to the app's system notification settings. */
    data object OpenSystemSettings : NotificationSettingsEvent
}

/**
 * Real local reminders, gated on two independent switches.
 *
 * The web client stores these preferences in `localStorage` and delivers
 * nothing — its own banner admits it. Here the choices drive WorkManager, and
 * the two gates are honoured for real: the account-level `reminders` consent,
 * and the POST_NOTIFICATIONS runtime permission. Either one closed cancels the
 * scheduled work outright rather than merely dimming the controls, and the
 * worker re-checks both again before it posts anything.
 *
 * Nothing here talks to a server: there is no push infrastructure in this
 * product, and the copy says the reminders are local rather than implying a
 * service that does not exist.
 */
@HiltViewModel
class NotificationSettingsViewModel @Inject constructor(
    private val accountRepository: AccountRepository,
    private val prefsStore: ReminderPrefsStore,
    private val scheduler: ReminderScheduler,
    private val notifier: ReminderNotifier,
) : ViewModel() {

    private val _uiState = MutableStateFlow(NotificationSettingsUiState())
    val uiState: StateFlow<NotificationSettingsUiState> = _uiState.asStateFlow()

    private val _events = Channel<NotificationSettingsEvent>(Channel.BUFFERED)
    val events: Flow<NotificationSettingsEvent> = _events.receiveAsFlow()

    init {
        viewModelScope.launch {
            prefsStore.prefs.collect { prefs ->
                _uiState.value = _uiState.value.copy(prefs = prefs, loading = false)
            }
        }
        viewModelScope.launch {
            accountRepository.consents().collect { consents ->
                _uiState.value = _uiState.value.copy(consents = consents)
            }
        }
        viewModelScope.launch { accountRepository.refreshConsents() }
        refreshPermission()
    }

    /**
     * Re-read the permission. Called on every resume: someone can revoke it in
     * system settings while the app is in the background, and a screen that
     * still claims reminders are on would be lying.
     */
    fun refreshPermission() {
        val state = when {
            !notifier.hasPermission() -> NotificationPermissionState.DENIED
            !notifier.canPostNotifications() -> NotificationPermissionState.BLOCKED
            else -> NotificationPermissionState.GRANTED
        }
        _uiState.value = _uiState.value.copy(permission = state)
        resync()
    }

    /** The screen asks Android, or sends the user to settings if asking is futile. */
    fun requestPermission() {
        viewModelScope.launch {
            val event = if (_uiState.value.permission == NotificationPermissionState.BLOCKED) {
                NotificationSettingsEvent.OpenSystemSettings
            } else {
                NotificationSettingsEvent.RequestPermission
            }
            _events.send(event)
        }
    }

    /** Result of the runtime prompt. Denial is a normal outcome, not an error. */
    fun onPermissionResult(granted: Boolean) {
        refreshPermission()
        if (!granted) {
            emit(R.string.reminders_permission_denied)
        }
    }

    // ----- master switch (the account consent) -----

    /** Flip the `reminders` consent, then bring the schedule in line with it. */
    fun setMaster(enabled: Boolean) {
        val consents = _uiState.value.consents ?: return
        _uiState.value = _uiState.value.copy(savingConsent = true)
        viewModelScope.launch {
            val result = accountRepository.saveConsents(
                ConsentUpdates.with(consents, ConsentKey.REMINDERS, enabled),
            )
            _uiState.value = _uiState.value.copy(savingConsent = false)
            when (result) {
                is ApiResult.Success -> {
                    resync()
                    emit(
                        if (result.data.reminders) {
                            R.string.reminders_enabled_toast
                        } else {
                            R.string.reminders_disabled_toast
                        },
                    )
                    // Asking for the permission only makes sense once someone
                    // has said they want reminders at all.
                    if (result.data.reminders &&
                        _uiState.value.permission == NotificationPermissionState.DENIED
                    ) {
                        _events.send(NotificationSettingsEvent.RequestPermission)
                    }
                }
                is ApiResult.Failure -> emit(R.string.reminders_consent_failed, isError = true)
            }
        }
    }

    // ----- per-type preferences -----

    fun setMealsEnabled(enabled: Boolean) = update { it.copy(mealsEnabled = enabled) }

    fun setMealsTime(time: TimeOfDay) = update { it.copy(mealsTime = time) }

    fun setWaterEnabled(enabled: Boolean) = update { it.copy(waterEnabled = enabled) }

    fun setWaterFrequency(frequency: WaterFrequency) =
        update { it.copy(waterFrequency = frequency) }

    fun setWorkoutEnabled(enabled: Boolean) = update { it.copy(workoutEnabled = enabled) }

    fun setWorkoutTime(time: TimeOfDay) = update { it.copy(workoutTime = time) }

    fun setWeighInEnabled(enabled: Boolean) = update { it.copy(weighInEnabled = enabled) }

    fun setWeighInDay(day: DayOfWeek) = update { it.copy(weighInDay = day) }

    fun setWeighInTime(time: TimeOfDay) = update { it.copy(weighInTime = time) }

    private fun update(transform: (ReminderPrefs) -> ReminderPrefs) {
        viewModelScope.launch {
            val next = prefsStore.update(transform)
            scheduler.sync(
                prefs = next,
                remindersConsented = _uiState.value.remindersConsented,
                canPostNotifications = _uiState.value.permission ==
                    NotificationPermissionState.GRANTED,
            )
        }
    }

    /** Re-apply the current gates to the schedule. */
    private fun resync() {
        viewModelScope.launch {
            scheduler.sync(
                prefs = prefsStore.current(),
                remindersConsented = _uiState.value.remindersConsented,
                canPostNotifications = _uiState.value.permission ==
                    NotificationPermissionState.GRANTED,
            )
        }
    }

    private fun emit(@StringRes messageRes: Int, isError: Boolean = false) {
        viewModelScope.launch {
            _events.send(NotificationSettingsEvent.Message(messageRes, isError))
        }
    }
}
