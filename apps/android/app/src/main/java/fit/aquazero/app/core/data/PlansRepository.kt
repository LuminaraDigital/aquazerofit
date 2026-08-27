package fit.aquazero.app.core.data

import fit.aquazero.app.core.database.TrainingDao
import fit.aquazero.app.core.database.TrainingPlanEntity
import fit.aquazero.app.core.database.WorkoutSessionEntity
import fit.aquazero.app.core.model.ApiResult
import fit.aquazero.app.core.model.AzfJson
import fit.aquazero.app.core.network.api.CompleteWorkoutRequest
import fit.aquazero.app.core.network.api.GeneratePlanRequest
import fit.aquazero.app.core.network.api.PlansApi
import fit.aquazero.app.core.network.api.SwapExerciseRequest
import fit.aquazero.app.core.network.api.WorkoutsApi
import fit.aquazero.app.core.model.TodayWorkoutEnvelopeDto
import fit.aquazero.app.core.model.TrainingPlanDto
import fit.aquazero.app.core.model.WorkoutSessionDto
import fit.aquazero.app.core.network.safeCall
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow

/**
 * Training plans + today's workout. Plan generation is an online-only AI
 * lane; the current plan and sessions cache into Room for offline reads.
 */
@Singleton
class PlansRepository @Inject constructor(
    private val plansApi: PlansApi,
    private val workoutsApi: WorkoutsApi,
    private val trainingDao: TrainingDao,
) {

    /** Cached current plan. */
    fun currentPlan(): Flow<TrainingPlanEntity?> = trainingDao.currentPlan()

    /** Cached session for a date (incl. in-session draft state). */
    fun sessionForDate(localDate: String): Flow<WorkoutSessionEntity?> =
        trainingDao.sessionForDate(localDate)

    /** Refresh the current plan into Room. */
    suspend fun refreshCurrentPlan(): ApiResult<TrainingPlanDto> =
        when (val result = safeCall { plansApi.current() }) {
            is ApiResult.Success -> {
                cachePlan(result.data.plan)
                ApiResult.Success(result.data.plan)
            }
            is ApiResult.Failure -> result
        }

    /** Generate a plan (online-only; deterministic fallback tolerated server-side). */
    suspend fun generatePlan(request: GeneratePlanRequest): ApiResult<TrainingPlanDto> =
        when (val result = safeCall { plansApi.generate(request) }) {
            is ApiResult.Success -> {
                cachePlan(result.data.plan)
                ApiResult.Success(result.data.plan)
            }
            is ApiResult.Failure -> result
        }

    /** Readiness (Protect / Maintain / Progress) — computed server-side in code. */
    suspend fun readiness() = safeCall { plansApi.readiness() }

    /**
     * The `/workouts/today` envelope, typed once ([TodayWorkoutEnvelopeDto]).
     * The session inside is cached for process-death recovery.
     */
    suspend fun todayWorkout(): ApiResult<TodayWorkoutEnvelopeDto> =
        when (val result = safeCall { workoutsApi.today() }) {
            is ApiResult.Success -> {
                result.data.session?.let { session ->
                    trainingDao.upsertSession(
                        WorkoutSessionEntity(
                            id = session.id,
                            planId = session.planId,
                            focus = session.focus,
                            status = session.status.name.lowercase(),
                            localDate = session.localDate,
                            docJson = AzfJson.encodeToString(
                                fit.aquazero.app.core.model.WorkoutSessionDto.serializer(),
                                session,
                            ),
                            cachedAt = System.currentTimeMillis(),
                        ),
                    )
                }
                result
            }
            is ApiResult.Failure -> result
        }

    /** One cached session by id, including its persisted draft columns. */
    suspend fun session(sessionId: String): WorkoutSessionEntity? = trainingDao.sessionById(sessionId)

    /**
     * Finish a session (online-only). On success the returned session replaces
     * the cached copy and the in-session draft is cleared — a completed
     * workout must never resurrect a half-finished draft.
     */
    suspend fun completeWorkout(
        sessionId: String,
        request: CompleteWorkoutRequest,
    ): ApiResult<WorkoutSessionDto> =
        when (val result = safeCall { workoutsApi.complete(sessionId, request) }) {
            is ApiResult.Success -> {
                cacheSession(result.data.session)
                trainingDao.clearDraft(sessionId)
                ApiResult.Success(result.data.session)
            }
            is ApiResult.Failure -> result
        }

    /** Swap one exercise for a same-muscle alternative; returns today's fresh envelope. */
    suspend fun swapExercise(
        sessionId: String,
        exerciseId: String,
        reason: String? = null,
    ): ApiResult<TodayWorkoutEnvelopeDto> =
        when (
            val result = safeCall {
                workoutsApi.swapExercise(sessionId, SwapExerciseRequest(exerciseId, reason))
            }
        ) {
            is ApiResult.Success -> {
                result.data.session?.let { cacheSession(it) }
                result
            }
            is ApiResult.Failure -> result
        }

    /** Persist mid-session draft state (survives process death). */
    suspend fun saveSessionDraft(sessionId: String, exerciseIndex: Int, setLogsJson: String?) =
        trainingDao.saveDraft(sessionId, exerciseIndex, setLogsJson, System.currentTimeMillis())

    /** Clear the draft after completion or abandonment. */
    suspend fun clearSessionDraft(sessionId: String) = trainingDao.clearDraft(sessionId)

    /**
     * Upsert a session document while preserving any in-session draft columns:
     * `@Upsert` replaces the whole row, and a background refresh must never
     * silently discard the sets the user has already tapped through.
     */
    private suspend fun cacheSession(session: WorkoutSessionDto) {
        val existing = trainingDao.sessionById(session.id)
        trainingDao.upsertSession(
            WorkoutSessionEntity(
                id = session.id,
                planId = session.planId,
                focus = session.focus,
                status = session.status.name.lowercase(),
                localDate = session.localDate,
                docJson = AzfJson.encodeToString(WorkoutSessionDto.serializer(), session),
                draftExerciseIndex = existing?.draftExerciseIndex ?: -1,
                draftSetLogsJson = existing?.draftSetLogsJson,
                draftUpdatedAtMs = existing?.draftUpdatedAtMs ?: 0L,
                cachedAt = System.currentTimeMillis(),
            ),
        )
    }

    private suspend fun cachePlan(plan: TrainingPlanDto) {
        trainingDao.clearCurrentPlan()
        trainingDao.upsertPlan(
            TrainingPlanEntity(
                id = plan.id,
                name = plan.name,
                startDate = plan.startDate,
                currentIteration = plan.currentIteration,
                docJson = AzfJson.encodeToString(TrainingPlanDto.serializer(), plan),
                isCurrent = true,
                cachedAt = System.currentTimeMillis(),
            ),
        )
    }
}
