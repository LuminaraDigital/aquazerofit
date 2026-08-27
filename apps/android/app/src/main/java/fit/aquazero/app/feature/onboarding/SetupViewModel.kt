package fit.aquazero.app.feature.onboarding

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import fit.aquazero.app.R
import fit.aquazero.app.core.data.AccountRepository
import fit.aquazero.app.core.model.ActivityLevel
import fit.aquazero.app.core.model.ApiResult
import fit.aquazero.app.core.model.AzfJson
import fit.aquazero.app.core.model.ConsentUpdateRequest
import fit.aquazero.app.core.model.DerivedTargetsDto
import fit.aquazero.app.core.model.Equipment
import fit.aquazero.app.core.model.Goal
import fit.aquazero.app.core.model.ProfileInputDto
import fit.aquazero.app.core.model.Sex
import fit.aquazero.app.core.model.UnitPreference
import fit.aquazero.app.core.model.WellnessProfileDto
import fit.aquazero.app.feature.settings.reminders.ReminderPrefsStore
import fit.aquazero.app.feature.settings.reminders.ReminderScheduler
import javax.inject.Inject
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch

/** Which half of the setup flow is on screen. */
enum class SetupPhase { FORM, REVEAL }

/** Immutable state of the wellness essentials form. */
data class SetupUiState(
    val phase: SetupPhase = SetupPhase.FORM,
    val loading: Boolean = true,
    /**
     * True while no profile exists. Consents are collected once, with the
     * first profile; a later edit must not reset choices made in Settings.
     */
    val isFirstSetup: Boolean = true,
    val unit: UnitPreference = UnitPreference.METRIC,
    val age: String = "",
    val sex: Sex = Sex.UNSPECIFIED,
    val heightCm: String = "",
    val heightFt: String = "",
    val heightIn: String = "",
    val weight: String = "",
    val goal: Goal? = null,
    val activityLevel: ActivityLevel? = null,
    val consentWellness: Boolean = false,
    val consentAi: Boolean = true,
    val consentAnalytics: Boolean = true,
    val consentReminders: Boolean = true,
    val errorRes: Int? = null,
    val saving: Boolean = false,
    val targets: DerivedTargetsDto? = null,
) {
    /** True once every required control has an answer. */
    val isComplete: Boolean
        get() = age.isNotBlank() && goal != null && activityLevel != null &&
            (if (unit == UnitPreference.IMPERIAL) heightFt.isNotBlank() else heightCm.isNotBlank()) &&
            weight.isNotBlank()
}

/** One-shot effects from the setup flow. */
sealed interface SetupEvent {
    /** The person is done — return them where they came from. */
    data object Finished : SetupEvent
}

/**
 * The one form the product still insists on, and only where a target is
 * actually wanted.
 *
 * Scope is set by the target calculator, not by what would be nice to know:
 * Mifflin-St Jeor needs weight, height, age and sex; the activity factor needs
 * activity level; the goal adjustment needs the goal. Six controls. Training
 * experience, equipment, dietary preferences and allergies feed personalisation
 * rather than arithmetic, so they are written at their conservative value here
 * — or carried over unchanged when a profile already exists — and edited later
 * in Settings.
 */
@HiltViewModel
class SetupViewModel @Inject constructor(
    private val accountRepository: AccountRepository,
    private val reminderPrefsStore: ReminderPrefsStore,
    private val reminderScheduler: ReminderScheduler,
) : ViewModel() {

    private val _uiState = MutableStateFlow(SetupUiState())
    val uiState: StateFlow<SetupUiState> = _uiState.asStateFlow()

    private val _events = Channel<SetupEvent>(Channel.BUFFERED)
    val events: Flow<SetupEvent> = _events.receiveAsFlow()

    /** The profile as it currently stands, so deferred fields survive a re-edit. */
    private var existingProfile: WellnessProfileDto? = null

    init {
        viewModelScope.launch { load() }
    }

    /**
     * Seed from Room first so the form is usable offline, then let the
     * server's copy win. Either may be absent — an empty form is the first-run
     * state, not a failure, so nothing here surfaces an error.
     */
    private suspend fun load() {
        decodeCachedProfile()?.let(::seed)
        when (val remote = accountRepository.refreshProfile()) {
            is ApiResult.Success -> remote.data?.let(::seed)
            is ApiResult.Failure -> Unit
        }
        // Refreshing consents keeps the checkbox defaults honest on a re-run.
        accountRepository.refreshConsents()
        _uiState.value = _uiState.value.copy(loading = false)
    }

    private suspend fun decodeCachedProfile(): WellnessProfileDto? {
        val entity = accountRepository.profile().firstOrNull() ?: return null
        return runCatching {
            AzfJson.decodeFromString(WellnessProfileDto.serializer(), entity.docJson)
        }.getOrNull()
    }

    private fun seed(profile: WellnessProfileDto) {
        if (existingProfile != null) return
        existingProfile = profile
        val (feet, inches) = SetupUnits.cmToFtIn(profile.heightCm)
        _uiState.value = _uiState.value.copy(
            isFirstSetup = false,
            unit = profile.unitPreference,
            age = profile.age.toString(),
            sex = profile.sex,
            heightCm = SetupUnits.round1(profile.heightCm).toString(),
            heightFt = feet.toString(),
            heightIn = inches.toString(),
            weight = String.format(
                java.util.Locale.US,
                "%.1f",
                SetupUnits.kgToDisplay(profile.weightKg, profile.unitPreference),
            ),
            goal = profile.goal,
            activityLevel = profile.activityLevel,
        )
    }

    // ----- field edits -----

    fun onAgeChange(value: String) = edit { copy(age = value.filter(Char::isDigit).take(3)) }

    fun onHeightCmChange(value: String) = edit { copy(heightCm = value.take(6)) }

    fun onHeightFtChange(value: String) = edit { copy(heightFt = value.filter(Char::isDigit).take(1)) }

    fun onHeightInChange(value: String) = edit { copy(heightIn = value.filter(Char::isDigit).take(2)) }

    fun onWeightChange(value: String) = edit { copy(weight = value.take(6)) }

    fun onSexChange(sex: Sex) = edit { copy(sex = sex) }

    fun onGoalChange(goal: Goal) = edit { copy(goal = goal) }

    fun onActivityChange(level: ActivityLevel) = edit { copy(activityLevel = level) }

    fun onConsentWellnessChange(value: Boolean) = edit { copy(consentWellness = value) }

    fun onConsentAiChange(value: Boolean) = edit { copy(consentAi = value) }

    fun onConsentAnalyticsChange(value: Boolean) = edit { copy(consentAnalytics = value) }

    fun onConsentRemindersChange(value: Boolean) = edit { copy(consentReminders = value) }

    /** Toggle units, converting the typed weight so the physical value holds. */
    fun onUnitChange(unit: UnitPreference) {
        val state = _uiState.value
        if (state.unit == unit) return
        val converted = SetupForm.convertWeightOnUnitSwitch(state.weight, state.unit, unit)
        val heightCm = SetupForm.resolveHeightCm(
            state.unit,
            state.heightCm,
            state.heightFt,
            state.heightIn,
        )
        val (feet, inches) = SetupUnits.cmToFtIn(heightCm)
        _uiState.value = state.copy(
            unit = unit,
            weight = converted ?: state.weight,
            heightCm = if (heightCm > 0) SetupUnits.round1(heightCm).toString() else state.heightCm,
            heightFt = if (heightCm > 0) feet.toString() else state.heightFt,
            heightIn = if (heightCm > 0) inches.toString() else state.heightIn,
            errorRes = null,
        )
    }

    // ----- submit -----

    /** Validate, save the profile, and on a first setup save the consents too. */
    fun submit() {
        val state = _uiState.value
        val validation = SetupForm.validate(
            unit = state.unit,
            age = state.age,
            heightCm = state.heightCm,
            heightFt = state.heightFt,
            heightIn = state.heightIn,
            weight = state.weight,
            sex = state.sex,
            goal = state.goal,
            activityLevel = state.activityLevel,
            requireWellnessConsent = state.isFirstSetup,
            wellnessConsent = state.consentWellness,
        )
        if (validation is SetupValidation.Invalid) {
            _uiState.value = state.copy(errorRes = validation.errorRes)
            return
        }
        val essentials = (validation as SetupValidation.Valid).essentials
        val previous = existingProfile

        _uiState.value = state.copy(saving = true, errorRes = null)
        viewModelScope.launch {
            val input = ProfileInputDto(
                weightKg = essentials.weightKg,
                heightCm = essentials.heightCm,
                age = essentials.age,
                sex = essentials.sex,
                goal = essentials.goal,
                activityLevel = essentials.activityLevel,
                // Deferred personalisation: keep whatever the account already
                // has, otherwise the most conservative value. None of these
                // change a target.
                exerciseExperience = previous?.exerciseExperience
                    ?: fit.aquazero.app.core.model.ExerciseExperience.BEGINNER,
                dietaryPreferences = previous?.dietaryPreferences.orEmpty(),
                allergies = previous?.allergies.orEmpty(),
                equipment = previous?.equipment?.takeIf { it.isNotEmpty() } ?: listOf(Equipment.NONE),
                unitPreference = state.unit,
                targetWeightKg = previous?.targetWeightKg,
            )
            when (val saved = accountRepository.saveProfile(input)) {
                is ApiResult.Failure -> {
                    _uiState.value = _uiState.value.copy(
                        saving = false,
                        errorRes = R.string.setup_error_save,
                    )
                }
                is ApiResult.Success -> {
                    existingProfile = saved.data.profile
                    if (state.isFirstSetup) saveInitialConsents(state)
                    val targets = saved.data.targets ?: fetchTargets()
                    _uiState.value = _uiState.value.copy(
                        saving = false,
                        phase = SetupPhase.REVEAL,
                        isFirstSetup = false,
                        targets = targets,
                    )
                }
            }
        }
    }

    /**
     * Persist the four consents chosen alongside the first profile, then bring
     * the local reminder schedule in line — a `reminders` consent that does not
     * actually start or stop reminders is display state, not consent.
     */
    private suspend fun saveInitialConsents(state: SetupUiState) {
        val result = accountRepository.saveConsents(
            ConsentUpdateRequest(
                wellnessDataProcessing = state.consentWellness,
                aiPersonalisation = state.consentAi,
                anonymisedAnalytics = state.consentAnalytics,
                reminders = state.consentReminders,
            ),
        )
        if (result is ApiResult.Success) {
            reminderScheduler.sync(
                prefs = reminderPrefsStore.current(),
                remindersConsented = result.data.reminders,
            )
        }
    }

    private suspend fun fetchTargets(): DerivedTargetsDto? =
        (accountRepository.refreshTargets() as? ApiResult.Success)?.data

    /** Leave the reveal (or skip the form entirely). */
    fun finish() {
        viewModelScope.launch { _events.send(SetupEvent.Finished) }
    }

    private fun edit(block: SetupUiState.() -> SetupUiState) {
        _uiState.value = _uiState.value.block().copy(errorRes = null)
    }
}
