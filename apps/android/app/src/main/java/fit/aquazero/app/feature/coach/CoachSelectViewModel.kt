package fit.aquazero.app.feature.coach

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import fit.aquazero.app.core.data.CoachesRepository
import fit.aquazero.app.core.database.CoachEntity
import fit.aquazero.app.core.gamification.MonotonicExperience
import fit.aquazero.app.core.model.ApiResult
import fit.aquazero.app.core.model.ExperienceStatusDto
import fit.aquazero.app.core.ui.CoachPersona
import fit.aquazero.app.core.ui.CoachRoster
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/** One row of the roster: the persona plus whatever the server knows about it. */
data class CoachCard(
    val persona: CoachPersona,
    val unlocked: Boolean,
    val active: Boolean,
    val requiredLevel: Int,
    val bondXp: Int,
    val bondLevel: Int,
) {
    /** Locked coaches are shown, never hidden — a ladder you can't see is one nobody climbs. */
    val showsRequirement: Boolean get() = !unlocked && requiredLevel > 0
}

/** Immutable state of the character-select screen. */
data class CoachSelectUiState(
    val loading: Boolean = true,
    val rosterFailed: Boolean = false,
    val cards: List<CoachCard> = emptyList(),
    val experience: ExperienceStatusDto? = null,
    val switchingCoachId: String? = null,
)

/** One-shot effects. */
sealed interface CoachSelectEvent {
    data class Switched(val coachName: String) : CoachSelectEvent
    data object SwitchFailed : CoachSelectEvent
    data class StillLocked(val coachName: String, val level: Int) : CoachSelectEvent

    /** The chosen coach is already active — go straight to the conversation. */
    data object OpenChat : CoachSelectEvent
}

/**
 * Character select.
 *
 * **No coach on this screen is for sale, and none ever becomes one.** The app
 * does now sell exactly one thing — the premium subscription, in
 * `feature/settings/PlanEntitlementsScreen` — and a coach is deliberately not
 * part of it: premium buys model lanes, never a character. The Stars shortcut
 * exists on the web and is stripped for Play, and the level door stays open to
 * everyone on both tiers. That is not a packaging decision: a roster where the
 * best-written character sits behind a paywall turns a wellness product into a
 * slot machine, and turns "earn an audience with the King" into a transaction.
 * Anything that routes this screen into a billing flow is that change, however
 * it is phrased.
 *
 * Entitlements come from the server and cache into Room, so the grid renders
 * offline from the last known state. The persona metadata is client-side
 * ([CoachRoster]), so a locked coach still has a name, a face and a reason.
 */
@HiltViewModel
class CoachSelectViewModel @Inject constructor(
    private val coachesRepository: CoachesRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(CoachSelectUiState())
    val uiState: StateFlow<CoachSelectUiState> = _uiState.asStateFlow()

    private val _events = Channel<CoachSelectEvent>(Channel.BUFFERED)
    val events: Flow<CoachSelectEvent> = _events.receiveAsFlow()

    /** XP never decreases, including across a stale roster read. */
    private val experience = MonotonicExperience()

    init {
        observeCache()
        refresh()
    }

    private fun observeCache() {
        viewModelScope.launch {
            coachesRepository.coaches().collect { entities ->
                _uiState.value = _uiState.value.copy(
                    loading = false,
                    cards = buildCards(entities, _uiState.value.experience?.level ?: 1),
                )
            }
        }
    }

    fun refresh() {
        viewModelScope.launch {
            when (val roster = coachesRepository.refreshRoster()) {
                is ApiResult.Success -> {
                    val merged = experience.accept(roster.data.experience)
                    _uiState.value = _uiState.value.copy(
                        loading = false,
                        rosterFailed = false,
                        experience = merged,
                        cards = buildCards(coachesRepository.coaches().first(), merged.level),
                    )
                }
                is ApiResult.Failure -> {
                    _uiState.value = _uiState.value.copy(
                        loading = false,
                        rosterFailed = _uiState.value.cards.isEmpty(),
                    )
                }
            }
        }
    }

    /**
     * Choose a coach. A locked one explains the door rather than shaking —
     * the requirement is the only place the progression system says what it is
     * for, so tapping it should teach, not refuse.
     */
    fun select(card: CoachCard) {
        if (!card.unlocked) {
            viewModelScope.launch {
                _events.send(
                    CoachSelectEvent.StillLocked(card.persona.name, card.requiredLevel),
                )
            }
            return
        }
        if (card.active) {
            viewModelScope.launch { _events.send(CoachSelectEvent.OpenChat) }
            return
        }
        _uiState.value = _uiState.value.copy(switchingCoachId = card.persona.id)
        viewModelScope.launch {
            when (val result = coachesRepository.selectCoach(card.persona.id)) {
                is ApiResult.Success -> {
                    _uiState.value = _uiState.value.copy(
                        switchingCoachId = null,
                        experience = experience.accept(result.data.experience),
                    )
                    _events.send(CoachSelectEvent.Switched(card.persona.firstName))
                }
                is ApiResult.Failure -> {
                    _uiState.value = _uiState.value.copy(switchingCoachId = null)
                    _events.send(CoachSelectEvent.SwitchFailed)
                }
            }
        }
    }

    /**
     * Join the client roster to the server's entitlements.
     *
     * Free coaches are unlocked without waiting for a payload, and a coach the
     * server has not reported on falls back to the level rule the client
     * already knows — so a cold, offline first launch shows a truthful grid
     * rather than nine locked strangers.
     */
    private fun buildCards(entities: List<CoachEntity>, level: Int): List<CoachCard> {
        val byId = entities.associateBy { it.coachId }
        val activeId = entities.firstOrNull { it.isActive }?.coachId ?: CoachRoster.DEFAULT_ID
        return CoachRoster.personas.map { persona ->
            val entity = byId[persona.id]
            val requiredLevel = entity?.requiredLevel?.takeIf { it > 0 } ?: persona.unlockLevel
            CoachCard(
                persona = persona,
                unlocked = entity?.unlocked
                    ?: (persona.isFree || level >= persona.unlockLevel),
                active = persona.id == activeId,
                requiredLevel = requiredLevel,
                bondXp = entity?.bondXp ?: 0,
                bondLevel = entity?.bondLevel ?: 1,
            )
        }
    }
}
