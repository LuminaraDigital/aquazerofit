package fit.aquazero.app.core.data

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import android.net.Uri
import dagger.hilt.android.qualifiers.ApplicationContext
import fit.aquazero.app.core.model.ApiResult
import fit.aquazero.app.core.model.MealDayDto
import fit.aquazero.app.core.model.MealLogItemDto
import fit.aquazero.app.core.model.MealType
import fit.aquazero.app.core.model.VisionJobDto
import fit.aquazero.app.core.model.map
import fit.aquazero.app.core.network.api.LogsApi
import fit.aquazero.app.core.network.api.VisionApi
import fit.aquazero.app.core.network.api.VisionConfirmRequest
import fit.aquazero.app.core.network.safeCall
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import java.io.File
import java.io.IOException
import java.util.Locale
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Client-side meal-photo rules, mirroring the shared constants
 * (`MEAL_PHOTO_MAX_BYTES` = 10 MB, `MEAL_PHOTO_MIME` = jpeg/png/heic) and the
 * web client's `isAcceptedFile`.
 *
 * Pure by design: no Android types, so the accept/reject decisions and the
 * downscale arithmetic are covered by plain JVM unit tests. The server
 * re-validates everything; this exists so a doomed 10 MB upload is refused
 * before it burns the user's data.
 */
object MealPhotoRules {

    /** `MEAL_PHOTO_MAX_BYTES` — 10 MB. */
    const val MAX_BYTES: Long = 10L * 1024 * 1024

    /**
     * Longest-edge target for the client-side downscale. Well above what the
     * vision lane needs, well below what a modern sensor produces.
     */
    const val MAX_EDGE_PX: Int = 1600

    /** JPEG quality ladder walked until the encoded file fits [MAX_BYTES]. */
    val QUALITY_LADDER: List<Int> = listOf(88, 78, 68, 58)

    /** `MEAL_PHOTO_MIME` plus `image/heif`, which some pickers report for HEIC. */
    val ALLOWED_MIME: Set<String> = setOf("image/jpeg", "image/png", "image/heic", "image/heif")

    /** Extension fallback for platforms that report an empty MIME for HEIC. */
    val ALLOWED_EXTENSIONS: Set<String> = setOf("jpg", "jpeg", "png", "heic", "heif")

    /** True when the declared MIME type is one the API accepts. */
    fun isAcceptedMime(mime: String?): Boolean =
        mime != null && mime.substringBefore(';').trim().lowercase(Locale.ROOT) in ALLOWED_MIME

    /** True when the filename carries an accepted image extension. */
    fun isAcceptedName(name: String?): Boolean {
        val ext = name?.substringAfterLast('.', "")?.lowercase(Locale.ROOT).orEmpty()
        return ext.isNotEmpty() && ext in ALLOWED_EXTENSIONS
    }

    /**
     * Mirrors the web's `isAcceptedFile`: trust the MIME when there is one,
     * otherwise fall back to the extension (HEIC often arrives MIME-less).
     */
    fun accepts(mime: String?, name: String?): Boolean = when {
        isAcceptedMime(mime) -> true
        mime.isNullOrBlank() -> isAcceptedName(name)
        else -> false
    }

    /** True when a payload is over the API's hard limit. */
    fun exceedsMax(bytes: Long): Boolean = bytes > MAX_BYTES

    /**
     * `BitmapFactory.Options.inSampleSize` (a power of two) that brings the
     * longest edge at or under [maxEdge] without ever upscaling.
     */
    fun sampleSizeFor(width: Int, height: Int, maxEdge: Int = MAX_EDGE_PX): Int {
        if (width <= 0 || height <= 0 || maxEdge <= 0) return 1
        var sample = 1
        while (maxOf(width, height) / (sample * 2) >= maxEdge) {
            sample *= 2
        }
        return sample
    }

    /**
     * Final scale factor applied after sub-sampling so the longest edge lands
     * exactly at [maxEdge]. Returns 1.0 when the image is already small.
     */
    fun scaleFactorFor(width: Int, height: Int, maxEdge: Int = MAX_EDGE_PX): Double {
        val longest = maxOf(width, height)
        if (longest <= maxEdge || longest <= 0) return 1.0
        return maxEdge.toDouble() / longest.toDouble()
    }
}

/** Why a chosen photo cannot be uploaded. Rendered as an inline banner. */
enum class PhotoRejection {
    /** Not a JPEG/PNG/HEIC. */
    UNSUPPORTED_TYPE,

    /** Over 10 MB even after the client-side downscale. */
    TOO_LARGE,

    /** The bytes could not be read or decoded as an image at all. */
    UNREADABLE,
}

/** Outcome of staging a captured/imported photo into the app-private cache. */
sealed interface StagedPhotoResult {
    /** Ready to upload: [file] lives in the app-private cache. */
    data class Ready(val file: File, val bytes: Long, val width: Int, val height: Int) :
        StagedPhotoResult

    /** Rejected before any network work happened. */
    data class Rejected(val reason: PhotoRejection) : StagedPhotoResult
}

/** Result of the confirmation gate. */
data class VisionConfirmOutcome(
    /** The created meal log, when the server told us (or we could match it). */
    val mealLogId: String?,
    /** True when this confirm replayed an earlier one (409 recovery). */
    val alreadyConfirmed: Boolean,
)

/**
 * Recovery arithmetic for a replayed `POST /meal-photos/:jobId/confirm`.
 *
 * Plan §6 delta 10: the second confirm answers `CONFLICT`, and the server is
 * being changed to carry `details.mealLogId`. Until (and after) that lands the
 * client must never dead-end or duplicate — so a conflict that *is* a replay is
 * treated as success, and the meal log is located either from the details or by
 * matching the day's logs on `visionJobId`.
 *
 * A conflict for any other reason (confirming a job that is still queued, or
 * one that failed) is NOT a replay and stays a failure.
 *
 * Pure: JVM-testable without a server.
 */
object VisionConfirmRecovery {

    /** `details.mealLogId` when the server sent it. */
    fun mealLogIdFromConflict(details: JsonElement?): String? {
        val obj = details as? JsonObject ?: return null
        val raw = obj["mealLogId"] ?: obj["logId"] ?: return null
        val primitive = raw as? JsonPrimitive ?: return null
        if (!primitive.isString) return null
        return primitive.content.takeIf { it.isNotBlank() }
    }

    /**
     * True when a CONFLICT means "you already confirmed this job", rather than
     * "this job is not in a confirmable state".
     */
    fun isReplayedConfirm(details: JsonElement?): Boolean {
        if (mealLogIdFromConflict(details) != null) return true
        val status = (details as? JsonObject)?.get("status")?.let { element ->
            (element as? JsonPrimitive)?.takeIf { it.isString }?.content
        }
        return status == "confirmed"
    }

    /** The day's meal log created from [jobId], matched on `visionJobId`. */
    fun matchMealLogId(day: MealDayDto, jobId: String): String? =
        day.meals.values.asSequence()
            .flatten()
            .firstOrNull { it.visionJobId == jobId }
            ?.id
}

/**
 * The photo-meal lane: stage → upload → poll → confirm.
 *
 * Nothing here writes to the log. The only write path is [confirm], which is
 * reached exclusively from the user's explicit tap on the confirmation gate
 * (product invariant 1). The staged photo is deleted the moment a confirm
 * settles, whether it created the log or recovered an earlier one.
 */
@Singleton
class VisionRepository @Inject constructor(
    private val visionApi: VisionApi,
    private val logsApi: LogsApi,
    @ApplicationContext private val context: Context,
) {

    /** App-private staging directory — never on external storage. */
    private fun stagingDir(): File =
        File(context.cacheDir, STAGING_DIR).apply { mkdirs() }

    /**
     * Copy, orient, downscale and re-encode a captured or picked photo into the
     * app-private cache, rejecting anything the API would refuse.
     *
     * Re-encoding also drops EXIF (GPS at home-address precision, capture time,
     * camera serial) before the bytes ever leave the device — the server does
     * the same on its side, but there is no reason to send it in the first
     * place. Orientation is baked into the pixels first, or every portrait
     * photo would arrive sideways.
     */
    suspend fun stagePhoto(uri: Uri, displayName: String? = null): StagedPhotoResult =
        withContext(Dispatchers.IO) {
            val mime = runCatching { context.contentResolver.getType(uri) }.getOrNull()
            val name = displayName ?: uri.lastPathSegment
            if (!MealPhotoRules.accepts(mime, name)) {
                return@withContext StagedPhotoResult.Rejected(PhotoRejection.UNSUPPORTED_TYPE)
            }

            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            val decodedBounds = runCatching {
                context.contentResolver.openInputStream(uri)?.use { input ->
                    BitmapFactory.decodeStream(input, null, bounds)
                }
                bounds.outWidth > 0 && bounds.outHeight > 0
            }.getOrDefault(false)
            if (!decodedBounds) {
                return@withContext StagedPhotoResult.Rejected(PhotoRejection.UNREADABLE)
            }

            val rotation = runCatching {
                context.contentResolver.openInputStream(uri)?.use { input ->
                    exifRotationDegrees(ExifInterface(input))
                } ?: 0
            }.getOrDefault(0)

            val options = BitmapFactory.Options().apply {
                inSampleSize = MealPhotoRules.sampleSizeFor(bounds.outWidth, bounds.outHeight)
            }
            val sampled = runCatching {
                context.contentResolver.openInputStream(uri)?.use { input ->
                    BitmapFactory.decodeStream(input, null, options)
                }
            }.getOrNull() ?: return@withContext StagedPhotoResult.Rejected(PhotoRejection.UNREADABLE)

            val oriented = try {
                transform(sampled, rotation)
            } catch (_: OutOfMemoryError) {
                sampled.recycle()
                return@withContext StagedPhotoResult.Rejected(PhotoRejection.TOO_LARGE)
            }

            val stagedWidth = oriented.width
            val stagedHeight = oriented.height
            val target = File(stagingDir(), "$STAGE_PREFIX${UUID.randomUUID()}$STAGED_EXT")
            val encoded = try {
                encodeUnderLimit(oriented, target)
            } catch (_: IOException) {
                false
            } finally {
                oriented.recycle()
            }

            if (!encoded) {
                target.delete()
                return@withContext StagedPhotoResult.Rejected(PhotoRejection.TOO_LARGE)
            }
            StagedPhotoResult.Ready(
                file = target,
                bytes = target.length(),
                width = stagedWidth,
                height = stagedHeight,
            )
        }

    /**
     * Multipart `POST /meal-photos` for an already-staged file. Called from
     * [fit.aquazero.app.core.sync.MealPhotoUploadWorker], never from the UI —
     * so a backgrounded app still finishes its upload.
     */
    suspend fun uploadStaged(
        stagedPath: String,
        mealType: MealType,
    ): ApiResult<VisionJobDto> {
        val file = File(stagedPath)
        if (!file.exists()) {
            return ApiResult.Failure.Network(IOException("Staged photo is gone: $stagedPath"))
        }
        val photoPart = MultipartBody.Part.createFormData(
            "photo",
            file.name,
            file.asRequestBody(STAGED_MIME.toMediaType()),
        )
        // The upload route reads only `mealType`; the day is fixed at confirm
        // time, where `localDate` is part of the confirmation payload.
        val mealTypePart = MultipartBody.Part.createFormData("mealType", mealType.wireName())
        return safeCall { visionApi.upload(photoPart, mealTypePart) }.map { it.job }
    }

    /** Poll `GET /meal-photos/:jobId` (1s cadence while queued/processing). */
    suspend fun getJob(jobId: String): ApiResult<VisionJobDto> =
        safeCall { visionApi.job(jobId) }.map { it.job }

    /**
     * The confirmation gate. Posts the user's EDITED items and settles the
     * staged photo. A replayed confirm (409) resolves to the meal log that the
     * first attempt created instead of dead-ending or duplicating.
     */
    suspend fun confirm(
        jobId: String,
        mealType: MealType,
        localDate: String,
        items: List<MealLogItemDto>,
    ): ApiResult<VisionConfirmOutcome> {
        val request = VisionConfirmRequest(
            items = items,
            mealType = mealType,
            localDate = localDate,
        )
        return when (val result = safeCall { visionApi.confirm(jobId, request) }) {
            is ApiResult.Success -> {
                discardStagedForJob(jobId)
                val id = result.data.log?.id ?: resolveMealLogId(jobId, localDate)
                ApiResult.Success(VisionConfirmOutcome(mealLogId = id, alreadyConfirmed = false))
            }

            is ApiResult.Failure.Api -> {
                if (result.httpStatus == HTTP_CONFLICT &&
                    VisionConfirmRecovery.isReplayedConfirm(result.details)
                ) {
                    discardStagedForJob(jobId)
                    val id = VisionConfirmRecovery.mealLogIdFromConflict(result.details)
                        ?: resolveMealLogId(jobId, localDate)
                    ApiResult.Success(
                        VisionConfirmOutcome(mealLogId = id, alreadyConfirmed = true),
                    )
                } else {
                    result
                }
            }

            is ApiResult.Failure.Network -> result

            is ApiResult.Failure.Malformed -> result
        }
    }

    /**
     * Fallback for servers that do not yet carry `details.mealLogId`: fetch the
     * day's meal logs and match on `visionJobId`.
     */
    private suspend fun resolveMealLogId(jobId: String, localDate: String): String? =
        when (val day = safeCall { logsApi.mealLogs(localDate) }) {
            is ApiResult.Success -> VisionConfirmRecovery.matchMealLogId(day.data, jobId)
            is ApiResult.Failure -> null
        }

    /**
     * Take ownership of a staged file for [jobId] so a later confirm can delete
     * it. Called by the upload worker once the server has the photo.
     */
    fun adoptStagedForJob(stagedPath: String, jobId: String): String {
        val staged = File(stagedPath)
        if (!staged.exists()) return stagedPath
        val owned = File(stagingDir(), "$JOB_PREFIX${jobId.sanitizedForFileName()}$STAGED_EXT")
        return if (staged.renameTo(owned)) owned.absolutePath else stagedPath
    }

    /** Drop a staged file the user abandoned (retake, or a failed upload). */
    fun discardStaged(stagedPath: String?) {
        if (stagedPath.isNullOrBlank()) return
        val file = File(stagedPath)
        if (file.parentFile?.absolutePath == stagingDir().absolutePath) file.delete()
    }

    /** Delete the staged copy for a confirmed job (data minimisation). */
    fun discardStagedForJob(jobId: String) {
        File(stagingDir(), "$JOB_PREFIX${jobId.sanitizedForFileName()}$STAGED_EXT").delete()
    }

    /**
     * Remove staged files older than the server's own 24h artifact TTL — a
     * crash between capture and confirm must not leave meal photos on disk.
     */
    fun sweepStaged(now: Long = System.currentTimeMillis()) {
        val cutoff = now - STAGED_TTL_MS
        stagingDir().listFiles()?.forEach { file ->
            if (file.isFile && file.lastModified() < cutoff) file.delete()
        }
    }

    // ----- internals -----

    private fun encodeUnderLimit(bitmap: Bitmap, target: File): Boolean {
        for (quality in MealPhotoRules.QUALITY_LADDER) {
            target.outputStream().use { out ->
                bitmap.compress(Bitmap.CompressFormat.JPEG, quality, out)
            }
            if (!MealPhotoRules.exceedsMax(target.length())) return true
        }
        return false
    }

    private fun transform(source: Bitmap, rotationDegrees: Int): Bitmap {
        val scale = MealPhotoRules.scaleFactorFor(source.width, source.height)
        if (scale >= 1.0 && rotationDegrees == 0) return source
        val matrix = Matrix().apply {
            if (scale < 1.0) postScale(scale.toFloat(), scale.toFloat())
            if (rotationDegrees != 0) postRotate(rotationDegrees.toFloat())
        }
        val out = Bitmap.createBitmap(source, 0, 0, source.width, source.height, matrix, true)
        if (out !== source) source.recycle()
        return out
    }

    private fun exifRotationDegrees(exif: ExifInterface): Int =
        when (exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
            ExifInterface.ORIENTATION_ROTATE_90 -> 90
            ExifInterface.ORIENTATION_ROTATE_180 -> 180
            ExifInterface.ORIENTATION_ROTATE_270 -> 270
            else -> 0
        }

    private fun MealType.wireName(): String = when (this) {
        MealType.BREAKFAST -> "breakfast"
        MealType.LUNCH -> "lunch"
        MealType.DINNER -> "dinner"
        MealType.SNACK -> "snack"
    }

    private fun String.sanitizedForFileName(): String = filter { it.isLetterOrDigit() || it == '-' }

    private companion object {
        const val STAGING_DIR = "meal-photos"
        const val STAGE_PREFIX = "stage-"
        const val JOB_PREFIX = "job-"
        const val STAGED_EXT = ".jpg"
        const val STAGED_MIME = "image/jpeg"
        const val HTTP_CONFLICT = 409

        /** Matches the server's vision-artifact TTL. */
        const val STAGED_TTL_MS: Long = 24L * 60 * 60 * 1000
    }
}
