package fit.aquazero.app.feature.nutrition

import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import fit.aquazero.app.core.data.VisionRepository
import fit.aquazero.app.core.network.ApiResult
import fit.aquazero.app.core.network.dto.MealType
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

@HiltViewModel
class CaptureMealViewModel @Inject constructor(
    private val visionRepository: VisionRepository,
) : ViewModel() {

    private val _uploadState = MutableStateFlow<UploadState>(UploadState.Idle)
    val uploadState: StateFlow<UploadState> = _uploadState

    fun upload(uri: Uri, mealType: MealType) {
        viewModelScope.launch {
            _uploadState.value = UploadState.Uploading
            when (val result = visionRepository.uploadPhoto(uri, mealType)) {
                is ApiResult.Success -> {
                    _uploadState.value = UploadState.Success(result.data.id)
                }
                is ApiResult.Failure.Api -> {
                    _uploadState.value = UploadState.Error(result.message)
                }
                is ApiResult.Failure.Network -> {
                    _uploadState.value = UploadState.Error(result.cause.message ?: "Network error. Please try again.")
                }
            }
        }
    }

    fun reset() {
        _uploadState.value = UploadState.Idle
    }
}

sealed class UploadState {
    object Idle : UploadState()
    object Uploading : UploadState()
    data class Success(val jobId: String) : UploadState()
    data class Error(val message: String) : UploadState()
}
