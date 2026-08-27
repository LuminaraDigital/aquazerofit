package fit.aquazero.app.core.data

import android.content.Context
import android.net.Uri
import dagger.hilt.android.qualifiers.ApplicationContext
import fit.aquazero.app.core.network.ApiResult
import fit.aquazero.app.core.network.api.VisionApi
import fit.aquazero.app.core.network.dto.MealType
import fit.aquazero.app.core.network.dto.VisionJobDto
import fit.aquazero.app.core.network.map
import fit.aquazero.app.core.network.safeCall
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody

@Singleton
class VisionRepository @Inject constructor(
    private val visionApi: VisionApi,
    @ApplicationContext private val context: Context,
) {

    suspend fun uploadPhoto(uri: Uri, mealType: MealType): ApiResult<VisionJobDto> {
        val file = File(context.cacheDir, "upload.jpg")
        context.contentResolver.openInputStream(uri)?.use { input ->
            file.outputStream().use { output -> input.copyTo(output) }
        }

        val photoPart = MultipartBody.Part.createFormData(
            "photo",
            file.name,
            file.asRequestBody("image/jpeg".toMediaType())
        )
        val typePart = MultipartBody.Part.createFormData(
            "mealType",
            mealType.name.lowercase()
        )

        return safeCall { visionApi.upload(photoPart, typePart) }.map { it.job }
    }

    suspend fun getJob(jobId: String): ApiResult<VisionJobDto> =
        safeCall { visionApi.job(jobId) }.map { it.job }
}
