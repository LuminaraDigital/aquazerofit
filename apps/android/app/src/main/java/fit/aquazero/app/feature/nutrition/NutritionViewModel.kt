package fit.aquazero.app.feature.nutrition

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import fit.aquazero.app.core.common.LocalDailyNutrition
import fit.aquazero.app.core.common.LocalDates
import fit.aquazero.app.core.data.LogsRepository
import fit.aquazero.app.core.database.MealLogEntity
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

@HiltViewModel
class NutritionViewModel @Inject constructor(
    private val logsRepository: LogsRepository,
) : ViewModel() {

    private val _selectedDate = MutableStateFlow(LocalDates.today())
    val selectedDate: StateFlow<String> = _selectedDate

    val mealLogs: StateFlow<List<MealLogEntity>> = _selectedDate
        .flatMapLatest { date -> logsRepository.mealLogsForDate(date) }
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5000),
            initialValue = emptyList(),
        )

    val dailyNutrition: StateFlow<LocalDailyNutrition?> = _selectedDate
        .flatMapLatest { date -> logsRepository.localDailyNutrition(date) }
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5000),
            initialValue = null,
        )

    fun selectDate(date: String) {
        _selectedDate.value = date
    }

    fun deleteMeal(localId: String) {
        viewModelScope.launch {
            logsRepository.deleteMeal(localId)
        }
    }
}
