package fit.aquazero.app.feature.training

import fit.aquazero.app.core.model.ApiResult
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TodaySessionErrorTest {

    @Test
    fun `no plan is an empty state, not a missing session`() {
        assertFalse(
            showTodaySessionError(todayError = true, hasPlan = false, planError = false),
        )
    }

    @Test
    fun `a failed session still shows when a plan is on screen`() {
        assertTrue(
            showTodaySessionError(todayError = true, hasPlan = true, planError = false),
        )
    }

    @Test
    fun `a 404 from today's workout means there is no plan`() {
        val failure = ApiResult.Failure.Api(
            httpStatus = 404,
            code = "NOT_FOUND",
            message = "No active training plan",
        )
        assertTrue(todayWorkoutMissingPlan(failure))
        assertFalse(
            todayWorkoutMissingPlan(ApiResult.Failure.Api(httpStatus = 500, code = "INTERNAL", message = "down")),
        )
    }
}
