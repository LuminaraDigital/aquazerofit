package fit.aquazero.app.feature.training

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import fit.aquazero.app.core.common.LocalDates
import fit.aquazero.app.core.data.PlansRepository
import fit.aquazero.app.core.model.ApiResult
import fit.aquazero.app.core.model.AzfJson
import fit.aquazero.app.core.model.SetLogDto
import fit.aquazero.app.core.model.WorkoutSessionDto
import fit.aquazero.app.core.network.api.CompleteWorkoutRequest
import fit.aquazero.app.core.network.api.CompletedExerciseInput
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import javax.inject.Inject
import kotlin.math.max
import kotlin.math.roundToInt

/** The four phases of a guided session. */
enum class SessionPhase { OVERVIEW, WORK, REST, SUMMARY }

/** Per-set actuals the user can adjust before tapping "done". */
data class ActualInput(
    val weightKg: String = "",
    val reps: String = "",
    val rir: String = "",
)

/**
 * Everything about an in-flight session that must survive process death.
 * Persisted twice: as JSON in [SavedStateHandle] (fast path, survives the
 * system killing the process while the task is alive) and in the Room session
 * draft (survives the task being reaped entirely, and a later cold start).
 */
@Serializable
data class SessionDraft(
    val phase: String = SessionPhase.OVERVIEW.name,
    val exerciseIndex: Int = 0,
    val setsDone: List<Int> = emptyList(),
    val skipped: List<Boolean> = emptyList(),
    val setLogs: List<List<SetLogDto>> = emptyList(),
    val startedAtMs: Long = 0L,
    val restLeftSeconds: Int = 0,
    val restTotalSeconds: Int = 0,
) {
    /** True once the user has actually started — an untouched overview is not a draft. */
    val isActive: Boolean
        get() = startedAtMs > 0L && phase != SessionPhase.OVERVIEW.name
}

/** A11y announcement payload; the screen resolves it to a localized string. */
sealed interface SessionAnnouncement {
    data class Started(val exerciseName: String) : SessionAnnouncement
    data class NextExercise(val exerciseName: String) : SessionAnnouncement
    data class SetDone(val setNumber: Int, val totalSets: Int, val restSeconds: Int) :
        SessionAnnouncement

    data object RestComplete : SessionAnnouncement
    data object RestSkipped : SessionAnnouncement
    data object Finished : SessionAnnouncement
    data class Restored(val exerciseNumber: Int, val total: Int) : SessionAnnouncement
}

/** Announcement plus a monotonic id so identical messages still re-announce. */
data class AnnouncementSlot(val id: Long, val announcement: SessionAnnouncement)

/** Immutable state of the guided session screen. */
data class WorkoutSessionUiState(
    val loading: Boolean = true,
    val loadError: Boolean = false,
    val session: WorkoutSessionDto? = null,
    val entries: List<ResolvedEntry> = emptyList(),
    val phase: SessionPhase = SessionPhase.OVERVIEW,
    val exerciseIndex: Int = 0,
    val setsDone: List<Int> = emptyList(),
    val skipped: List<Boolean> = emptyList(),
    val setLogs: List<List<SetLogDto>> = emptyList(),
    val actual: ActualInput = ActualInput(),
    val restLeftSeconds: Int = 0,
    val restTotalSeconds: Int = 0,
    val startedAtMs: Long = 0L,
    val completing: Boolean = false,
    val restoredFromDraft: Boolean = false,
    val announcement: AnnouncementSlot? = null,
) {
    val totalSets: Int get() = entries.sumOf { it.sets }

    val completedSets: Int get() = setsDone.sum()

    val current: ResolvedEntry? get() = entries.getOrNull(exerciseIndex)

    val nextUp: ResolvedEntry? get() = entries.getOrNull(exerciseIndex + 1)

    /** Sets already banked for the current exercise. */
    val currentSetsDone: Int get() = setsDone.getOrElse(exerciseIndex) { 0 }

    val progress: Float
        get() = if (totalSets <= 0) 0f else completedSets.toFloat() / totalSets.toFloat()

    val restProgress: Float
        get() = if (restTotalSeconds <= 0) {
            0f
        } else {
            ((restTotalSeconds - restLeftSeconds).toFloat() / restTotalSeconds.toFloat())
                .coerceIn(0f, 1f)
        }

    /** True while the screen must hold the display awake. */
    val keepScreenOn: Boolean
        get() = phase == SessionPhase.WORK || phase == SessionPhase.REST
}

/** One-shot effects from the session screen. */
sealed interface WorkoutSessionEvent {
    data object Completed : WorkoutSessionEvent
    data object CompleteOffline : WorkoutSessionEvent
    data class CompleteFailed(val message: String?) : WorkoutSessionEvent
}

/**
 * The guided session.
 *
 * Deliberate upgrade over the web: the web loses the whole session on a
 * refresh. Here every state transition writes a [SessionDraft] to both
 * [SavedStateHandle] and the Room session draft, so a process kill mid-workout
 * resumes on exactly the set the user was on.
 */
@HiltViewModel
class WorkoutSessionViewModel @Inject constructor(
    private val plansRepository: PlansRepository,
    private val savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val _uiState = MutableStateFlow(WorkoutSessionUiState())
    val uiState: StateFlow<WorkoutSessionUiState> = _uiState.asStateFlow()

    private val _events = Channel<WorkoutSessionEvent>(Channel.BUFFERED)
    val events: Flow<WorkoutSessionEvent> = _events.receiveAsFlow()

    /** Overridable clock so duration maths is deterministic under test. */
    internal var clock: () -> Long = { System.currentTimeMillis() }

    private var sessionId: String = ""
    private var restJob: Job? = null
    private var announcementId = 0L

    /** Load a session and restore any draft left behind by a previous process. */
    fun start(sessionId: String) {
        if (this.sessionId == sessionId && !_uiState.value.loading) return
        this.sessionId = sessionId
        viewModelScope.launch { load(sessionId) }
    }

    // ----- session lifecycle -----

    fun startSession() {
        val state = _uiState.value
        if (state.entries.isEmpty()) return
        stopRest()
        _uiState.value = state.copy(
            phase = SessionPhase.WORK,
            exerciseIndex = 0,
            startedAtMs = clock(),
            restoredFromDraft = false,
            announcement = announce(
                SessionAnnouncement.Started(state.entries.first().name),
            ),
        ).withPrefilledActuals(0)
        persistDraft()
    }

    /**
     * Bank one set: record the actuals, then either rest or advance. The
     * target prescription stays authoritative — the user only confirms what
     * actually happened.
     */
    fun completeSet() {
        val state = _uiState.value
        val entry = state.current ?: return
        val index = state.exerciseIndex
        val setNumber = (state.currentSetsDone + 1).coerceAtMost(entry.sets)

        val setsDone = state.setsDone.toMutableList().also { it[index] = setNumber }
        val logs = state.setLogs.map { it.toMutableList() }.toMutableList()
        logs[index].add(state.actual.toSetLog(setNumber, entry))

        val finishedExercise = setNumber >= entry.sets
        val updated = state.copy(setsDone = setsDone, setLogs = logs)
        _uiState.value = when {
            finishedExercise -> updated.advanceFrom(index)
            else -> updated.copy(
                phase = SessionPhase.REST,
                restLeftSeconds = entry.restSeconds,
                restTotalSeconds = entry.restSeconds,
                announcement = announce(
                    SessionAnnouncement.SetDone(setNumber, entry.sets, entry.restSeconds),
                ),
            )
        }
        if (_uiState.value.phase == SessionPhase.REST) startRestCountdown()
        persistDraft()
    }

    /** Skip the rest of an exercise; nothing is marked as a failure. */
    fun skipExercise() {
        val state = _uiState.value
        val index = state.exerciseIndex
        if (state.entries.getOrNull(index) == null) return
        val skipped = state.skipped.toMutableList().also { it[index] = true }
        stopRest()
        _uiState.value = state.copy(skipped = skipped).advanceFrom(index)
        persistDraft()
    }

    fun skipRest() {
        stopRest()
        _uiState.value = _uiState.value.copy(
            phase = SessionPhase.WORK,
            restLeftSeconds = 0,
            announcement = announce(SessionAnnouncement.RestSkipped),
        )
        persistDraft()
    }

    fun onWeightChange(value: String) = updateActual { it.copy(weightKg = value) }

    fun onRepsChange(value: String) = updateActual { it.copy(reps = value) }

    fun onRirChange(value: String) = updateActual { it.copy(rir = value) }

    /** Summary stepper: nudge one exercise's set count down (and trim its logs). */
    fun decrementSets(index: Int) {
        val state = _uiState.value
        val next = (state.setsDone.getOrElse(index) { 0 } - 1).coerceAtLeast(0)
        val setsDone = state.setsDone.toMutableList().also { it[index] = next }
        val logs = state.setLogs.mapIndexed { i, list ->
            if (i == index) list.take(next) else list
        }
        _uiState.value = state.copy(setsDone = setsDone, setLogs = logs)
        persistDraft()
    }

    /** Summary stepper: nudge one exercise's set count up. */
    fun incrementSets(index: Int) {
        val state = _uiState.value
        val next = (state.setsDone.getOrElse(index) { 0 } + 1).coerceAtMost(MAX_SETS)
        val setsDone = state.setsDone.toMutableList().also { it[index] = next }
        _uiState.value = state.copy(setsDone = setsDone)
        persistDraft()
    }

    /** Leave the summary without discarding anything. */
    fun backToWorkout() {
        _uiState.value = _uiState.value.copy(phase = SessionPhase.WORK)
        persistDraft()
    }

    fun openSummary() {
        stopRest()
        _uiState.value = _uiState.value.copy(
            phase = SessionPhase.SUMMARY,
            announcement = announce(SessionAnnouncement.Finished),
        )
        persistDraft()
    }

    /** Elapsed session time, floored at one minute. */
    fun durationMinutes(): Int {
        val started = _uiState.value.startedAtMs
        if (started <= 0L) return 1
        return max(1, ((clock() - started) / MILLIS_PER_MINUTE.toDouble()).roundToInt())
    }

    /**
     * Finish the session. Online-only: a transport failure keeps the draft
     * intact and says so, rather than pretending the workout was lost.
     */
    fun completeWorkout() {
        val state = _uiState.value
        if (state.completing || state.session == null) return
        _uiState.value = state.copy(completing = true)
        viewModelScope.launch {
            val request = CompleteWorkoutRequest(
                exercises = state.entries.mapIndexed { index, entry ->
                    val logs = state.setLogs.getOrElse(index) { emptyList() }
                    CompletedExerciseInput(
                        exerciseId = entry.exerciseId,
                        setsCompleted = state.setsDone.getOrElse(index) { 0 },
                        skipped = state.skipped.getOrElse(index) { false },
                        weightKg = logs.lastOrNull()?.weightKg,
                        rir = logs.lastOrNull()?.rir,
                        setLogs = logs.ifEmpty { null },
                    )
                },
                durationMinutes = durationMinutes(),
                localDate = LocalDates.today(),
            )
            when (val result = plansRepository.completeWorkout(sessionId, request)) {
                is ApiResult.Success -> {
                    savedStateHandle.remove<String>(KEY_DRAFT)
                    _uiState.value = _uiState.value.copy(
                        completing = false,
                        session = result.data,
                    )
                    _events.send(WorkoutSessionEvent.Completed)
                }

                is ApiResult.Failure.Network -> {
                    _uiState.value = _uiState.value.copy(completing = false)
                    _events.send(WorkoutSessionEvent.CompleteOffline)
                }

                is ApiResult.Failure.Api -> {
                    _uiState.value = _uiState.value.copy(completing = false)
                    _events.send(WorkoutSessionEvent.CompleteFailed(result.message))
                }

                // The draft is deliberately kept: the session may not have been
                // recorded, and losing the sets would be worse than a retry.
                is ApiResult.Failure.Malformed -> {
                    _uiState.value = _uiState.value.copy(completing = false)
                    _events.send(WorkoutSessionEvent.CompleteFailed(null))
                }
            }
        }
    }

    override fun onCleared() {
        stopRest()
        super.onCleared()
    }

    // ----- internals -----

    private suspend fun load(sessionId: String) {
        // Cache first so the screen paints instantly and works offline; the
        // network refresh then supplies the pre-computed `resolved` targets.
        val cached = plansRepository.session(sessionId)
        val cachedSession = cached?.let {
            runCatching {
                AzfJson.decodeFromString(WorkoutSessionDto.serializer(), it.docJson)
            }.getOrNull()
        }
        if (cachedSession != null) {
            applySession(cachedSession, resolveFromSession(cachedSession.exercises))
        }

        when (val result = plansRepository.todayWorkout()) {
            is ApiResult.Success -> {
                val envelope = result.data
                val session = envelope.session
                if (session != null) {
                    applySession(session, resolveEntries(envelope))
                } else {
                    _uiState.value = _uiState.value.copy(
                        loading = false,
                        loadError = cachedSession == null,
                    )
                }
            }

            is ApiResult.Failure -> _uiState.value = _uiState.value.copy(
                loading = false,
                loadError = cachedSession == null,
            )
        }
        restoreDraft(cached?.draftSetLogsJson)
    }

    private fun applySession(session: WorkoutSessionDto, entries: List<ResolvedEntry>) {
        val state = _uiState.value
        val sameShape = state.entries.size == entries.size
        _uiState.value = state.copy(
            loading = false,
            loadError = false,
            session = session,
            entries = entries,
            setsDone = if (sameShape && state.setsDone.isNotEmpty()) {
                state.setsDone
            } else {
                List(entries.size) { 0 }
            },
            skipped = if (sameShape && state.skipped.isNotEmpty()) {
                state.skipped
            } else {
                List(entries.size) { false }
            },
            setLogs = if (sameShape && state.setLogs.isNotEmpty()) {
                state.setLogs
            } else {
                List(entries.size) { emptyList() }
            },
        ).withPrefilledActuals(state.exerciseIndex)
    }

    /**
     * Restore an interrupted session. The SavedStateHandle copy wins because
     * it is always at least as fresh as the Room copy; the Room draft is the
     * cold-start fallback.
     */
    private fun restoreDraft(roomDraftJson: String?) {
        val draft = decodeDraft(savedStateHandle[KEY_DRAFT])
            ?: decodeDraft(roomDraftJson)
            ?: return
        if (!draft.isActive) return
        val state = _uiState.value
        if (state.entries.isEmpty()) return
        // A plan that changed shape underneath a draft is not resumable.
        if (draft.setsDone.size != state.entries.size) return

        val phase = runCatching { SessionPhase.valueOf(draft.phase) }
            .getOrDefault(SessionPhase.WORK)
        val index = draft.exerciseIndex.coerceIn(0, state.entries.lastIndex)
        _uiState.value = state.copy(
            phase = phase,
            exerciseIndex = index,
            setsDone = draft.setsDone,
            skipped = draft.skipped.takeIf { it.size == state.entries.size }
                ?: List(state.entries.size) { false },
            setLogs = draft.setLogs.takeIf { it.size == state.entries.size }
                ?: List(state.entries.size) { emptyList() },
            startedAtMs = draft.startedAtMs,
            restLeftSeconds = draft.restLeftSeconds,
            restTotalSeconds = draft.restTotalSeconds,
            restoredFromDraft = true,
            announcement = announce(
                SessionAnnouncement.Restored(index + 1, state.entries.size),
            ),
        ).withPrefilledActuals(index)
        if (phase == SessionPhase.REST && draft.restLeftSeconds > 0) startRestCountdown()
    }

    private fun persistDraft() {
        val state = _uiState.value
        val draft = SessionDraft(
            phase = state.phase.name,
            exerciseIndex = state.exerciseIndex,
            setsDone = state.setsDone,
            skipped = state.skipped,
            setLogs = state.setLogs,
            startedAtMs = state.startedAtMs,
            restLeftSeconds = state.restLeftSeconds,
            restTotalSeconds = state.restTotalSeconds,
        )
        val json = AzfJson.encodeToString(SessionDraft.serializer(), draft)
        savedStateHandle[KEY_DRAFT] = json
        if (sessionId.isEmpty()) return
        viewModelScope.launch {
            plansRepository.saveSessionDraft(sessionId, state.exerciseIndex, json)
        }
    }

    private fun startRestCountdown() {
        stopRest()
        restJob = viewModelScope.launch {
            while (_uiState.value.restLeftSeconds > 0 &&
                _uiState.value.phase == SessionPhase.REST
            ) {
                delay(SECOND_MS)
                val state = _uiState.value
                if (state.phase != SessionPhase.REST) return@launch
                val left = state.restLeftSeconds - 1
                _uiState.value = if (left <= 0) {
                    state.copy(
                        restLeftSeconds = 0,
                        phase = SessionPhase.WORK,
                        announcement = announce(SessionAnnouncement.RestComplete),
                    )
                } else {
                    state.copy(restLeftSeconds = left)
                }
            }
            persistDraft()
        }
    }

    private fun stopRest() {
        restJob?.cancel()
        restJob = null
    }

    private fun updateActual(transform: (ActualInput) -> ActualInput) {
        _uiState.value = _uiState.value.copy(actual = transform(_uiState.value.actual))
    }

    private fun announce(announcement: SessionAnnouncement): AnnouncementSlot =
        AnnouncementSlot(++announcementId, announcement)

    /** Move past [index]: next exercise, or the summary when it was the last. */
    private fun WorkoutSessionUiState.advanceFrom(index: Int): WorkoutSessionUiState {
        stopRest()
        val next = index + 1
        return if (next < entries.size) {
            copy(
                exerciseIndex = next,
                phase = SessionPhase.WORK,
                restLeftSeconds = 0,
                restTotalSeconds = 0,
                announcement = announce(SessionAnnouncement.NextExercise(entries[next].name)),
            ).withPrefilledActuals(next)
        } else {
            copy(
                phase = SessionPhase.SUMMARY,
                restLeftSeconds = 0,
                restTotalSeconds = 0,
                announcement = announce(SessionAnnouncement.Finished),
            )
        }
    }

    /** Seed the actuals inputs from the resolved targets for [index]. */
    private fun WorkoutSessionUiState.withPrefilledActuals(index: Int): WorkoutSessionUiState {
        val entry = entries.getOrNull(index) ?: return copy(actual = ActualInput())
        return copy(
            actual = ActualInput(
                weightKg = entry.weightKg?.let { TrainingFormat.number(it) }.orEmpty(),
                reps = entry.reps.takeIf { it > 0 }?.toString().orEmpty(),
                rir = entry.rir?.let { TrainingFormat.number(it) }.orEmpty(),
            ),
        )
    }

    private fun decodeDraft(json: String?): SessionDraft? {
        if (json.isNullOrBlank()) return null
        return runCatching {
            AzfJson.decodeFromString(SessionDraft.serializer(), json)
        }.getOrNull()
    }

    private fun ActualInput.toSetLog(setNumber: Int, entry: ResolvedEntry): SetLogDto {
        val parsedReps = reps.trim().toIntOrNull()
        val parsedWeight = weightKg.trim().replace(',', '.').toDoubleOrNull()
        val parsedRir = rir.trim().replace(',', '.').toDoubleOrNull()
        return SetLogDto(
            set = setNumber,
            reps = parsedReps?.takeIf { it > 0 } ?: entry.reps,
            weightKg = parsedWeight?.takeIf { it >= 0 },
            rir = parsedRir?.takeIf { it >= 0 },
            completed = true,
        )
    }

    companion object {
        /** SavedStateHandle key for the serialized [SessionDraft]. */
        const val KEY_DRAFT = "azf.session.draft"

        private const val SECOND_MS = 1_000L
        private const val MILLIS_PER_MINUTE = 60_000L

        /** Upper bound on the summary stepper, matching the web. */
        private const val MAX_SETS = 20
    }
}
