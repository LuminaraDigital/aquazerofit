package fit.aquazero.app.core.data

import fit.aquazero.app.core.database.TrainingDao
import fit.aquazero.app.core.database.TrainingPlanEntity
import fit.aquazero.app.core.database.WorkoutSessionEntity
import fit.aquazero.app.core.network.ApiResult
import fit.aquazero.app.core.network.AzfJson
import fit.aquazero.app.core.network.api.GeneratePlanRequest
import fit.aquazero.app.core.network.api.PlansApi
import fit.aquazero.app.core.network.api.WorkoutsApi
import fit.aquazero.app.core.network.dto.TodayWorkoutEnvelopeDto
import fit.aquazero.app.core.network.dto.TrainingPlanDto
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
                                fit.aquazero.app.core.network.dto.WorkoutSessionDto.serializer(),
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

    /** Persist mid-session draft state (survives process death). */
    suspend fun saveSessionDraft(sessionId: String, exerciseIndex: Int, setLogsJson: String?) =
        trainingDao.saveDraft(sessionId, exerciseIndex, setLogsJson, System.currentTimeMillis())

    /** Clear the draft after completion or abandonment. */
    suspend fun clearSessionDraft(sessionId: String) = trainingDao.clearDraft(sessionId)

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
