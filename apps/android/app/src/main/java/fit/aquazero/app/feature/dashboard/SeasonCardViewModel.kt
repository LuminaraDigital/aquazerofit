package fit.aquazero.app.feature.dashboard

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
 * The dashboard's season card (AZF-W3-05 US-01), kept out of
 * [DashboardViewModel] on purpose: Fight Record is a separately flagged
 * feature with its own failure mode, and the dashboard's own state, loading
 * and error phases should not have to know it exists. Off means the card
 * composes to nothing; it never touches the rest of the screen.
 *
 * Room is the source and the fetch only writes it, so the screen and this card
 * agree the moment either of them refreshes.
 */
@HiltViewModel
class SeasonCardViewModel @Inject constructor(
    private val repository: FightRecordRepository,
) : ViewModel() {

    private val fetch = MutableStateFlow(FightRecordFetch.InFlight)

    /** Eager: one keyed Room read, alive only as long as the dashboard entry. */
    val uiState: StateFlow<FightRecordUiState> =
        combine(repository.cached(), fetch, FightRecordUiState::of)
            .stateIn(viewModelScope, SharingStarted.Eagerly, FightRecordUiState.Loading)

    init {
        refresh()
    }

    /** Ask the server again; also the retry affordance. */
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
