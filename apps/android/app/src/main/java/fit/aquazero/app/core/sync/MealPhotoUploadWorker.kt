package fit.aquazero.app.core.sync

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkInfo
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import dagger.hilt.android.qualifiers.ApplicationContext
import fit.aquazero.app.core.data.VisionRepository
import fit.aquazero.app.core.model.ApiResult
import fit.aquazero.app.core.model.MealType
import java.time.Duration
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow

/**
 * Uploads one staged meal photo to `POST /meal-photos`.
 *
 * The photo lives in the app-private cache (never external storage), so the
 * upload survives the user leaving the capture screen — WorkManager finishes
 * it in the background and hands the resulting `jobId` back through
 * [WorkInfo.getOutputData].
 *
 * Failure handling mirrors [SyncWorker]:
 *  - transport / 5xx → [Result.retry] under WorkManager's exponential backoff;
 *  - 429 → re-enqueued with an explicit delay honouring `Retry-After`
 *    (the vision lane is 20/min), because backoff criteria cannot be changed
 *    at runtime;
 *  - 4xx → [Result.failure] with the server's code and message, surfaced
 *    inline on the capture screen (never a silent drop);
 *  - the staged file is deleted on any terminal failure, and handed to
 *    [VisionRepository.adoptStagedForJob] on success so the confirmation gate
 *    can delete it once the meal is logged.
 *
 * This worker never writes to the meal log. It only produces a job id for the
 * confirmation gate (product invariant 1).
 */
@HiltWorker
class MealPhotoUploadWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted params: WorkerParameters,
    private val visionRepository: VisionRepository,
    private val mealPhotoUploadScheduler: MealPhotoUploadScheduler,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val stagedPath = inputData.getString(KEY_STAGED_PATH)
            ?: return Result.failure(errorData("MISSING_PHOTO", null))
        val captureId = inputData.getString(KEY_CAPTURE_ID).orEmpty()
        val mealType = mealTypeOf(inputData.getString(KEY_MEAL_TYPE))

        // Opportunistic cleanup of anything a crash left behind.
        visionRepository.sweepStaged()

        return when (val result = visionRepository.uploadStaged(stagedPath, mealType)) {
            is ApiResult.Success -> {
                val owned = visionRepository.adoptStagedForJob(stagedPath, result.data.id)
                Result.success(
                    workDataOf(
                        KEY_CAPTURE_ID to captureId,
                        KEY_JOB_ID to result.data.id,
                        KEY_STAGED_PATH to owned,
                    ),
                )
            }

            is ApiResult.Failure.Network -> Result.retry()

            // Undecodable body: retrying re-runs the same decode, so stop and
            // let the screen say the upload failed rather than spin.
            is ApiResult.Failure.Malformed -> {
                visionRepository.discardStaged(stagedPath)
                Result.failure(errorData("MALFORMED_RESPONSE", null))
            }

            is ApiResult.Failure.Api -> when {
                result.httpStatus == HTTP_TOO_MANY_REQUESTS -> {
                    // Re-enqueue under the same unique name so the observing
                    // screen keeps following one stream of WorkInfo.
                    mealPhotoUploadScheduler.reschedule(
                        inputData = inputData,
                        delaySeconds = result.retryAfterSeconds ?: DEFAULT_RATE_LIMIT_DELAY_SECONDS,
                    )
                    Result.success(
                        workDataOf(
                            KEY_CAPTURE_ID to captureId,
                            KEY_RESCHEDULED to true,
                        ),
                    )
                }

                result.httpStatus >= HTTP_SERVER_ERROR -> Result.retry()
                result.httpStatus == HTTP_UNAUTHORIZED -> Result.retry()
                else -> {
                    visionRepository.discardStaged(stagedPath)
                    Result.failure(errorData(result.code, result.message))
                }
            }
        }
    }

    private fun errorData(code: String, message: String?): Data = workDataOf(
        KEY_CAPTURE_ID to inputData.getString(KEY_CAPTURE_ID).orEmpty(),
        KEY_ERROR_CODE to code,
        KEY_ERROR_MESSAGE to message,
    )

    private fun mealTypeOf(name: String?): MealType = when (name) {
        MealType.BREAKFAST.name -> MealType.BREAKFAST
        MealType.LUNCH.name -> MealType.LUNCH
        MealType.DINNER.name -> MealType.DINNER
        else -> MealType.SNACK
    }

    companion object {
        const val KEY_STAGED_PATH = "stagedPath"
        const val KEY_MEAL_TYPE = "mealType"
        const val KEY_CAPTURE_ID = "captureId"
        const val KEY_JOB_ID = "jobId"
        const val KEY_ERROR_CODE = "errorCode"
        const val KEY_ERROR_MESSAGE = "errorMessage"
        const val KEY_RESCHEDULED = "rescheduled"

        /** One photo upload at a time, ever. */
        const val UNIQUE_WORK_NAME = "azf-meal-photo-upload"

        private const val HTTP_UNAUTHORIZED = 401
        private const val HTTP_TOO_MANY_REQUESTS = 429
        private const val HTTP_SERVER_ERROR = 500
        private const val DEFAULT_RATE_LIMIT_DELAY_SECONDS = 60L
    }
}

/**
 * Enqueues and observes [MealPhotoUploadWorker]. Injected into the capture
 * ViewModel so no Compose or ViewModel code touches WorkManager directly.
 */
@Singleton
class MealPhotoUploadScheduler @Inject constructor(
    @ApplicationContext private val context: Context,
) {

    /**
     * Queue an upload for a staged photo. Returns the capture id that tags this
     * attempt — the caller matches it against [WorkInfo] output so a stale
     * SUCCEEDED result from an earlier capture is never mistaken for this one.
     */
    fun enqueue(stagedPath: String, mealType: MealType): String {
        val captureId = UUID.randomUUID().toString()
        val data = workDataOf(
            MealPhotoUploadWorker.KEY_STAGED_PATH to stagedPath,
            MealPhotoUploadWorker.KEY_MEAL_TYPE to mealType.name,
            MealPhotoUploadWorker.KEY_CAPTURE_ID to captureId,
        )
        enqueueInternal(data, delaySeconds = 0L, policy = ExistingWorkPolicy.REPLACE)
        return captureId
    }

    /** Re-queue the same payload after a `Retry-After` delay. */
    fun reschedule(inputData: Data, delaySeconds: Long) {
        enqueueInternal(inputData, delaySeconds, ExistingWorkPolicy.REPLACE)
    }

    /** Live state of the single upload stream. */
    fun uploads(): Flow<List<WorkInfo>> =
        WorkManager.getInstance(context)
            .getWorkInfosForUniqueWorkFlow(MealPhotoUploadWorker.UNIQUE_WORK_NAME)

    /** Drop any queued upload (user backed out before it started). */
    fun cancel() {
        WorkManager.getInstance(context)
            .cancelUniqueWork(MealPhotoUploadWorker.UNIQUE_WORK_NAME)
    }

    private fun enqueueInternal(data: Data, delaySeconds: Long, policy: ExistingWorkPolicy) {
        val request = OneTimeWorkRequestBuilder<MealPhotoUploadWorker>()
            .setConstraints(
                Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build(),
            )
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, Duration.ofSeconds(15))
            .setInitialDelay(Duration.ofSeconds(delaySeconds))
            .setInputData(data)
            .build()
        WorkManager.getInstance(context)
            .enqueueUniqueWork(MealPhotoUploadWorker.UNIQUE_WORK_NAME, policy, request)
    }
}
