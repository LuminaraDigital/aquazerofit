package fit.aquazero.app.feature.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import fit.aquazero.app.core.common.LocalDailyNutrition
import fit.aquazero.app.core.common.LocalDates
import fit.aquazero.app.core.data.LogsRepository
import fit.aquazero.app.core.data.ProfileRepository
import javax.inject.Inject
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

@HiltViewModel
class DashboardViewModel @Inject constructor(
    private val logsRepository: LogsRepository,
    private val profileRepository: ProfileRepository,
) : ViewModel() {

    val dailyNutrition: StateFlow<LocalDailyNutrition?> =
        logsRepository.localDailyNutrition(LocalDates.today())
            .stateIn(
                scope = viewModelScope,
                started = SharingStarted.WhileSubscribed(5000),
                initialValue = null,
            )

    val user = profileRepository.user()
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5000),
            initialValue = null,
        )

    fun logWater() {
        viewModelScope.launch {
            logsRepository.logWater(250)
        }
    }

    fun refresh() {
        viewModelScope.launch {
            profileRepository.refreshMe()
            profileRepository.refreshProfileAndTargets()
        }
    }
}
