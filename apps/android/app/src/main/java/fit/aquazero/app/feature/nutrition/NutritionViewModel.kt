package fit.aquazero.app.feature.nutrition

import androidx.annotation.StringRes
import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import fit.aquazero.app.R
import fit.aquazero.app.core.common.LocalDailyNutrition
import fit.aquazero.app.core.common.LocalDates
import fit.aquazero.app.core.database.MealLogEntity
import fit.aquazero.app.core.database.SyncState
import fit.aquazero.app.core.designsystem.ToastKind
import fit.aquazero.app.core.network.ApiResult
import fit.aquazero.app.core.network.dto.FoodDto
import fit.aquazero.app.core.network.dto.MealLogItemDto
import fit.aquazero.app.core.network.dto.MealType
import fit.aquazero.app.feature.dashboard.NutritionFormat
import javax.inject.Inject
import kotlinx.coroutines.ExperimentalCoroutinesApi

import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** Load phase of the selected day. */
enum class NutritionPhase { Loading, Ready, Error }

/** Sync badge for a logged meal — never silent, per plan §4.2. */
enum class MealSyncBadge { None, Pending, Failed }

/** One meal log as the timeline renders it. */
@Immutable
data class MealLogUi(
    val localId: String,
    val mealType: MealType,
    val title: String,
    val itemsLine: String,
    val kcal: Double,
    val proteinG: Double,
    val carbsG: Double,
    val fatG: Double,
    val fromPhoto: Boolean,
    val badge: MealSyncBadge,
    val items: List<MealLogItemDto>,
)

/** One editable row of the edit sheet, anchored to its original values. */
@Immutable
data class EditRowUi(
    val original: MealLogItemDto,
    val current: MealLogItemDto,
)

/** The edit-meal sheet's state. */
@Immutable
data class EditMealUi(
    val localId: String,
    val mealType: MealType,
    val rows: List<EditRowUi>,
    val saving: Boolean = false,
)

/** The food-search sheet's state. */
@Immutable
data class FoodSearchUi(
    val mealType: MealType,
    val term: String = "",
    val searching: Boolean = false,
    val results: List<FoodDto> = emptyList(),
    val recents: List<FoodDto> = emptyList(),
    val selected: FoodDto? = null,
    val grams: Int = DEFAULT_GRAMS,
    val adding: Boolean = false,
) {
    /** True once the query is long enough for the server search to run. */
    val searchActive: Boolean get() = term.trim().length >= MIN_QUERY_LENGTH

    /** The computed item that would be logged — never estimated. */
    val preview: MealLogItemDto?
        get() = selected?.let { NutritionFormat.itemFromFood(it, grams) }

    companion object {
        const val DEFAULT_GRAMS = 100
        const val MIN_QUERY_LENGTH = 2
    }
}

/** Immutable state of the nutrition day view. */
@Immutable
data class NutritionUiState(
    val today: String,
    val selectedDate: String,
    val phase: NutritionPhase = NutritionPhase.Loading,
    val nutrition: LocalDailyNutrition? = null,
    val serverWaterMl: Int = 0,
    val kcalBurned: Double = 0.0,
    val meals: Map<MealType, List<MealLogUi>> = emptyMap(),
    val micronutrients: Micronutrients = Micronutrients(),
    val microsExpanded: Boolean = false,
    val kcalTrend: List<DayValue> = emptyList(),
    val trendLoading: Boolean = true,
    val calendarOpen: Boolean = false,
    val copying: Boolean = false,
    val waterPending: Boolean = false,
    val foodSearch: FoodSearchUi? = null,
    val editing: EditMealUi? = null,
) {
    /** True when the selected day is today (guards forward navigation). */
    val isToday: Boolean get() = selectedDate == today

    /** Millilitres to render: local total merged with the server's day total. */
    val waterConsumedMl: Int
        get() = maxOf(nutrition?.waterConsumedMl ?: 0, serverWaterMl)

    /** Total number of logs across every meal type. */
    val loggedCount: Int get() = meals.values.sumOf { it.size }

    /**
     * True when Room already holds something worth showing for this day. The
     * local recompute always emits (an untouched day is legitimately all
     * zeroes), so a failed fetch alone never justifies an error surface.
     */
    val hasContent: Boolean
        get() = nutrition != null &&
            (loggedCount > 0 || nutrition.kcalTarget > 0.0 || nutrition.waterConsumedMl > 0)
}

/** One-shot effects for the nutrition screen. */
sealed interface NutritionEvent {
    /** Show a transient message. */
    data class Message(@StringRes val messageRes: Int, val kind: ToastKind) : NutritionEvent
}

/**
 * Nutrition day view state holder.
 *
 * Reads are Room `Flow`s keyed on the selected date, so the day switcher is
 * instant and correct offline; every day change also fires a refresh-on-
 * observe fetch that reconciles the server's logs into Room. Every write —
 * add, edit, delete, copy, water — goes through the repository seam and
 * therefore through the outbox, never straight to Retrofit.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class NutritionViewModel @Inject constructor(
    private val data: NutritionData,
) : ViewModel() {

    private val today = LocalDates.today()
    private val selectedDate = MutableStateFlow(today)
    private val searchTerm = MutableStateFlow("")

    private val _uiState = MutableStateFlow(
        NutritionUiState(today = today, selectedDate = today),
    )
    val uiState: StateFlow<NutritionUiState> = _uiState.asStateFlow()

    private val _events = MutableSharedFlow<NutritionEvent>(
        extraBufferCapacity = 4,
        onBufferOverflow = BufferOverflow.DROP_OLDEST,
    )
    val events: SharedFlow<NutritionEvent> = _events

    init {
        observeRoom()
        observeSearch()
        refresh()
        viewModelScope.launch {
            data.refreshTrends()
            _uiState.update { it.copy(trendLoading = false) }
        }
    }

    private fun observeRoom() {
        viewModelScope.launch {
            selectedDate.flatMapLatest { data.mealLogs(it) }.collect { rows ->
                val grouped = rows.map { it.toUi() }.groupBy { it.mealType }
                _uiState.update {
                    it.copy(
                        meals = grouped,
                        micronutrients = NutritionMath.micronutrients(rows.flatMap(MealLogEntity::items)),
                    )
                }
            }
        }
        viewModelScope.launch {
            selectedDate.flatMapLatest { data.dailyNutrition(it) }.collect { nutrition ->
                _uiState.update { state ->
                    val next = state.copy(nutrition = nutrition)
                    // Content arriving from Room clears an earlier fetch error.
                    if (state.phase == NutritionPhase.Error && !next.hasContent) {
                        next
                    } else {
                        next.copy(phase = NutritionPhase.Ready)
                    }
                }
            }
        }
        viewModelScope.launch {
            data.kcalTrend().collect { trend ->
                _uiState.update { it.copy(kcalTrend = trend) }
            }
        }
        viewModelScope.launch {
            data.recentFoods().collect { foods ->
                _uiState.update { state ->
                    state.copy(foodSearch = state.foodSearch?.copy(recents = foods))
                }
            }
        }
    }

    private fun observeSearch() {
        viewModelScope.launch {
            searchTerm
                .debounce(SEARCH_DEBOUNCE_MS)
                .distinctUntilChanged()
                .collect { raw ->
                    val term = raw.trim()
                    if (term.length < FoodSearchUi.MIN_QUERY_LENGTH) {
                        _uiState.update { state ->
                            state.copy(
                                foodSearch = state.foodSearch?.copy(
                                    searching = false,
                                    results = emptyList(),
                                ),
                            )
                        }
                        return@collect
                    }
                    _uiState.update { state ->
                        state.copy(foodSearch = state.foodSearch?.copy(searching = true))
                    }
                    val results = data.searchFoods(term)
                    _uiState.update { state ->
                        state.copy(
                            foodSearch = state.foodSearch?.copy(
                                searching = false,
                                results = results,
                            ),
                        )
                    }
                }
        }
    }

    /** Refresh-on-observe for the currently selected day. */
    fun refresh() {
        val date = selectedDate.value
        viewModelScope.launch {
            when (val result = data.refreshDay(date)) {
                is ApiResult.Success -> _uiState.update {
                    it.copy(
                        phase = NutritionPhase.Ready,
                        serverWaterMl = result.data.waterMl.consumed.toInt(),
                        kcalBurned = result.data.kcalBurned,
                    )
                }
                is ApiResult.Failure -> _uiState.update {
                    // Room content is still valid offline; only a cold, empty
                    // day is worth an error surface.
                    if (it.hasContent) it else it.copy(phase = NutritionPhase.Error)
                }
            }
        }
    }

    // ----- day switching -----

    /** Move the selected day by [days]; never past today. */
    fun shiftDay(days: Long) {
        val next = LocalDates.shift(selectedDate.value, days)
        if (next > today) return
        selectDate(next)
    }

    /** Jump to a specific `YYYY-MM-DD`; future dates are ignored. */
    fun selectDate(date: String) {
        if (!LocalDates.isValid(date) || date > today) return
        selectedDate.value = date
        _uiState.update {
            it.copy(
                selectedDate = date,
                calendarOpen = false,
                serverWaterMl = 0,
                kcalBurned = 0.0,
                phase = if (it.phase == NutritionPhase.Error) NutritionPhase.Loading else it.phase,
            )
        }
        refresh()
    }

    /** Open or close the month picker. */
    fun setCalendarOpen(open: Boolean) {
        _uiState.update { it.copy(calendarOpen = open) }
    }

    /** Expand or collapse the micronutrient rows. */
    fun toggleMicros() {
        _uiState.update { it.copy(microsExpanded = !it.microsExpanded) }
    }

    // ----- water -----

    /** One-tap +250 ml on the selected day (optimistic, Room-first). */
    fun logWater(amountMl: Int = WATER_INCREMENT_ML) {
        if (_uiState.value.waterPending) return
        _uiState.update { it.copy(waterPending = true) }
        val date = selectedDate.value
        viewModelScope.launch {
            val before = _uiState.value.serverWaterMl
            runCatching { data.logWater(amountMl, date) }
                .onSuccess {
                    _uiState.update { it.copy(waterPending = false) }
                    emit(NutritionEvent.Message(R.string.water_logged, ToastKind.Success))
                }
                .onFailure {
                    _uiState.update { it.copy(waterPending = false, serverWaterMl = before) }
                    emit(NutritionEvent.Message(R.string.water_log_failed, ToastKind.Error))
                }
        }
    }

    // ----- food search sheet -----

    /** Open the add-food sheet for one meal slot. */
    fun openFoodSearch(mealType: MealType) {
        searchTerm.value = ""
        _uiState.update { it.copy(foodSearch = FoodSearchUi(mealType = mealType)) }
    }

    /** Close the add-food sheet, discarding its draft. */
    fun closeFoodSearch() {
        searchTerm.value = ""
        _uiState.update { it.copy(foodSearch = null) }
    }

    /** Update the search box. Debounced; nothing is fetched under 2 characters. */
    fun onSearchTermChange(term: String) {
        searchTerm.value = term
        _uiState.update { state -> state.copy(foodSearch = state.foodSearch?.copy(term = term)) }
    }

    /** Pick a food; the portion seeds from its first common serving. */
    fun selectFood(food: FoodDto) {
        _uiState.update { state ->
            state.copy(
                foodSearch = state.foodSearch?.copy(
                    selected = food,
                    grams = food.commonServings.firstOrNull()?.grams?.toInt()
                        ?: FoodSearchUi.DEFAULT_GRAMS,
                ),
            )
        }
    }

    /** Step back from the portion view to the results list. */
    fun clearSelectedFood() {
        _uiState.update { state -> state.copy(foodSearch = state.foodSearch?.copy(selected = null)) }
    }

    /** Set the portion in grams (the stepper clamps to 5–2000g). */
    fun setGrams(grams: Int) {
        _uiState.update { state -> state.copy(foodSearch = state.foodSearch?.copy(grams = grams)) }
    }

    /**
     * Log the previewed item. This is the only path from the sheet to the
     * diary — product invariant 1: nothing is logged without this tap.
     */
    fun confirmAddFood() {
        val sheet = _uiState.value.foodSearch ?: return
        val item = sheet.preview ?: return
        if (sheet.adding) return
        _uiState.update { it.copy(foodSearch = sheet.copy(adding = true)) }
        val date = selectedDate.value
        viewModelScope.launch {
            runCatching {
                data.logMeal(sheet.mealType, listOf(item), date)
                item.foodId?.let { data.touchFood(it) }
            }.onSuccess {
                _uiState.update { it.copy(foodSearch = null) }
                searchTerm.value = ""
                emit(NutritionEvent.Message(R.string.meal_logged, ToastKind.Success))
            }.onFailure {
                _uiState.update { state -> state.copy(foodSearch = sheet.copy(adding = false)) }
                emit(NutritionEvent.Message(R.string.meal_log_failed, ToastKind.Error))
            }
        }
    }

    // ----- edit / delete -----

    /** Open the edit sheet for one logged meal. */
    fun startEditing(localId: String) {
        val log = _uiState.value.meals.values.flatten().firstOrNull { it.localId == localId }
            ?: return
        _uiState.update {
            it.copy(
                editing = EditMealUi(
                    localId = log.localId,
                    mealType = log.mealType,
                    rows = log.items.map { item -> EditRowUi(original = item, current = item) },
                ),
            )
        }
    }

    /** Close the edit sheet without saving. */
    fun cancelEditing() {
        _uiState.update { it.copy(editing = null) }
    }

    /**
     * Rescale one row. Anchored to the ORIGINAL logged values so repeated
     * edits never compound rounding, and so removing a sibling row can never
     * rebase a row onto the wrong food.
     */
    fun setEditRowGrams(index: Int, grams: Int) {
        _uiState.update { state ->
            val editing = state.editing ?: return@update state
            if (index !in editing.rows.indices) return@update state
            val rows = editing.rows.toMutableList()
            val row = rows[index]
            rows[index] = row.copy(current = NutritionFormat.rescaleItem(row.original, grams))
            state.copy(editing = editing.copy(rows = rows))
        }
    }

    /** Remove one row from the edit sheet (the last row cannot be removed). */
    fun removeEditRow(index: Int) {
        _uiState.update { state ->
            val editing = state.editing ?: return@update state
            if (editing.rows.size <= 1 || index !in editing.rows.indices) return@update state
            state.copy(
                editing = editing.copy(
                    rows = editing.rows.filterIndexed { i, _ -> i != index },
                ),
            )
        }
    }

    /** Save the edited meal through the outbox as a follow-up PUT. */
    fun saveEdit() {
        val editing = _uiState.value.editing ?: return
        if (editing.saving || editing.rows.isEmpty()) return
        _uiState.update { it.copy(editing = editing.copy(saving = true)) }
        viewModelScope.launch {
            runCatching { data.updateMeal(editing.localId, editing.rows.map { it.current }) }
                .onSuccess {
                    _uiState.update { it.copy(editing = null) }
                    emit(NutritionEvent.Message(R.string.meal_updated, ToastKind.Success))
                }
                .onFailure {
                    _uiState.update { it.copy(editing = editing.copy(saving = false)) }
                    emit(NutritionEvent.Message(R.string.meal_log_failed, ToastKind.Error))
                }
        }
    }

    /** Soft-delete a meal locally and outbox the DELETE. */
    fun deleteMeal(localId: String) {
        viewModelScope.launch {
            data.deleteMeal(localId)
            emit(NutritionEvent.Message(R.string.meal_removed, ToastKind.Info))
        }
    }

    // ----- copy previous day -----

    /** Copy yesterday's meals onto the selected day. */
    fun copyPreviousDay() {
        if (_uiState.value.copying) return
        _uiState.update { it.copy(copying = true) }
        val target = selectedDate.value
        val source = LocalDates.shift(target, -1)
        viewModelScope.launch {
            val copied = runCatching { data.copyDay(source, target) }.getOrDefault(0)
            _uiState.update { it.copy(copying = false) }
            emit(
                if (copied > 0) {
                    NutritionEvent.Message(R.string.copy_success, ToastKind.Success)
                } else {
                    NutritionEvent.Message(R.string.copy_empty, ToastKind.Info)
                },
            )
        }
    }

    private suspend fun emit(event: NutritionEvent) {
        _events.emit(event)
    }

    private fun MealLogEntity.toUi(): MealLogUi = MealLogUi(
        localId = localId,
        mealType = NutritionFormat.mealTypeOf(mealType),
        title = items.joinToString(", ") { it.name }.ifBlank { mealType },
        itemsLine = items.joinToString(" · ") { "${it.name} ${it.grams.toInt()}g" },
        kcal = totalKcal,
        proteinG = totalProteinG,
        carbsG = totalCarbsG,
        fatG = totalFatG,
        fromPhoto = source == "photo",
        badge = when (syncState) {
            SyncState.SYNCED -> MealSyncBadge.None
            SyncState.PENDING -> MealSyncBadge.Pending
            SyncState.FAILED -> MealSyncBadge.Failed
        },
        items = items,
    )

    companion object {
        /** The web's one-tap hydration increment. */
        const val WATER_INCREMENT_ML = 250

        /** Search debounce, matching the web client's 300ms. */
        const val SEARCH_DEBOUNCE_MS = 300L
    }
}
