package fit.aquazero.app.core.gamification

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import fit.aquazero.app.core.data.CoachesRepository
import fit.aquazero.app.core.model.ApiResult
import fit.aquazero.app.core.model.ExperienceStatusDto
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Immutable state of the celebration layer. */
data class CelebrationUiState(
    /** Moments still to play, in server order. */
    val queue: List<Celebration> = emptyList(),
    /** The latest progression snapshot, ratcheted so it can never fall. */
    val experience: ExperienceStatusDto? = null,
) {
    /** The moment on screen right now, if any. */
    val current: Celebration? get() = queue.firstOrNull()

    /** Whether [current] wants the full-screen treatment. */
    val isFullScreen: Boolean
        get() = current is Celebration.LevelUp || current is Celebration.RankUp
}

/**
 * Owns the celebration queue and the acknowledgement that closes it.
 *
 * Self-contained on purpose: any screen can drop [CelebrationHost] in and get
 * the whole behaviour — poll, play, ack — without knowing about coaches,
 * reactions or the XP ledger. The dashboard and the coach chat both want it,
 * and neither should have to reimplement the one rule that matters.
 *
 * That rule: **[acknowledge] is only ever called by a surface that has already
 * composed.** The ViewModel deliberately exposes no "mark seen" entry point
 * that fires on load. The server treats an acknowledged reaction as delivered
 * and will not send it again, so an ack that runs before the pixels do
 * silently deletes the best moment the product has.
 */
@HiltViewModel
class CelebrationViewModel @Inject constructor(
    private val coachesRepository: CoachesRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(CelebrationUiState())
    val uiState: StateFlow<CelebrationUiState> = _uiState.asStateFlow()

    /** Display-side ratchet — see [MonotonicExperience]. XP never decreases. */
    private val experience = MonotonicExperience()

    /** Everything that has been put on screen since the last successful ack. */
    private val shown = mutableListOf<Celebration>()

    init {
        refresh()
    }

    /**
     * Pull progression and enqueue anything celebratory. Safe to call on every
     * screen entry: unacknowledged reactions are meant to reappear, and the
     * queue de-duplicates against what is already pending.
     */
    fun refresh() {
        viewModelScope.launch {
            when (val result = coachesRepository.progression()) {
                is ApiResult.Success -> {
                    val merged = experience.accept(result.data.experience)
                    val incoming = celebrationsOf(result.data)
                    _uiState.value = CelebrationUiState(
                        queue = mergeQueue(_uiState.value.queue, incoming),
                        experience = merged,
                    )
                }
                // Offline or 5xx: keep whatever is already held. A celebration
                // that cannot be fetched is not a celebration that was missed.
                is ApiResult.Failure -> Unit
            }
        }
    }

    /**
     * Called by the celebration surface once it is on screen. Records the
     * moment as shown; the ack request goes out when the queue drains.
     */
    fun onShown(celebration: Celebration) {
        if (shown.none { it == celebration }) shown += celebration
    }

    /** Advance past the current moment; acknowledges once nothing is left. */
    fun dismissCurrent() {
        val remaining = _uiState.value.queue.drop(1)
        _uiState.value = _uiState.value.copy(queue = remaining)
        if (remaining.isEmpty()) acknowledge()
    }

    /**
     * Tell the server the shown queue was delivered.
     *
     * The route replies `204 No Content`, which the typed client cannot decode
     * — the failure is expected and ignored, because the write has already
     * happened server-side by the time the body would have been read. Treating
     * it as an error and retrying would be harmless but pointless; treating it
     * as a reason to keep the queue would replay a celebration the user just
     * dismissed.
     */
    private fun acknowledge() {
        val displayed = shown.toList()
        if (displayed.isEmpty()) return
        val snapshot = experience.current ?: return
        shown.clear()
        viewModelScope.launch {
            coachesRepository.ackReactions(ackRequestFor(displayed, snapshot))
        }
    }

    private fun mergeQueue(
        pending: List<Celebration>,
        incoming: List<Celebration>,
    ): List<Celebration> = (pending + incoming.filterNot { it in pending })
}
