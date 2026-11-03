package fit.aquazero.app.feature.training

import fit.aquazero.app.core.model.ApiResult

/**
 * Whether the workouts tab should say the session could not be loaded.
 *
 * No plan yet is an empty state ("No training plan yet"), not a broken
 * session. `GET /workouts/today` answers 404 in that case, and a transport
 * failure with nothing cached used to raise the same banner above the
 * empty plan.
 */
internal fun showTodaySessionError(
    todayError: Boolean,
    hasPlan: Boolean,
    planError: Boolean,
): Boolean = todayError && (hasPlan || planError)

/** 404 on today's workout means there is no plan to have a session. */
internal fun todayWorkoutMissingPlan(failure: ApiResult.Failure): Boolean =
    failure is ApiResult.Failure.Api && failure.httpStatus == HTTP_NOT_FOUND

private const val HTTP_NOT_FOUND = 404
