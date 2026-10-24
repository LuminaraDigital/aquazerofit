package fit.aquazero.app.feature.fightrecord

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import fit.aquazero.app.core.data.FightRecordRepository
import fit.aquazero.app.core.model.ApiResult
import fit.aquazero.app.core.ui.FightRecordFetch
import fit.aquazero.app.core.ui.FightRecordUiState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * The Fight Record screen (AZF-W3-05 US-09): the season, the ladder and the
 * shelf, read through the shared Room snapshot.
 *
 * Display-only: no acknowledgement, no emoji status, nothing written back. The
 * state rules live in [FightRecordUiState.of] in core, not here, because the
 * dashboard's season card needs the same four answers from the same snapshot
 * and features never import one another.
 */
@HiltViewModel
class FightRecordViewModel @Inject constructor(
    private val repository: FightRecordRepository,
) : ViewModel() {

    private val fetch = MutableStateFlow(FightRecordFetch.InFlight)

    val uiState: StateFlow<FightRecordUiState> =
        combine(repository.cached(), fetch, FightRecordUiState::of)
            .stateIn(viewModelScope, SharingStarted.Eagerly, FightRecordUiState.Loading)

    init {
        refresh()
    }

    /**
     * Always ask on open, even with a snapshot showing: this is the page
     * someone visits to see a belt they just earned.
     */
    fun refresh() {
        fetch.value = FightRecordFetch.InFlight
        viewModelScope.launch {
            fetch.value = when (repository.refresh()) {
                is ApiResult.Success -> FightRecordFetch.Done
                is ApiResult.Failure -> FightRecordFetch.Failed
            }
        }
    }
}
