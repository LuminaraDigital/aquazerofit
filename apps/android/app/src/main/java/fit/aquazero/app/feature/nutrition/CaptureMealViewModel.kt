package fit.aquazero.app.feature.nutrition

import android.net.Uri
import androidx.annotation.StringRes
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.work.WorkInfo
import dagger.hilt.android.lifecycle.HiltViewModel
import fit.aquazero.app.R
import fit.aquazero.app.core.data.PhotoRejection
import fit.aquazero.app.core.data.StagedPhotoResult
import fit.aquazero.app.core.data.VisionRepository
import fit.aquazero.app.core.model.MealType
import fit.aquazero.app.core.sync.MealPhotoUploadScheduler
import fit.aquazero.app.core.sync.MealPhotoUploadWorker
import fit.aquazero.app.core.ui.NutritionFormat
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Where the CAMERA runtime permission currently stands. */
enum class CameraPermission {
    /** Not asked yet in this session. */
    Unknown,

    /** Granted — the viewfinder is live. */
    Granted,

    /** Refused once; asking again is allowed and the rationale is shown. */
    Denied,

    /** Refused with "don't ask again" — only Settings can undo this. */
    PermanentlyDenied,
}

/**
 * Inline banner copy. Validation and upload problems are shown in the layout
 * (matching the web), never as a toast that can be missed.
 */
data class CaptureBanner(
    @param:StringRes val messageRes: Int? = null,
    /** Server-authored copy, already user-facing. */
    val message: String? = null,
)

/** A photo staged in the app-private cache, ready for the analyze CTA. */
data class StagedPhoto(val path: String, val bytes: Long)

/** Immutable capture-screen state. */
data class CaptureMealUiState(
    val mealType: MealType = NutritionFormat.mealTypeForNow(),
    val permission: CameraPermission = CameraPermission.Unknown,
    val staged: StagedPhoto? = null,
    val preparing: Boolean = false,
    val uploading: Boolean = false,
    val torchOn: Boolean = false,
    val banner: CaptureBanner? = null,
) {
    /** The analyze CTA is only offered once a photo actually passed validation. */
    val canAnalyze: Boolean get() = staged != null && !uploading && !preparing
}

/** One-shot navigation signals. */
sealed interface CaptureMealEvent {
    /** The photo is uploaded; the confirmation gate can open on [jobId]. */
    data class AnalysisReady(val jobId: String) : CaptureMealEvent
}

/**
 * Capture-screen state holder.
 *
 * The photo never goes straight to the network from here: it is staged,
 * validated and compressed on disk, then handed to
 * [MealPhotoUploadWorker] so a backgrounded app still finishes the upload.
 * Nothing on this screen writes to the meal log.
 */
@HiltViewModel
class CaptureMealViewModel @Inject constructor(
    private val visionRepository: VisionRepository,
    private val uploadScheduler: MealPhotoUploadScheduler,
) : ViewModel() {

    private val _state = MutableStateFlow(CaptureMealUiState())
    val state: StateFlow<CaptureMealUiState> = _state.asStateFlow()

    private val events = Channel<CaptureMealEvent>(Channel.BUFFERED)
    val eventFlow: Flow<CaptureMealEvent> = events.receiveAsFlow()

    /** Capture id of the upload this screen is waiting on. */
    private var pendingCaptureId: String? = null

    init {
        observeUploads()
        viewModelScope.launch { visionRepository.sweepStaged() }
    }

    fun setMealType(mealType: MealType) {
        _state.value = _state.value.copy(mealType = mealType)
    }

    fun onPermissionResult(granted: Boolean, canAskAgain: Boolean) {
        _state.value = _state.value.copy(
            permission = when {
                granted -> CameraPermission.Granted
                canAskAgain -> CameraPermission.Denied
                else -> CameraPermission.PermanentlyDenied
            },
        )
    }

    fun toggleTorch() {
        _state.value = _state.value.copy(torchOn = !_state.value.torchOn)
    }

    fun dismissBanner() {
        _state.value = _state.value.copy(banner = null)
    }

    /**
     * A photo arrived (shutter or Photo Picker). It is validated against the
     * API's limits and re-encoded into the cache before anything else happens.
     */
    fun onPhotoChosen(uri: Uri, displayName: String? = null) {
        val previous = _state.value.staged?.path
        _state.value = _state.value.copy(preparing = true, banner = null)
        viewModelScope.launch {
            when (val staged = visionRepository.stagePhoto(uri, displayName)) {
                is StagedPhotoResult.Ready -> {
                    visionRepository.discardStaged(previous)
                    _state.value = _state.value.copy(
                        preparing = false,
                        staged = StagedPhoto(staged.file.absolutePath, staged.bytes),
                        banner = null,
                    )
                }

                is StagedPhotoResult.Rejected -> {
                    _state.value = _state.value.copy(
                        preparing = false,
                        banner = CaptureBanner(messageRes = staged.reason.messageRes()),
                    )
                }
            }
        }
    }

    /** The shutter failed at the CameraX layer — say so, inline. */
    fun onShutterFailed() {
        _state.value = _state.value.copy(
            preparing = false,
            banner = CaptureBanner(messageRes = R.string.capture_error_shutter),
        )
    }

    /** Drop the staged photo and go back to the live viewfinder. */
    fun retake() {
        val previous = _state.value.staged?.path
        uploadScheduler.cancel()
        pendingCaptureId = null
        _state.value = _state.value.copy(staged = null, banner = null, uploading = false)
        viewModelScope.launch { visionRepository.discardStaged(previous) }
    }

    /** Hand the staged photo to the upload worker. */
    fun analyze() {
        val staged = _state.value.staged ?: return
        if (_state.value.uploading) return
        _state.value = _state.value.copy(uploading = true, banner = null)
        pendingCaptureId = uploadScheduler.enqueue(staged.path, _state.value.mealType)
    }

    private fun observeUploads() {
        viewModelScope.launch {
            uploadScheduler.uploads().collect { infos ->
                val pending = pendingCaptureId ?: return@collect
                // WorkManager keeps finished WorkInfo around and REPLACE leaves a
                // CANCELLED predecessor behind, so pick this capture's row by id
                // and only fall back to a still-running one.
                val info = infos.firstOrNull {
                    it.outputData.getString(MealPhotoUploadWorker.KEY_CAPTURE_ID) == pending
                } ?: infos.firstOrNull { !it.state.isFinished } ?: return@collect
                when (info.state) {
                    WorkInfo.State.SUCCEEDED -> {
                        val jobId = info.outputData.getString(MealPhotoUploadWorker.KEY_JOB_ID)
                        when {
                            jobId != null -> {
                                pendingCaptureId = null
                                _state.value = _state.value.copy(uploading = false, staged = null)
                                events.trySend(CaptureMealEvent.AnalysisReady(jobId))
                            }
                            // Rate-limited and re-queued: keep the spinner up.
                            info.outputData.getBoolean(
                                MealPhotoUploadWorker.KEY_RESCHEDULED,
                                false,
                            ) -> {
                                _state.value = _state.value.copy(
                                    banner = CaptureBanner(messageRes = R.string.capture_rate_limited),
                                )
                            }
                            else -> Unit
                        }
                    }

                    WorkInfo.State.FAILED -> {
                        pendingCaptureId = null
                        _state.value = _state.value.copy(
                            uploading = false,
                            staged = null,
                            banner = CaptureBanner(
                                message = info.outputData
                                    .getString(MealPhotoUploadWorker.KEY_ERROR_MESSAGE),
                                messageRes = R.string.capture_upload_failed,
                            ),
                        )
                    }

                    WorkInfo.State.CANCELLED -> {
                        pendingCaptureId = null
                        _state.value = _state.value.copy(uploading = false)
                    }

                    else -> Unit
                }
            }
        }
    }

    private fun PhotoRejection.messageRes(): Int = when (this) {
        PhotoRejection.UNSUPPORTED_TYPE -> R.string.capture_error_unsupported_type
        PhotoRejection.TOO_LARGE -> R.string.capture_error_too_large
        PhotoRejection.UNREADABLE -> R.string.capture_error_unreadable
    }
}
