package fit.aquazero.app.feature.training

import fit.aquazero.app.core.model.BarcodeLookupDto
import fit.aquazero.app.core.model.ExerciseDto
import fit.aquazero.app.core.model.ExerciseEnvelopeDto
import fit.aquazero.app.core.model.FoodEnvelopeDto
import fit.aquazero.app.core.model.FoodsSearchDto
import fit.aquazero.app.core.model.PagedExercisesDto
import fit.aquazero.app.core.model.PlanEnvelopeDto
import fit.aquazero.app.core.model.ReadinessAssessmentDto
import fit.aquazero.app.core.model.ReadinessEnvelopeDto
import fit.aquazero.app.core.model.ReadinessMode
import fit.aquazero.app.core.model.RecipeEnvelopeDto
import fit.aquazero.app.core.model.RecipesDto
import fit.aquazero.app.core.model.TodayWorkoutEnvelopeDto
import fit.aquazero.app.core.model.TrainingPlanDto
import fit.aquazero.app.core.model.WorkoutSessionEnvelopeDto
import fit.aquazero.app.core.network.api.CompleteWorkoutRequest
import fit.aquazero.app.core.network.api.ExercisesApi
import fit.aquazero.app.core.network.api.FoodsApi
import fit.aquazero.app.core.network.api.GeneratePlanRequest
import fit.aquazero.app.core.network.api.PlansApi
import fit.aquazero.app.core.network.api.RecipesApi
import fit.aquazero.app.core.network.api.SwapExerciseRequest
import fit.aquazero.app.core.network.api.WorkoutsApi
import kotlinx.serialization.json.JsonObject
import java.io.IOException

/**
 * Retrofit-interface fakes for the screen tests.
 *
 * Deliberately separate from the identically-shaped fakes in `src/test`: those
 * are not on this source set's classpath, and copying them here rather than
 * sharing a module keeps each suite's fixtures editable without breaking the
 * other. `IOException` is the shape `safeCall` maps to
 * `ApiResult.Failure.Network`, so "offline" is expressed the way OkHttp
 * expresses it.
 */
internal class FakeExercisesApi(
    /** The whole corpus the catalog refresh will cache, or null for offline. */
    var corpus: List<ExerciseDto>? = emptyList(),
) : ExercisesApi {

    override suspend fun exercises(
        limit: Int,
        offset: Int,
        search: String?,
        category: String?,
        muscle: String?,
        equipment: String?,
        respectProfile: Boolean?,
    ): PagedExercisesDto {
        val items = corpus ?: throw IOException("offline")
        return PagedExercisesDto(
            items = items.drop(offset).take(limit),
            total = items.size,
            limit = limit,
            offset = offset,
        )
    }

    override suspend fun exercise(id: String): ExerciseEnvelopeDto =
        ExerciseEnvelopeDto(
            corpus?.firstOrNull { it.id == id } ?: throw IOException("offline"),
        )
}

/** Foods are not exercised by the library screen; every call is offline. */
internal class FakeFoodsApi : FoodsApi {
    override suspend fun search(search: String, limit: Int): FoodsSearchDto =
        throw IOException("offline")

    override suspend fun barcode(code: String): BarcodeLookupDto = throw IOException("offline")

    override suspend fun food(id: String): FoodEnvelopeDto = throw IOException("offline")
}

/** Recipes are not exercised by the library screen; every call is offline. */
internal class FakeRecipesApi : RecipesApi {
    override suspend fun recipes(search: String?, tag: String?, limit: Int): RecipesDto =
        throw IOException("offline")

    override suspend fun recipe(id: String): RecipeEnvelopeDto = throw IOException("offline")
}

/** [PlansApi] fake; a null [plan] makes every call behave like a dead network. */
internal class FakePlansApi(
    var plan: TrainingPlanDto? = null,
) : PlansApi {

    override suspend fun current(): PlanEnvelopeDto =
        PlanEnvelopeDto(plan ?: throw IOException("offline"))

    override suspend fun readiness(): ReadinessEnvelopeDto = ReadinessEnvelopeDto(
        ReadinessAssessmentDto(mode = ReadinessMode.MAINTAIN, score = 50),
    )

    override suspend fun generate(body: GeneratePlanRequest): PlanEnvelopeDto =
        PlanEnvelopeDto(plan ?: throw IOException("offline"))
}

/** [WorkoutsApi] fake; a null [todayEnvelope] behaves like a dead network. */
internal class FakeWorkoutsApi(
    var todayEnvelope: TodayWorkoutEnvelopeDto? = null,
) : WorkoutsApi {

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
    ): WorkoutSessionEnvelopeDto = WorkoutSessionEnvelopeDto(
        todayEnvelope?.session ?: throw IOException("offline"),
    )

    override suspend fun swapExercise(
        sessionId: String,
        body: SwapExerciseRequest,
    ): TodayWorkoutEnvelopeDto = todayEnvelope ?: throw IOException("offline")
}
