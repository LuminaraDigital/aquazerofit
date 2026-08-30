package fit.aquazero.app.feature.settings

import androidx.annotation.StringRes
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import fit.aquazero.app.R
import fit.aquazero.app.core.data.AccountRepository
import fit.aquazero.app.core.data.AuthRepository
import fit.aquazero.app.core.database.ConsentEntity
import fit.aquazero.app.core.model.Allergen
import fit.aquazero.app.core.model.ApiResult
import fit.aquazero.app.core.model.AzfJson
import fit.aquazero.app.core.model.DietaryPreference
import fit.aquazero.app.core.model.ProfileInputDto
import fit.aquazero.app.core.model.UnitPreference
import fit.aquazero.app.core.model.WellnessProfileDto
import fit.aquazero.app.core.sync.ConnectivityMonitor
import fit.aquazero.app.core.sync.OutboxDrainCoordinator
import fit.aquazero.app.core.ui.reminders.ReminderPrefsStore
import fit.aquazero.app.core.ui.reminders.ReminderScheduler
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Which of the four consent bits a toggle is addressing. */
enum class ConsentKey { WELLNESS, AI_PERSONALISATION, ANALYTICS, REMINDERS }

/** Modal confirmations Settings can raise. All of them are destructive. */
sealed interface SettingsDialog {
    /** First step: schedule deletion and start the grace period. */
    data object RequestDeletion : SettingsDialog

    /** Second step: skip the grace period and erase immediately. */
    data object PurgeNow : SettingsDialog

    /** Signing out with entries the outbox has not managed to send yet. */
    data class SignOutWithPending(val pending: Int) : SettingsDialog
}

/** Immutable state of the settings screen. */
data class SettingsUiState(
    val loading: Boolean = true,
    val email: String = "",
    val displayName: String = "",
    val memberSince: String = "",
    val editingName: Boolean = false,
    val nameDraft: String = "",
    val savingName: Boolean = false,
    val profile: WellnessProfileDto? = null,
    /** True when the profile call failed — scoped to its own section, not the page. */
    val profileUnavailable: Boolean = false,
    val savingProfile: Boolean = false,
    val consents: ConsentEntity? = null,
    val savingConsent: ConsentKey? = null,
    val exporting: Boolean = false,
    val dialog: SettingsDialog? = null,
    val deleting: Boolean = false,
    /** Set once deletion has been requested in this session. */
    val deletionRequestedAt: String? = null,
    val pendingOutbox: Int = 0,
    /** True while a logout drain or final sign-out is in flight. */
    val signingOut: Boolean = false,
) {
    /** False while a profile write is in flight, so a second tap cannot race it. */
    val profileEditable: Boolean get() = profile != null && !savingProfile
}

/** One-shot effects. */
sealed interface SettingsEvent {
    data class Message(@param:StringRes val messageRes: Int, val isError: Boolean = false) : SettingsEvent

    /** The export bundle is ready; the screen hands it to the share sheet. */
    data class ShareExport(val json: String) : SettingsEvent

    /** Session is over — the shell drops back to the pre-auth graph on its own. */
    data object SignedOut : SettingsEvent
}

/**
 * Profile and settings — and, for Play purposes, a compliance surface.
 *
 * Three obligations land here and are treated as behaviour rather than layout:
 * the four granular consents genuinely gate what the app does (turning
 * `reminders` off cancels the scheduled work and clears the shade; turning
 * `aiPersonalisation` off makes the memory routes refuse); account deletion is
 * reachable in two taps rather than buried; and the AGPL §13 source link is
 * present in the running app.
 */
@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val accountRepository: AccountRepository,
    private val authRepository: AuthRepository,
    private val reminderPrefsStore: ReminderPrefsStore,
    private val reminderScheduler: ReminderScheduler,
    private val connectivityMonitor: ConnectivityMonitor,
    private val outboxDrainCoordinator: OutboxDrainCoordinator,
) : ViewModel() {

    private val _uiState = MutableStateFlow(SettingsUiState())
    val uiState: StateFlow<SettingsUiState> = _uiState.asStateFlow()

    private val _events = Channel<SettingsEvent>(Channel.BUFFERED)
    val events: Flow<SettingsEvent> = _events.receiveAsFlow()

    init {
        observeUser()
        observeProfile()
        observeConsents()
        observeOutbox()
        refresh()
    }

    private fun observeUser() = viewModelScope.launch {
        accountRepository.user().collect { user ->
            _uiState.value = _uiState.value.copy(
                email = user?.email.orEmpty(),
                displayName = user?.displayName?.ifBlank { null }
                    ?: user?.email?.substringBefore('@').orEmpty(),
                memberSince = user?.createdAt.orEmpty(),
            )
        }
    }

    private fun observeProfile() = viewModelScope.launch {
        accountRepository.profile().collect { entity ->
            val decoded = entity?.docJson?.let { json ->
                runCatching {
                    AzfJson.decodeFromString(WellnessProfileDto.serializer(), json)
                }.getOrNull()
            }
            _uiState.value = _uiState.value.copy(profile = decoded)
        }
    }

    private fun observeConsents() = viewModelScope.launch {
        accountRepository.consents().collect { consents ->
            _uiState.value = _uiState.value.copy(consents = consents)
        }
    }

    private fun observeOutbox() = viewModelScope.launch {
        authRepository.pendingOutboxCount.collect { count ->
            _uiState.value = _uiState.value.copy(pendingOutbox = count)
        }
    }

    /** Pull everything the screen renders; safe to call again from a retry. */
    fun refresh() = viewModelScope.launch {
        accountRepository.refreshMe()
        val profile = accountRepository.refreshProfile()
        accountRepository.refreshConsents()
        _uiState.value = _uiState.value.copy(
            loading = false,
            profileUnavailable = profile is ApiResult.Failure,
        )
    }

    // ----- identity -----

    fun startEditingName() {
        _uiState.value = _uiState.value.copy(
            editingName = true,
            nameDraft = _uiState.value.displayName,
        )
    }

    fun onNameDraftChange(value: String) {
        _uiState.value = _uiState.value.copy(nameDraft = value.take(MAX_NAME_LENGTH))
    }

    fun cancelEditingName() {
        _uiState.value = _uiState.value.copy(editingName = false, nameDraft = "")
    }

    fun saveName() {
        val trimmed = _uiState.value.nameDraft.trim()
        if (trimmed.isEmpty() || trimmed.length > MAX_NAME_LENGTH) {
            emit(R.string.settings_name_invalid, isError = true)
            return
        }
        _uiState.value = _uiState.value.copy(savingName = true)
        viewModelScope.launch {
            val result = accountRepository.updateDisplayName(trimmed)
            _uiState.value = _uiState.value.copy(
                savingName = false,
                editingName = result is ApiResult.Failure,
            )
            emit(
                if (result is ApiResult.Success) {
                    R.string.settings_name_updated
                } else {
                    R.string.settings_name_failed
                },
                isError = result is ApiResult.Failure,
            )
        }
    }

    // ----- preferences that live on the profile -----

    /** Switch the display unit. Stored weights stay canonical kilograms. */
    fun setUnitPreference(unit: UnitPreference) {
        saveProfilePatch { it.copy(unitPreference = unit) }
    }

    /** Add or remove a dietary preference. */
    fun toggleDietaryPreference(preference: DietaryPreference) {
        saveProfilePatch { input ->
            val next = if (preference in input.dietaryPreferences) {
                input.dietaryPreferences - preference
            } else {
                input.dietaryPreferences + preference
            }
            input.copy(dietaryPreferences = next)
        }
    }

    /**
     * Add or remove a declared allergy. These are excluded deterministically
     * from every suggestion server-side — this is the control that does it.
     */
    fun toggleAllergy(allergen: Allergen) {
        saveProfilePatch { input ->
            val next = if (allergen in input.allergies) {
                input.allergies - allergen
            } else {
                input.allergies + allergen
            }
            input.copy(allergies = next)
        }
    }

    /**
     * `PUT /me/profile` takes the whole document, so a patch is always applied
     * to the current profile and sent in full — never a partial that would
     * blank the fields it omits.
     */
    private fun saveProfilePatch(patch: (ProfileInputDto) -> ProfileInputDto) {
        val profile = _uiState.value.profile ?: return
        _uiState.value = _uiState.value.copy(savingProfile = true)
        viewModelScope.launch {
            val result = accountRepository.saveProfile(patch(profile.toInput()))
            _uiState.value = _uiState.value.copy(savingProfile = false)
            emit(
                if (result is ApiResult.Success) {
                    R.string.settings_profile_updated
                } else {
                    R.string.settings_profile_save_failed
                },
                isError = result is ApiResult.Failure,
            )
        }
    }

    // ----- consents -----

    /**
     * Flip one consent bit. The route takes all four, so the current state is
     * sent with this one overridden.
     *
     * Turning `reminders` off does not merely grey out the notification screen:
     * it cancels the scheduled work and clears anything already in the shade,
     * here and in the worker's own pre-flight check.
     */
    fun setConsent(key: ConsentKey, value: Boolean) {
        val current = _uiState.value.consents ?: return
        _uiState.value = _uiState.value.copy(savingConsent = key)
        viewModelScope.launch {
            val result = accountRepository.saveConsents(
                ConsentUpdates.with(current, key, value),
            )
            _uiState.value = _uiState.value.copy(savingConsent = null)
            if (result is ApiResult.Success) {
                reminderScheduler.sync(
                    prefs = reminderPrefsStore.current(),
                    remindersConsented = result.data.reminders,
                )
            }
            emit(
                if (result is ApiResult.Success) {
                    R.string.settings_consent_updated
                } else {
                    R.string.settings_consent_failed
                },
                isError = result is ApiResult.Failure,
            )
        }
    }

    // ----- data export -----

    /** Fetch the account bundle and hand it to the share sheet. */
    fun exportData() {
        if (_uiState.value.exporting) return
        _uiState.value = _uiState.value.copy(exporting = true)
        viewModelScope.launch {
            when (val result = accountRepository.exportDiary()) {
                is ApiResult.Success -> {
                    _uiState.value = _uiState.value.copy(exporting = false)
                    _events.send(SettingsEvent.ShareExport(result.data))
                }
                is ApiResult.Failure -> {
                    _uiState.value = _uiState.value.copy(exporting = false)
                    emit(R.string.settings_export_failed, isError = true)
                }
            }
        }
    }

    // ----- account deletion -----

    fun showDialog(dialog: SettingsDialog) {
        _uiState.value = _uiState.value.copy(dialog = dialog)
    }

    fun dismissDialog() {
        _uiState.value = _uiState.value.copy(dialog = null)
    }

    /**
     * Run one step of deletion.
     *
     * The route is genuinely two-step: the first `DELETE /me` flags the account
     * and starts the grace period, and a second call while flagged erases
     * immediately. The session is deliberately kept alive after step one so
     * step two is reachable — and so the person can see, and change their mind
     * about, what they just scheduled.
     */
    fun confirmDeletion() {
        if (_uiState.value.deleting) return
        _uiState.value = _uiState.value.copy(deleting = true)
        viewModelScope.launch {
            when (val result = accountRepository.requestDeletion()) {
                is ApiResult.Failure -> {
                    _uiState.value = _uiState.value.copy(deleting = false, dialog = null)
                    emit(R.string.settings_delete_failed, isError = true)
                }
                is ApiResult.Success -> {
                    if (result.data.purged) {
                        reminderScheduler.cancelAll()
                        _uiState.value = _uiState.value.copy(deleting = false, dialog = null)
                        emit(R.string.settings_delete_purged)
                        authRepository.logout()
                        _events.send(SettingsEvent.SignedOut)
                    } else {
                        _uiState.value = _uiState.value.copy(
                            deleting = false,
                            dialog = null,
                            deletionRequestedAt = result.data.deletionRequestedAt,
                        )
                        emit(R.string.settings_delete_requested)
                    }
                }
            }
        }
    }

    // ----- session -----

    /**
     * Sign out. When the outbox still holds unsynced entries the flow is:
     * 1. online → drain with visible progress, then sign out if empty;
     * 2. still pending or offline → confirm abandonment (plan §4.2).
     */
    fun signOut(force: Boolean = false) {
        if (_uiState.value.signingOut) return
        if (force) {
            viewModelScope.launch { finishSignOut() }
            return
        }
        val pending = _uiState.value.pendingOutbox
        if (pending == 0) {
            viewModelScope.launch { finishSignOut() }
            return
        }
        if (!connectivityMonitor.currentlyOnline()) {
            showDialog(SettingsDialog.SignOutWithPending(pending))
            return
        }
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(signingOut = true)
            val remaining = outboxDrainCoordinator.drainForLogout()
            if (remaining == 0) {
                finishSignOut()
            } else {
                _uiState.value = _uiState.value.copy(signingOut = false)
                showDialog(SettingsDialog.SignOutWithPending(remaining))
            }
        }
    }

    private suspend fun finishSignOut() {
        _uiState.value = _uiState.value.copy(signingOut = true)
        reminderScheduler.cancelAll()
        authRepository.logout()
        _uiState.value = _uiState.value.copy(dialog = null, signingOut = false)
        _events.send(SettingsEvent.SignedOut)
    }

    private fun emit(@StringRes messageRes: Int, isError: Boolean = false) {
        viewModelScope.launch { _events.send(SettingsEvent.Message(messageRes, isError)) }
    }

    companion object {
        /** `updateIdentitySchema` caps the display name at 60 characters. */
        const val MAX_NAME_LENGTH = 60

        /** `config.deletionGraceDays` in `apps/api/src/platform/config.ts`. */
        const val DELETION_GRACE_DAYS = 30
    }
}

/** The profile as the `PUT /me/profile` body, so a patch can be sent in full. */
fun WellnessProfileDto.toInput(): ProfileInputDto = ProfileInputDto(
    weightKg = weightKg,
    heightCm = heightCm,
    age = age,
    sex = sex,
    goal = goal,
    activityLevel = activityLevel,
    exerciseExperience = exerciseExperience,
    dietaryPreferences = dietaryPreferences,
    allergies = allergies,
    equipment = equipment,
    unitPreference = unitPreference,
    targetWeightKg = targetWeightKg,
)
