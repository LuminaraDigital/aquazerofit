package fit.aquazero.app.feature.progress

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import fit.aquazero.app.core.common.LocalDates
import fit.aquazero.app.core.data.ProfileRepository
import fit.aquazero.app.core.data.ProgressRepository
import fit.aquazero.app.core.database.TrendPointEntity
import fit.aquazero.app.core.model.ApiResult
import fit.aquazero.app.core.model.ProgressInsightDto
import fit.aquazero.app.core.model.ProgressSummaryDto
import fit.aquazero.app.core.model.TrendPointDto
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Selectable window for every chart on the screen. */
enum class ProgressRange(val days: Int, val apiRange: String) {
    WEEK(7, "7d"),
    MONTH(30, "30d"),
    QUARTER(90, "90d"),
}

/** Averaged macro intake over the selected window. */
data class MacroAverages(
    val proteinG: Double = 0.0,
    val carbsG: Double = 0.0,
    val fatG: Double = 0.0,
    /**
     * True only when the carbohydrate/fat series are actually cached. Protein
     * alone would render a 100 %-protein donut, which is worse than showing
     * the calm empty line.
     */
    val complete: Boolean = false,
) {
    val hasData: Boolean get() = complete && (proteinG + carbsG + fatG) > 0.0
}

/** Immutable state of the progress screen. */
data class ProgressUiState(
    val loading: Boolean = true,
    val refreshError: Boolean = false,
    val range: ProgressRange = ProgressRange.MONTH,
    val summary: ProgressSummaryDto? = null,
    val weightSeries: List<TrendPointDto> = emptyList(),
    val kcalSeries: List<TrendPointDto> = emptyList(),
    val kcalTarget: Double? = null,
    val macros: MacroAverages = MacroAverages(),
    val insight: ProgressInsightDto? = null,
    val insightLoading: Boolean = true,
    val adaptiveExpenditure: fit.aquazero.app.core.common.AdaptiveExpenditureResult? = null,
) {
    val currentWeightKg: Double? get() = summary?.currentWeightKg

    val goalWeightKg: Double? get() = summary?.targetWeightKg

    /**
     * Weight change since the start. Reported, never judged — the sign carries
     * the information and the UI paints both directions in the same ink.
     */
    val deltaKg: Double?
        get() {
            val snapshot = summary ?: return null
            val current = snapshot.currentWeightKg ?: return null
            val start = snapshot.startWeightKg ?: return null
            return current - start
        }

    val averageKcal: Int
        get() = if (kcalSeries.isEmpty()) {
            0
        } else {
            (kcalSeries.sumOf { it.value } / kcalSeries.size).toInt()
        }
}

/** One-shot effects from the progress screen. */
sealed interface ProgressEvent {
    /** Hand a plain-text export to the Android share sheet. */
    data class ShareExport(val body: String) : ProgressEvent
    data object ExportEmpty : ProgressEvent
}

/** Trim a series to the selected window, exactly as the web's `cutToRange` does. */
fun cutToRange(
    points: List<TrendPointDto>,
    range: ProgressRange,
    today: String = LocalDates.today(),
): List<TrendPointDto> {
    val from = LocalDates.shift(today, -range.days.toLong())
    return points.filter { it.date >= from }
}

/**
 * Progress: range chips, weight journey, calorie trend, consistency, weekly
 * insight, achievements and export.
 *
 * Reads are Room-backed `Flow`s so the whole screen renders offline from the
 * last cached snapshot; network refreshes overwrite it (server wins).
 */
@HiltViewModel
class ProgressViewModel @Inject constructor(
    private val progressRepository: ProgressRepository,
    private val profileRepository: ProfileRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(ProgressUiState())
    val uiState: StateFlow<ProgressUiState> = _uiState.asStateFlow()

    private val _events = Channel<ProgressEvent>(Channel.BUFFERED)
    val events: Flow<ProgressEvent> = _events.receiveAsFlow()

    private var cachedWeightSeries: List<TrendPointDto> = emptyList()
    private var cachedKcalSeries: List<TrendPointDto> = emptyList()
    private var cachedProteinSeries: List<TrendPointDto> = emptyList()
    private var cachedCarbsSeries: List<TrendPointDto> = emptyList()
    private var cachedFatSeries: List<TrendPointDto> = emptyList()
    private var cachedSex: fit.aquazero.app.core.model.Sex = fit.aquazero.app.core.model.Sex.UNSPECIFIED
    private var cachedTdee: Double = 2000.0
    private var cachedAdaptiveEnabled: Boolean = false

    init {
        observeSummary()
        observeSeries()
        observeTargets()
        observeProfile()
        refresh()
    }

    /** Refresh the summary, the nutrition trends for the range, and the insight. */
    fun refresh() {
        viewModelScope.launch {
            val result = progressRepository.refreshSummary()
            _uiState.value = _uiState.value.copy(
                loading = false,
                refreshError = result is ApiResult.Failure && _uiState.value.summary == null,
            )
        }
        viewModelScope.launch {
            progressRepository.refreshNutritionTrends(_uiState.value.range.apiRange)
        }
        viewModelScope.launch { profileRepository.refreshProfileAndTargets() }
        loadInsight()
    }

    /** Change the visible window; trends are re-fetched for the new range. */
    fun setRange(range: ProgressRange) {
        if (_uiState.value.range == range) return
        _uiState.value = _uiState.value.copy(range = range)
        recompute()
        viewModelScope.launch { progressRepository.refreshNutritionTrends(range.apiRange) }
    }

    /**
     * Build a plain-text export of what the client holds and hand it to the
     * system share sheet.
     */
    fun exportData() {
        val state = _uiState.value
        val summary = state.summary
        if (summary == null && state.weightSeries.isEmpty()) {
            viewModelScope.launch { _events.send(ProgressEvent.ExportEmpty) }
            return
        }
        val body = buildString {
            appendLine("AquaZeroFit export — ${LocalDates.today()}")
            appendLine("Range: ${state.range.apiRange}")
            summary?.let {
                appendLine("Current weight (kg): ${it.currentWeightKg ?: "-"}")
                appendLine("Start weight (kg): ${it.startWeightKg ?: "-"}")
                appendLine("Goal weight (kg): ${it.targetWeightKg ?: "-"}")
                appendLine("Workouts completed: ${it.workoutsCompleted}")
                appendLine("Active days: ${it.consistency.activeDays}/${it.consistency.windowDays}")
            }
            appendLine()
            appendLine("date,weightKg")
            state.weightSeries.forEach { point -> appendLine("${point.date},${point.value}") }
            if (state.kcalSeries.isNotEmpty()) {
                appendLine()
                appendLine("date,kcal")
                state.kcalSeries.forEach { point -> appendLine("${point.date},${point.value}") }
            }
        }
        viewModelScope.launch { _events.send(ProgressEvent.ShareExport(body = body)) }
    }

    private fun observeSummary() {
        viewModelScope.launch {
            progressRepository.summary().collect { summary ->
                cachedWeightSeries = summary?.weightSeries.orEmpty()
                _uiState.value = _uiState.value.copy(
                    summary = summary,
                    loading = false,
                )
                recompute()
            }
        }
    }

    private fun observeSeries() {
        viewModelScope.launch {
            progressRepository.series(ProgressRepository.SERIES_KCAL).collect { points ->
                cachedKcalSeries = points.toTrend()
                recompute()
            }
        }
        viewModelScope.launch {
            progressRepository.series(ProgressRepository.SERIES_PROTEIN).collect { points ->
                cachedProteinSeries = points.toTrend()
                recomputeMacros()
            }
        }
        viewModelScope.launch {
            progressRepository.series(SERIES_CARBS).collect { points ->
                cachedCarbsSeries = points.toTrend()
                recomputeMacros()
            }
        }
        viewModelScope.launch {
            progressRepository.series(SERIES_FAT).collect { points ->
                cachedFatSeries = points.toTrend()
                recomputeMacros()
            }
        }
    }

    private fun observeTargets() {
        viewModelScope.launch {
            profileRepository.targets().collect { targets ->
                targets?.let {
                    val decoded = runCatching {
                        fit.aquazero.app.core.model.AzfJson.decodeFromString(
                            fit.aquazero.app.core.model.DerivedTargetsDto.serializer(),
                            it.docJson,
                        )
                    }.getOrNull()
                    cachedTdee = decoded?.tdee ?: it.kcalTarget
                    cachedAdaptiveEnabled = decoded?.adaptiveEnabled == true
                }
                _uiState.value = _uiState.value.copy(kcalTarget = targets?.kcalTarget)
                recompute()
            }
        }
    }

    private fun observeProfile() {
        viewModelScope.launch {
            profileRepository.profile().collect { profile ->
                profile?.let {
                    val decoded = runCatching {
                        fit.aquazero.app.core.model.AzfJson.decodeFromString(
                            fit.aquazero.app.core.model.WellnessProfileDto.serializer(),
                            it.docJson,
                        )
                    }.getOrNull()
                    cachedSex = decoded?.sex ?: fit.aquazero.app.core.model.Sex.UNSPECIFIED
                }
                recompute()
            }
        }
    }

    private fun loadInsight() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(insightLoading = true)
            // This endpoint never errors for an authenticated user; a failure
            // here means "offline", which stays quiet rather than alarmed.
            val result = progressRepository.insight()
            _uiState.value = _uiState.value.copy(
                insightLoading = false,
                insight = (result as? ApiResult.Success)?.data ?: _uiState.value.insight,
            )
        }
    }

    private fun recompute() {
        val range = _uiState.value.range
        val adaptive = adaptiveExpenditureIfEnabled(
            adaptiveEnabled = cachedAdaptiveEnabled,
            weightHistory = cachedWeightSeries,
            calorieHistory = cachedKcalSeries,
            baselineTdee = cachedTdee,
            sex = cachedSex,
        )
        _uiState.value = _uiState.value.copy(
            weightSeries = cutToRange(cachedWeightSeries, range),
            kcalSeries = cutToRange(cachedKcalSeries, range),
            adaptiveExpenditure = adaptive,
        )
        recomputeMacros()
    }

    private fun recomputeMacros() {
        val range = _uiState.value.range
        val protein = averageOf(cachedProteinSeries, range)
        val carbs = averageOf(cachedCarbsSeries, range)
        val fat = averageOf(cachedFatSeries, range)
        _uiState.value = _uiState.value.copy(
            macros = MacroAverages(
                proteinG = protein ?: 0.0,
                carbsG = carbs ?: 0.0,
                fatG = fat ?: 0.0,
                complete = carbs != null && fat != null,
            ),
        )
    }

    private fun averageOf(series: List<TrendPointDto>, range: ProgressRange): Double? {
        val points = cutToRange(series, range)
        if (points.isEmpty()) return null
        return points.sumOf { it.value } / points.size
    }

    private fun List<TrendPointEntity>.toTrend(): List<TrendPointDto> =
        map { TrendPointDto(date = it.date, value = it.value) }

    companion object {
        /** Series keys the trends cache uses for the macro donut. */
        const val SERIES_CARBS = "carbsG"
        const val SERIES_FAT = "fatG"
    }
}
