package fit.aquazero.app.feature.progress

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import fit.aquazero.app.R
import fit.aquazero.app.core.common.LocalDates
import fit.aquazero.app.core.data.LogsRepository
import fit.aquazero.app.core.data.ProfileRepository
import fit.aquazero.app.core.database.WeightLogEntity
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch
import javax.inject.Inject
import kotlin.math.roundToInt

/** Display unit for the weight field. Submission is always canonical kg. */
enum class WeightUnit { KG, LB }

/** Immutable state of the log-weight screen. */
data class LogWeightUiState(
    val unit: WeightUnit = WeightUnit.KG,
    /** True once the user has toggled units by hand; the profile stops winning. */
    val unitTouched: Boolean = false,
    val value: String = "",
    val localDate: String = LocalDates.today(),
    val note: String = "",
    val errorRes: Int? = null,
    val saving: Boolean = false,
    val recent: List<WeightLogEntity> = emptyList(),
) {
    /** The entry parsed into canonical kilograms, or null when unusable. */
    val parsedKg: Double?
        get() {
            val parsed = value.trim().replace(',', '.').toDoubleOrNull() ?: return null
            return WeightUnits.toKg(parsed, unit)
        }

    /** Newest stored weigh-in, used for the "since last entry" delta. */
    val latest: WeightLogEntity? get() = recent.firstOrNull()

    /** Signed change against the last entry, in canonical kg. */
    val deltaVsLastKg: Double?
        get() {
            val kg = parsedKg ?: return null
            val last = latest ?: return null
            return kg - last.weightKg
        }

    val canGoLater: Boolean get() = localDate < LocalDates.today()
}

/** One-shot effects from the log-weight screen. */
sealed interface LogWeightEvent {
    /** Written locally and queued for sync; the screen confirms and closes. */
    data object Saved : LogWeightEvent
}

/** Unit conversion and validation, pure so it is unit-testable. */
object WeightUnits {

    /** Exact international pound. */
    const val KG_PER_LB = 0.45359237

    /** Lowest weight the server accepts, in kg. */
    const val MIN_KG = 30.0

    /** Highest weight the server accepts, in kg. */
    const val MAX_KG = 300.0

    /** Convert a displayed value to canonical kilograms. */
    fun toKg(value: Double, unit: WeightUnit): Double =
        if (unit == WeightUnit.LB) value * KG_PER_LB else value

    /** Convert canonical kilograms to the display unit. */
    fun fromKg(kg: Double, unit: WeightUnit): Double =
        if (unit == WeightUnit.LB) kg / KG_PER_LB else kg

    /** Round to one decimal, matching what the server stores. */
    fun round1(value: Double): Double = (value * 10).roundToInt() / 10.0

    /** True when the canonical value is inside the accepted band. */
    fun inRange(kg: Double): Boolean = kg in MIN_KG..MAX_KG
}

/** Signed display value in the current unit: "+0.4" / "-1.2". */
fun signedDisplay(deltaKg: Double, unit: WeightUnit): String {
    val converted = WeightUnits.fromKg(deltaKg, unit)
    val sign = if (converted > 0) {
        "+"
    } else if (converted < 0) {
        "-"
    } else {
        ""
    }
    return "$sign${String.format(java.util.Locale.US, "%.1f", kotlin.math.abs(converted))}"
}

/** Outcome of validating the entry box. */
sealed interface WeightValidation {
    /** Accepted; [canonicalKg] is what gets submitted, always in kilograms. */
    data class Valid(val canonicalKg: Double) : WeightValidation

    /** Rejected, with the message to show under the field. */
    data class Invalid(val errorRes: Int) : WeightValidation
}

/**
 * Client-side validation and unit switching, kept pure so the rules that
 * guard a health metric are testable without a device.
 */
object LogWeightValidation {

    /**
     * Validate the typed entry. Conversion happens first: the 30–300 band is
     * always applied to canonical kilograms, so a pound entry is judged by the
     * same physical limits.
     */
    fun validate(
        raw: String,
        unit: WeightUnit,
        localDate: String,
        today: String,
    ): WeightValidation {
        val parsed = raw.trim().replace(',', '.').toDoubleOrNull()
            ?: return WeightValidation.Invalid(R.string.log_weight_error_empty)
        val kg = WeightUnits.round1(WeightUnits.toKg(parsed, unit))
        if (!WeightUnits.inRange(kg)) {
            return WeightValidation.Invalid(
                if (unit == WeightUnit.KG) {
                    R.string.log_weight_error_range_kg
                } else {
                    R.string.log_weight_error_range_lb
                },
            )
        }
        if (localDate > today) {
            return WeightValidation.Invalid(R.string.log_weight_error_future)
        }
        return WeightValidation.Valid(kg)
    }

    /**
     * Re-express the typed value in [to] so the physical weight is preserved
     * across a unit toggle. Returns null when there is nothing to convert.
     */
    fun convertOnUnitSwitch(raw: String, from: WeightUnit, to: WeightUnit): String? {
        if (from == to) return null
        val parsed = raw.trim().replace(',', '.').toDoubleOrNull() ?: return null
        val kg = WeightUnits.toKg(parsed, from)
        return String.format(java.util.Locale.US, "%.1f", WeightUnits.fromKg(kg, to))
    }
}

/**
 * Log a weigh-in.
 *
 * The kg/lb toggle is **display only**: whatever the user types is converted
 * and submitted as canonical kilograms, exactly as the web does. The profile's
 * `unitPreference` selects the initial unit and stops applying the moment the
 * user toggles by hand.
 *
 * The write itself is offline-first — [LogsRepository.logWeight] lands in Room
 * and the outbox, so the confirmation is honest about sync rather than
 * pretending a server round trip happened.
 */
@HiltViewModel
class LogWeightViewModel @Inject constructor(
    private val logsRepository: LogsRepository,
    private val profileRepository: ProfileRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(LogWeightUiState())
    val uiState: StateFlow<LogWeightUiState> = _uiState.asStateFlow()

    private val _events = Channel<LogWeightEvent>(Channel.BUFFERED)
    val events: Flow<LogWeightEvent> = _events.receiveAsFlow()

    init {
        viewModelScope.launch {
            logsRepository.recentWeightLogs(RECENT_LIMIT).collect { logs ->
                val cutoff = LocalDates.shift(LocalDates.today(), -RECENT_DAYS.toLong())
                _uiState.value = _uiState.value.copy(
                    recent = logs.filter { it.localDate >= cutoff },
                )
            }
        }
        viewModelScope.launch {
            profileRepository.profile().collect { profile ->
                if (_uiState.value.unitTouched || profile == null) return@collect
                _uiState.value = _uiState.value.copy(
                    unit = if (profile.unitPreference == IMPERIAL) WeightUnit.LB else WeightUnit.KG,
                )
            }
        }
        viewModelScope.launch { profileRepository.refreshProfileAndTargets() }
    }

    fun onValueChange(value: String) {
        _uiState.value = _uiState.value.copy(value = value, errorRes = null)
    }

    fun onNoteChange(note: String) {
        _uiState.value = _uiState.value.copy(note = note.take(MAX_NOTE_LENGTH))
    }

    /** Append a quick note chip without duplicating it. */
    fun appendQuickNote(text: String) {
        val current = _uiState.value.note
        val next = when {
            current.contains(text) -> current
            current.isBlank() -> text
            else -> "$current · $text"
        }
        onNoteChange(next)
    }

    /** Step the date back one day; forward is capped at today. */
    fun shiftDate(days: Long) {
        val next = LocalDates.shift(_uiState.value.localDate, days)
        if (next > LocalDates.today()) return
        _uiState.value = _uiState.value.copy(localDate = next, errorRes = null)
    }

    /**
     * Toggle the display unit, converting the typed value so the physical
     * weight is preserved.
     */
    fun setUnit(unit: WeightUnit) {
        val state = _uiState.value
        if (state.unit == unit) return
        val converted = LogWeightValidation.convertOnUnitSwitch(state.value, state.unit, unit)
        _uiState.value = state.copy(
            unit = unit,
            unitTouched = true,
            value = converted ?: state.value,
            errorRes = null,
        )
    }

    /** Validate, then write locally and queue for sync. */
    fun submit() {
        val state = _uiState.value
        val validation = LogWeightValidation.validate(
            raw = state.value,
            unit = state.unit,
            localDate = state.localDate,
            today = LocalDates.today(),
        )
        if (validation is WeightValidation.Invalid) {
            _uiState.value = state.copy(errorRes = validation.errorRes)
            return
        }
        val kg = (validation as WeightValidation.Valid).canonicalKg

        _uiState.value = state.copy(saving = true, errorRes = null)
        viewModelScope.launch {
            logsRepository.logWeight(
                weightKg = kg,
                note = state.note.trim().ifBlank { null },
                localDate = state.localDate,
            )
            _uiState.value = _uiState.value.copy(saving = false)
            _events.send(LogWeightEvent.Saved)
        }
    }

    companion object {
        /** Rows pulled from Room before the 30-day window is applied. */
        const val RECENT_LIMIT = 60

        /** The window the recent list shows. */
        const val RECENT_DAYS = 30

        private const val MAX_NOTE_LENGTH = 300
        private const val IMPERIAL = "imperial"
    }
}
