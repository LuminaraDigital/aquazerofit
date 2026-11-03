package fit.aquazero.app.core.data

import fit.aquazero.app.core.database.TrainingPlanEntity
import fit.aquazero.app.core.database.WorkoutSessionEntity
import fit.aquazero.app.core.model.ApiResult
import fit.aquazero.app.core.model.PlanDayDto
import fit.aquazero.app.core.model.PlanEnvelopeDto
import fit.aquazero.app.core.model.ReadinessEnvelopeDto
import fit.aquazero.app.core.model.TrainingPlanDto
import fit.aquazero.app.core.network.api.GeneratePlanRequest
import fit.aquazero.app.core.network.api.PlansApi
import fit.aquazero.app.feature.training.FakeTrainingDao
import fit.aquazero.app.feature.training.FakeWorkoutsApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response
import java.io.IOException

/**
 * The current plan is cached so Workouts works offline. A later GET that
 * says the account has no plan has to drop that row, or the screen keeps
 * drawing the deleted week. Anything else in the database stays.
 */
class PlansRepositoryTest {

    @Test
    fun `a 404 removes the cached current plan and leaves sessions and older plans`() = runTest {
        val dao = FakeTrainingDao()
        val (repository, api) = seedCurrentPlan(dao)
        dao.upsertPlan(TrainingPlanEntity(id = "plan-old", name = "Old", docJson = "{}", isCurrent = false))
        dao.upsertSession(WorkoutSessionEntity(id = "session-1", planId = "plan-current", docJson = "{}"))
        api.currentThrowable = notFound()

        val result = repository.refreshCurrentPlan()

        assertTrue(result is ApiResult.Failure.Api)
        assertEquals(404, (result as ApiResult.Failure.Api).httpStatus)
        assertNull(repository.currentPlan().first())
        assertEquals(listOf("plan-old"), dao.storedPlans().map { it.id })
        val session = dao.sessionById("session-1")
        assertNotNull(session)
        assertEquals("plan-current", session!!.planId)
    }

    @Test
    fun `a dropped connection keeps the cached plan`() = runTest {
        val (repository, api) = seedCurrentPlan()
        api.currentThrowable = IOException("offline")

        val result = repository.refreshCurrentPlan()

        assertTrue(result is ApiResult.Failure.Network)
        assertEquals("plan-current", repository.currentPlan().first()!!.id)
    }

    @Test
    fun `a server error keeps the cached plan`() = runTest {
        val (repository, api) = seedCurrentPlan()
        api.currentThrowable = httpStatus(500, "INTERNAL")

        val result = repository.refreshCurrentPlan()

        assertTrue(result is ApiResult.Failure.Api)
        assertEquals(500, (result as ApiResult.Failure.Api).httpStatus)
        assertEquals("plan-current", repository.currentPlan().first()!!.id)
    }

    private suspend fun seedCurrentPlan(
        dao: FakeTrainingDao = FakeTrainingDao(),
    ): Pair<PlansRepository, PlansApiStub> {
        val api = PlansApiStub(samplePlan())
        val repository = PlansRepository(api, FakeWorkoutsApi(), dao)
        val seeded = repository.refreshCurrentPlan()
        check(seeded is ApiResult.Success)
        return repository to api
    }

    private fun samplePlan() = TrainingPlanDto(
        id = "plan-current",
        userId = "user-1",
        name = "Strength",
        startDate = "2026-08-01",
        days = listOf(
            PlanDayDto(order = 1, focus = "Push", isRest = false),
            PlanDayDto(order = 2, focus = "Rest", isRest = true),
        ),
        createdAt = "2026-08-01T00:00:00Z",
    )

    private fun notFound(): HttpException = httpStatus(404, "NOT_FOUND")

    private fun httpStatus(status: Int, code: String): HttpException = HttpException(
        Response.error<Unit>(
            status,
            """{"code":"$code","message":"No active training plan yet"}"""
                .toResponseBody("application/json".toMediaType()),
        ),
    )

    private class PlansApiStub(
        private val plan: TrainingPlanDto,
    ) : PlansApi {
        var currentThrowable: Throwable? = null

        override suspend fun current(): PlanEnvelopeDto {
            currentThrowable?.let { throw it }
            return PlanEnvelopeDto(plan)
        }

        override suspend fun readiness(): ReadinessEnvelopeDto = error("readiness is not used here")

        override suspend fun generate(body: GeneratePlanRequest): PlanEnvelopeDto =
            error("generate is not used here")
    }
}
