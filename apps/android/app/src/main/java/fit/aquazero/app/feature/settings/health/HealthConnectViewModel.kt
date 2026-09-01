package fit.aquazero.app.feature.settings.health

import android.content.Intent
import androidx.activity.result.contract.ActivityResultContract
import androidx.annotation.StringRes
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import fit.aquazero.app.R
import fit.aquazero.app.core.health.HealthConnectAvailability
import fit.aquazero.app.core.health.HealthConnectRepository
import fit.aquazero.app.core.health.HealthDaySnapshot
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Immutable state of the Health Connect card. */
data class HealthConnectUiState(
    val loading: Boolean = true,
    val availability: HealthConnectAvailability = HealthConnectAvailability.SDK_UNAVAILABLE,
    val permissionsGranted: Boolean = false,
    val connected: Boolean = false,
    val snapshot: HealthDaySnapshot = HealthDaySnapshot.EMPTY,
    val busy: Boolean = false,
    /** Last outcome worth saying out loud; cleared on the next refresh. */
    @param:StringRes val messageRes: Int? = null,
) {

    /** True when there is something on this device to connect to. */
    val available: Boolean get() = availability == HealthConnectAvailability.AVAILABLE

    /** True when figures should be shown at all. */
    val showingFigures: Boolean get() = available && connected && permissionsGranted

    /**
     * Connected in this app, but the platform has since taken a permission
     * away. Distinct from "not connected": the fix is Health Connect's own
     * settings, and offering the Connect button again would re-open a sheet
     * the user has already answered.
     */
    val permissionsLapsed: Boolean get() = available && connected && !permissionsGranted
}

/** One-shot effects the composable has to carry out with an Activity in hand. */
sealed interface HealthConnectEvent {

    /** Show the platform's permission sheet for [permissions]. */
    data class RequestPermissions(val permissions: Set<String>) : HealthConnectEvent

    /** Send the user to the Play listing for the Health Connect app. */
    data object OpenProviderInstall : HealthConnectEvent

    /** Send the user to Health Connect's own settings. */
    data object OpenProviderSettings : HealthConnectEvent
}

/**
 * The Health Connect card's state machine.
 *
 * Reads nothing on construction. [refresh] asks only for availability and
 * whether the permissions are held — both cheap, neither of them health data —
 * and a figure is fetched only once the user has connected. That ordering is
 * the consent gate, and it is the same one Settings applies elsewhere: the
 * reminder screen does not schedule anything before the consent bit is on, and
 * this does not read a heartbeat before the connection is.
 *
 * Nothing in this class is logged. Not the figures, not their absence, not the
 * availability state — see `core/health/HealthCall.kt`.
 */
@HiltViewModel
class HealthConnectViewModel @Inject constructor(
    private val repository: HealthConnectRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(HealthConnectUiState())
    val uiState: StateFlow<HealthConnectUiState> = _uiState.asStateFlow()

    private val _events = Channel<HealthConnectEvent>(Channel.BUFFERED)
    val events: Flow<HealthConnectEvent> = _events.receiveAsFlow()

    init {
        refresh()
    }

    /**
     * Re-read every gate and, if they are open, today's figures.
     *
     * Called on each resume rather than once, because all three inputs change
     * outside this app: Health Connect can be installed, updated, or have a
     * permission revoked while this screen sits in the background.
     */
    fun refresh() {
        viewModelScope.launch {
            val status = repository.status()
            _uiState.value = _uiState.value.copy(
                loading = false,
                availability = status.availability,
                permissionsGranted = status.permissionsGranted,
                connected = status.connected,
                messageRes = null,
            )
            loadSnapshot()
        }
    }

    /**
     * The Connect button.
     *
     * Routes to the store when there is nothing installed to permit, and to
     * the permission sheet otherwise. Nothing is recorded as connected here —
     * that waits for [onPermissionsResult], because the user has not consented
     * to anything until the sheet says so.
     */
    fun connect() {
        viewModelScope.launch {
            val event = when (_uiState.value.availability) {
                HealthConnectAvailability.AVAILABLE ->
                    HealthConnectEvent.RequestPermissions(repository.permissions)
                // Both remaining states are fixed in the same place: the store
                // listing installs it, and updates it if it is already there.
                HealthConnectAvailability.SDK_UNAVAILABLE,
                HealthConnectAvailability.UPDATE_REQUIRED,
                -> HealthConnectEvent.OpenProviderInstall
            }
            _events.send(event)
        }
    }

    /**
     * The permission sheet closed.
     *
     * Its result is not read: the repository re-asks the platform what is
     * actually granted, because a sheet can be dismissed, partially approved,
     * or answered for a subset, and only the platform's own answer decides
     * whether this app may read anything.
     */
    fun onPermissionsResult() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(busy = true)
            val connected = repository.connect()
            _uiState.value = _uiState.value.copy(
                busy = false,
                connected = connected,
                permissionsGranted = connected,
                messageRes = if (connected) {
                    R.string.health_connected_message
                } else {
                    R.string.health_permissions_denied
                },
            )
            loadSnapshot()
        }
    }

    /** The Disconnect button: stop reading now, and drop what is on screen. */
    fun disconnect() {
        viewModelScope.launch {
            repository.disconnect()
            _uiState.value = _uiState.value.copy(
                connected = false,
                snapshot = HealthDaySnapshot.EMPTY,
                messageRes = R.string.health_disconnected_message,
            )
        }
    }

    /** Open Health Connect's own settings, where the grant itself lives. */
    fun openProviderSettings() {
        viewModelScope.launch { _events.send(HealthConnectEvent.OpenProviderSettings) }
    }

    /**
     * The platform's permission contract, for the card's launcher.
     *
     * Surfaced through the ViewModel rather than injecting the repository into
     * the composable, so that the only Health Connect type any UI file sees is
     * an `ActivityResultContract<Set<String>, Set<String>>` — no
     * `androidx.health.*` import above this layer.
     */
    fun permissionContract(): ActivityResultContract<Set<String>, Set<String>> =
        repository.permissionRequestContract()

    /** The Play listing for the Health Connect app. */
    fun providerInstallIntent(): Intent = repository.providerInstallIntent()

    /** Health Connect's own settings screen. */
    fun providerSettingsIntent(): Intent = repository.settingsIntent()

    /**
     * Fetch the day's figures, or clear them.
     *
     * The repository refuses the read itself when a gate is closed, so the
     * clearing is not defensive duplication — it is what removes a figure
     * already drawn on screen when the permission behind it has just gone.
     */
    private suspend fun loadSnapshot() {
        val snapshot = repository.todaySnapshot()
        _uiState.value = _uiState.value.copy(snapshot = snapshot)
    }
}
