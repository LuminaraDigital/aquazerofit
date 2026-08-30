package fit.aquazero.app.feature.training

import fit.aquazero.app.core.database.TrainingDao
import fit.aquazero.app.core.database.TrainingPlanEntity
import fit.aquazero.app.core.database.WorkoutSessionEntity
import fit.aquazero.app.core.model.PagedExercisesDto
import fit.aquazero.app.core.model.PlanEnvelopeDto
import fit.aquazero.app.core.model.ReadinessAssessmentDto
import fit.aquazero.app.core.model.ReadinessEnvelopeDto
import fit.aquazero.app.core.model.ReadinessMode
import fit.aquazero.app.core.model.TodayWorkoutEnvelopeDto
import fit.aquazero.app.core.model.TrainingPlanDto
import fit.aquazero.app.core.model.WorkoutSessionEnvelopeDto
import fit.aquazero.app.core.network.api.CompleteWorkoutRequest
import fit.aquazero.app.core.network.api.GeneratePlanRequest
import fit.aquazero.app.core.network.api.PlansApi
import fit.aquazero.app.core.network.api.SwapExerciseRequest
import fit.aquazero.app.core.network.api.WorkoutsApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.serialization.json.JsonObject
import java.io.IOException

/** In-memory [TrainingDao] with the draft columns the guided session uses. */
class FakeTrainingDao : TrainingDao {

    private val plans = MutableStateFlow<TrainingPlanEntity?>(null)
    val sessions = mutableMapOf<String, WorkoutSessionEntity>()
    private val sessionFlow = MutableStateFlow<WorkoutSessionEntity?>(null)

    override suspend fun upsertPlan(plan: TrainingPlanEntity) {
        plans.value = plan
    }

    override suspend fun clearCurrentPlan() {
        plans.value = plans.value?.copy(isCurrent = false)
    }

    override fun currentPlan(): Flow<TrainingPlanEntity?> = plans

    override suspend fun upsertSession(session: WorkoutSessionEntity) {
        sessions[session.id] = session
        sessionFlow.value = session
    }

    override suspend fun sessionById(id: String): WorkoutSessionEntity? = sessions[id]

    override fun sessionForDate(localDate: String): Flow<WorkoutSessionEntity?> = sessionFlow

    override suspend fun saveDraft(
        id: String,
        exerciseIndex: Int,
        setLogsJson: String?,
        nowMs: Long,
    ) {
        sessions[id] = (sessions[id] ?: return).copy(
            draftExerciseIndex = exerciseIndex,
            draftSetLogsJson = setLogsJson,
            draftUpdatedAtMs = nowMs,
        )
    }

    override suspend fun clearDraft(id: String) {
        sessions[id] = (sessions[id] ?: return).copy(
            draftExerciseIndex = -1,
            draftSetLogsJson = null,
            draftUpdatedAtMs = 0L,
        )
    }

    override suspend fun clearAllSessions() {
        sessions.clear()
        sessionFlow.value = null
    }

    override suspend fun clearAllPlans() {
        plans.value = null
    }

    override suspend fun clearAllTraining() {
        clearAllSessions()
        clearAllPlans()
    }
}

/** [PlansApi] fake; [plan] null makes every call fail like an offline device. */
class FakePlansApi(
    var plan: TrainingPlanDto? = null,
    var generated: TrainingPlanDto? = null,
) : PlansApi {

    var generateCalls = 0
        private set

    var lastGenerateRequest: GeneratePlanRequest? = null
        private set

    override suspend fun current(): PlanEnvelopeDto =
        PlanEnvelopeDto(plan ?: throw IOException("offline"))

    override suspend fun readiness(): ReadinessEnvelopeDto = ReadinessEnvelopeDto(
        ReadinessAssessmentDto(mode = ReadinessMode.MAINTAIN, score = 50),
    )

    override suspend fun generate(body: GeneratePlanRequest): PlanEnvelopeDto {
        generateCalls++
        lastGenerateRequest = body
        return PlanEnvelopeDto(generated ?: plan ?: throw IOException("offline"))
    }
}

/** [WorkoutsApi] fake recording the completion payload the session submits. */
class FakeWorkoutsApi(
    var todayEnvelope: TodayWorkoutEnvelopeDto? = null,
) : WorkoutsApi {

    var lastCompleteRequest: CompleteWorkoutRequest? = null
        private set

    var completeCalls = 0
        private set

    /** When true, `complete` behaves like a dropped connection. */
    var completeFailsOffline = false

    override suspend fun today(): TodayWorkoutEnvelopeDto =
        todayEnvelope ?: throw IOException("offline")

    override suspend fun stats(weeks: Int): JsonObject = JsonObject(emptyMap())

    override suspend fun libraryExercises(
        limit: Int,
        offset: Int,
        search: String?,
        category: String?,
        muscle: String?,
        equipment: String?,
    ): PagedExercisesDto = PagedExercisesDto(emptyList(), 0, limit, offset)

    override suspend fun complete(
        sessionId: String,
        body: CompleteWorkoutRequest,
    ): WorkoutSessionEnvelopeDto {
        completeCalls++
        lastCompleteRequest = body
        if (completeFailsOffline) throw IOException("offline")
        val session = todayEnvelope?.session ?: throw IOException("offline")
        return WorkoutSessionEnvelopeDto(session)
    }

    override suspend fun swapExercise(
        sessionId: String,
        body: SwapExerciseRequest,
    ): TodayWorkoutEnvelopeDto = todayEnvelope ?: throw IOException("offline")
}

class FakeCoachesRepository : fit.aquazero.app.core.data.CoachesRepository(
    coachesApi = object : fit.aquazero.app.core.network.api.CoachesApi {
        override suspend fun roster(): fit.aquazero.app.core.model.CoachRosterDto =
            fit.aquazero.app.core.model.CoachRosterDto(activeCoachId = fit.aquazero.app.core.ui.CoachRoster.DEFAULT_ID)
        override suspend fun select(
            body: fit.aquazero.app.core.model.CoachSelectRequest,
        ): fit.aquazero.app.core.model.CoachRosterDto =
            fit.aquazero.app.core.model.CoachRosterDto(activeCoachId = body.coachId)
        override suspend fun progression(): fit.aquazero.app.core.model.ProgressionStatusDto =
            fit.aquazero.app.core.model.ProgressionStatusDto()
        override suspend fun ackReactions(body: fit.aquazero.app.core.model.ReactionAckRequest) = Unit
    },
    catalogDao = object : fit.aquazero.app.core.database.CatalogDao {
        override suspend fun upsertFoods(foods: List<fit.aquazero.app.core.database.FoodEntity>) = Unit
        override suspend fun searchCachedFoods(
            query: String,
            limit: Int,
        ) = emptyList<fit.aquazero.app.core.database.FoodEntity>()
        override suspend fun foodById(id: String) = null
        override fun recentFoods(
            limit: Int,
        ) = kotlinx.coroutines.flow.flowOf(emptyList<fit.aquazero.app.core.database.FoodEntity>())
        override suspend fun touchFood(id: String, nowMs: Long) = Unit
        override suspend fun upsertRecipes(recipes: List<fit.aquazero.app.core.database.RecipeEntity>) = Unit
        override fun recipes() = kotlinx.coroutines.flow.flowOf(
            emptyList<fit.aquazero.app.core.database.RecipeEntity>(),
        )
        override suspend fun recipeById(id: String) = null
        override suspend fun upsertExercises(exercises: List<fit.aquazero.app.core.database.ExerciseEntity>) = Unit
        override suspend fun upsertExerciseMedia(media: List<fit.aquazero.app.core.database.ExerciseMediaEntity>) = Unit
        override suspend fun clearMediaFor(exerciseIds: List<String>) = Unit
        override fun exercisesPage(
            query: String,
            category: String?,
            limit: Int,
            offset: Int,
        ) = kotlinx.coroutines.flow.flowOf(emptyList<fit.aquazero.app.core.database.ExerciseEntity>())
        override suspend fun exerciseById(id: String) = null
        override suspend fun mediaFor(
            exerciseId: String,
        ) = emptyList<fit.aquazero.app.core.database.ExerciseMediaEntity>()
        override suspend fun thumbnailsFor(
            exerciseIds: List<String>,
        ) = emptyList<fit.aquazero.app.core.database.ExerciseThumbnail>()
        override suspend fun exerciseCount() = 0
        override suspend fun upsertCoaches(coaches: List<fit.aquazero.app.core.database.CoachEntity>) = Unit
        override fun coaches() = kotlinx.coroutines.flow.flowOf(emptyList<fit.aquazero.app.core.database.CoachEntity>())
        override fun activeCoach() = kotlinx.coroutines.flow.flowOf(null)
    },
) {
    override fun activeCoachId(): kotlinx.coroutines.flow.Flow<String?> =
        kotlinx.coroutines.flow.flowOf(fit.aquazero.app.core.ui.CoachRoster.DEFAULT_ID)
}
