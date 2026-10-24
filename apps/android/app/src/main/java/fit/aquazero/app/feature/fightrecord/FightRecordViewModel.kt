package fit.aquazero.app.feature.fightrecord

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import fit.aquazero.app.core.data.FightRecordRepository
import fit.aquazero.app.core.model.ApiResult
import fit.aquazero.app.core.model.FightRecordEnvelopeDto
import fit.aquazero.app.core.model.FightRecordStatusDto
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * What a Fight Record surface shows. Four states, and only four, so a surface
 * cannot be "loading and failed" or "off but showing a belt".
 */
sealed interface FightRecordUiState {
    /** Nothing cached yet and the first answer is on its way. */
    data object Loading : FightRecordUiState

    /** Nothing cached and the fetch failed. */
    data object Failed : FightRecordUiState

    /** The server says the feature is off for this account (US-10). */
    data object Off : FightRecordUiState

    data class Ready(val record: FightRecordStatusDto) : FightRecordUiState
}

/**
 * Fight Record (AZF-W3-05) for both of its surfaces: the dashboard's season
 * card and the Fight Record screen each get an instance, reading the one Room
 * snapshot, so either refreshing updates both.
 *
 * Display-only: no acknowledgement, no emoji status, nothing written back.
 */
@HiltViewModel
class FightRecordViewModel @Inject constructor(
    private val repository: FightRecordRepository,
) : ViewModel() {

    private val fetch = MutableStateFlow(Fetch.InFlight)

    /** Eager: one keyed Room read, alive only as long as the hosting entry. */
    val uiState: StateFlow<FightRecordUiState> =
        combine(repository.cached(), fetch, ::uiStateOf)
            .stateIn(viewModelScope, SharingStarted.Eagerly, FightRecordUiState.Loading)

    init {
        refresh()
    }

    /** Ask the server again; also the retry affordance. */
    fun refresh() {
        fetch.value = Fetch.InFlight
        viewModelScope.launch {
            fetch.value = when (repository.refresh()) {
                is ApiResult.Success -> Fetch.Done
                is ApiResult.Failure -> Fetch.Failed
            }
        }
    }
}

/** Where the latest fetch stands: the network half of the state. */
private enum class Fetch { InFlight, Done, Failed }

/**
 * A cached answer always wins over the fetch: a failed refresh behind a good
 * snapshot is not worth interrupting anyone for, and an "off" snapshot keeps
 * the surfaces invisible offline.
 *
 * [Fetch.Done] with nothing cached is the instant between the write and Room's
 * re-emission, so it still reads as loading.
 */
private fun uiStateOf(cached: FightRecordEnvelopeDto?, fetch: Fetch): FightRecordUiState = when {
    cached != null -> cached.fightRecord?.let(FightRecordUiState::Ready) ?: FightRecordUiState.Off
    fetch == Fetch.Failed -> FightRecordUiState.Failed
    else -> FightRecordUiState.Loading
}
