package fit.aquazero.app.feature.nutrition

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.compose.CameraXViewfinder
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.Preview
import androidx.camera.core.SurfaceRequest
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.FlashlightOff
import androidx.compose.material.icons.outlined.FlashlightOn
import androidx.compose.material.icons.outlined.PhotoLibrary
import androidx.compose.material.icons.outlined.Replay
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil3.compose.AsyncImage
import com.google.common.util.concurrent.ListenableFuture
import fit.aquazero.app.R
import fit.aquazero.app.core.designsystem.AzfCard
import fit.aquazero.app.core.designsystem.AzfCardTier
import fit.aquazero.app.core.designsystem.AzfChip
import fit.aquazero.app.core.designsystem.AzfShapes
import fit.aquazero.app.core.designsystem.AzfTheme
import fit.aquazero.app.core.designsystem.LocalAzfExtended
import fit.aquazero.app.core.designsystem.PrimaryButton
import fit.aquazero.app.core.designsystem.SecondaryButton
import fit.aquazero.app.core.model.MealType
import fit.aquazero.app.core.ui.NutritionFormat
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import java.io.File
import java.util.concurrent.Executor
import androidx.compose.ui.tooling.preview.Preview as ComposePreview

/**
 * Photo meal capture.
 *
 * CameraX Compose viewfinder + `ImageCapture`, meal-type chips prefilled from
 * the time of day, torch, viewfinder brackets and retake. Gallery import goes
 * through the **Android Photo Picker** (`PickVisualMedia`) — deliberately NOT
 * `READ_MEDIA_IMAGES`, which would drag the app into a Play photo-and-video
 * permissions declaration for no user benefit.
 *
 * Nothing is logged from this screen: the photo is staged, uploaded and handed
 * to the confirmation gate on `AnalysisResultsScreen`.
 */
@Composable
fun CaptureMealScreen(
    onBack: () -> Unit,
    onNavigateToAnalysis: (String) -> Unit,
    modifier: Modifier = Modifier,
    viewModel: CaptureMealViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val resources = LocalResources.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val scope = rememberCoroutineScope()

    var surfaceRequest by remember { mutableStateOf<SurfaceRequest?>(null) }
    var imageCapture by remember { mutableStateOf<ImageCapture?>(null) }
    var camera by remember { mutableStateOf<Camera?>(null) }

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
    ) { granted ->
        viewModel.onPermissionResult(
            granted = granted,
            canAskAgain = granted || context.findActivity()?.shouldShowCameraRationale() == true,
        )
    }

    val photoPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia(),
    ) { uri: Uri? ->
        if (uri != null) viewModel.onPhotoChosen(uri)
    }

    // First composition: reflect the permission we already hold, and ask once.
    LaunchedEffect(Unit) {
        val granted = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.CAMERA,
        ) == PackageManager.PERMISSION_GRANTED
        if (granted) {
            viewModel.onPermissionResult(granted = true, canAskAgain = true)
        } else {
            permissionLauncher.launch(Manifest.permission.CAMERA)
        }
    }

    LaunchedEffect(viewModel) {
        viewModel.eventFlow.collect { event ->
            when (event) {
                is CaptureMealEvent.AnalysisReady -> onNavigateToAnalysis(event.jobId)
            }
        }
    }

    // Bind the camera to this composable's lifecycle owner; CameraX releases
    // the device on STOP and rebinds on START. unbindAll on dispose guarantees
    // the camera is freed even if the process outlives the screen.
    val liveViewfinder = state.permission == CameraPermission.Granted && state.staged == null
    if (liveViewfinder) {
        DisposableEffect(lifecycleOwner) {
            var provider: ProcessCameraProvider? = null
            val job = scope.launch {
                val cameraProvider = ProcessCameraProvider.getInstance(context).awaitOnMain(context)
                provider = cameraProvider
                val preview = Preview.Builder().build().apply {
                    setSurfaceProvider { request -> surfaceRequest = request }
                }
                val capture = ImageCapture.Builder()
                    .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
                    .build()
                imageCapture = capture
                runCatching {
                    cameraProvider.unbindAll()
                    camera = cameraProvider.bindToLifecycle(
                        lifecycleOwner,
                        CameraSelector.DEFAULT_BACK_CAMERA,
                        preview,
                        capture,
                    )
                }
            }
            onDispose {
                job.cancel()
                provider?.unbindAll()
                camera = null
                imageCapture = null
                surfaceRequest = null
            }
        }
    }

    LaunchedEffect(state.torchOn, camera) {
        val control = camera ?: return@LaunchedEffect
        if (camera?.cameraInfo?.hasFlashUnit() == true) {
            runCatching { control.cameraControl.enableTorch(state.torchOn) }
        }
    }

    val staged = state.staged
    Box(modifier = modifier.fillMaxSize().background(Color.Black)) {
        when {
            staged != null -> {
                AsyncImage(
                    model = File(staged.path),
                    contentDescription = stringResource(R.string.capture_preview_cd),
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize(),
                )
            }

            state.permission == CameraPermission.Granted && surfaceRequest != null -> {
                CameraXViewfinder(
                    surfaceRequest = requireNotNull(surfaceRequest),
                    modifier = Modifier
                        .fillMaxSize()
                        .clearAndSetSemantics {
                            contentDescription =
                                resources.getString(R.string.capture_viewfinder_cd)
                        },
                )
            }

            else -> Box(modifier = Modifier.fillMaxSize().background(Color.Black))
        }

        if (state.staged == null) ViewfinderBrackets(modifier = Modifier.fillMaxSize())

        CaptureOverlay(
            state = state,
            hasTorch = camera?.cameraInfo?.hasFlashUnit() ?: false,
            onBack = onBack,
            onToggleTorch = viewModel::toggleTorch,
            onMealTypeChange = viewModel::setMealType,
            onOpenPhotoPicker = {
                photoPickerLauncher.launch(
                    PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly),
                )
            },
            onShutter = {
                val capture = imageCapture ?: return@CaptureOverlay
                val target = File(context.cacheDir, "capture-${System.currentTimeMillis()}.jpg")
                capture.takePicture(
                    ImageCapture.OutputFileOptions.Builder(target).build(),
                    ContextCompat.getMainExecutor(context),
                    object : ImageCapture.OnImageSavedCallback {
                        override fun onImageSaved(output: ImageCapture.OutputFileResults) {
                            viewModel.onPhotoChosen(Uri.fromFile(target), target.name)
                        }

                        override fun onError(exception: ImageCaptureException) {
                            target.delete()
                            viewModel.onShutterFailed()
                        }
                    },
                )
            },
            onRetake = viewModel::retake,
            onAnalyze = viewModel::analyze,
            onRequestPermission = { permissionLauncher.launch(Manifest.permission.CAMERA) },
            onOpenSettings = { context.openAppSettings() },
            modifier = Modifier.fillMaxSize(),
        )
    }
}

/**
 * Everything drawn over the viewfinder. Camera-free, so it previews.
 */
@Composable
internal fun CaptureOverlay(
    state: CaptureMealUiState,
    hasTorch: Boolean,
    onBack: () -> Unit,
    onToggleTorch: () -> Unit,
    onMealTypeChange: (MealType) -> Unit,
    onOpenPhotoPicker: () -> Unit,
    onShutter: () -> Unit,
    onRetake: () -> Unit,
    onAnalyze: () -> Unit,
    onRequestPermission: () -> Unit,
    onOpenSettings: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier) {
        CaptureHeader(
            hasTorch = hasTorch && state.staged == null,
            torchOn = state.torchOn,
            onBack = onBack,
            onToggleTorch = onToggleTorch,
        )

        Box(modifier = Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
            // A photo picked from the gallery is reviewable without the camera,
            // so a staged photo always shows the guidance, never the rationale.
            when {
                state.staged != null || state.permission == CameraPermission.Granted ->
                    CaptureGuidance(state = state)

                state.permission == CameraPermission.PermanentlyDenied -> CameraRationale(
                    permanentlyDenied = true,
                    onPrimary = onOpenSettings,
                    onOpenPhotoPicker = onOpenPhotoPicker,
                )

                else -> CameraRationale(
                    permanentlyDenied = false,
                    onPrimary = onRequestPermission,
                    onOpenPhotoPicker = onOpenPhotoPicker,
                )
            }
        }

        // Rendered, not animated in: an error banner must not depend on motion.
        state.banner?.let { CaptureBannerRow(banner = it) }

        CaptureControls(
            state = state,
            onMealTypeChange = onMealTypeChange,
            onOpenPhotoPicker = onOpenPhotoPicker,
            onShutter = onShutter,
            onRetake = onRetake,
            onAnalyze = onAnalyze,
        )
    }
}

@Composable
private fun CaptureHeader(
    hasTorch: Boolean,
    torchOn: Boolean,
    onBack: () -> Unit,
    onToggleTorch: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color.Black.copy(alpha = 0.45f))
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        RoundIconButton(
            icon = Icons.Outlined.Close,
            contentDescription = stringResource(R.string.capture_close_cd),
            onClick = onBack,
        )
        Column(
            modifier = Modifier.weight(1f),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = stringResource(R.string.capture_title),
                style = MaterialTheme.typography.titleLarge,
                color = LocalAzfExtended.current.primaryFixedDim,
            )
            Text(
                text = stringResource(R.string.capture_subtitle),
                style = MaterialTheme.typography.labelSmall,
                color = Color.White.copy(alpha = 0.7f),
            )
        }
        if (hasTorch) {
            RoundIconButton(
                icon = if (torchOn) Icons.Outlined.FlashlightOn else Icons.Outlined.FlashlightOff,
                contentDescription = stringResource(
                    if (torchOn) R.string.capture_torch_off_cd else R.string.capture_torch_on_cd,
                ),
                onClick = onToggleTorch,
            )
        } else {
            Spacer(modifier = Modifier.size(40.dp))
        }
    }
}

@Composable
private fun CaptureGuidance(state: CaptureMealUiState) {
    when {
        state.uploading -> Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier
                .clip(AzfShapes.Inner)
                .background(Color.Black.copy(alpha = 0.55f))
                .padding(24.dp)
                .semantics { liveRegion = LiveRegionMode.Polite },
        ) {
            CircularProgressIndicator(color = LocalAzfExtended.current.primaryFixedDim)
            Spacer(modifier = Modifier.height(12.dp))
            Text(
                text = stringResource(R.string.capture_uploading),
                style = MaterialTheme.typography.bodyMedium,
                color = Color.White,
            )
        }

        state.preparing -> Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier
                .clip(AzfShapes.Inner)
                .background(Color.Black.copy(alpha = 0.55f))
                .padding(24.dp)
                .semantics { liveRegion = LiveRegionMode.Polite },
        ) {
            CircularProgressIndicator(color = LocalAzfExtended.current.primaryFixedDim)
            Spacer(modifier = Modifier.height(12.dp))
            Text(
                text = stringResource(R.string.capture_preparing),
                style = MaterialTheme.typography.bodyMedium,
                color = Color.White,
            )
        }

        else -> Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier
                .padding(horizontal = 24.dp)
                .clip(AzfShapes.Inner)
                .background(Color.Black.copy(alpha = 0.4f))
                .padding(horizontal = 20.dp, vertical = 12.dp),
        ) {
            Text(
                text = stringResource(
                    if (state.staged != null) {
                        R.string.capture_hint_ready
                    } else {
                        R.string.capture_hint_frame
                    },
                ),
                style = MaterialTheme.typography.bodyMedium,
                color = Color.White,
                textAlign = TextAlign.Center,
            )
            if (state.staged == null) {
                Text(
                    text = stringResource(R.string.capture_hint_lighting),
                    style = MaterialTheme.typography.bodySmall,
                    color = Color.White.copy(alpha = 0.7f),
                    textAlign = TextAlign.Center,
                )
            }
        }
    }
}

/** Inline error banner — matching the web, never a toast that can be missed. */
@Composable
private fun CaptureBannerRow(banner: CaptureBanner) {
    val text = banner.message ?: banner.messageRes?.let { stringResource(it) }.orEmpty()
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp, vertical = 8.dp)
            .clip(AzfShapes.Inner)
            .background(MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.9f))
            .border(1.dp, MaterialTheme.colorScheme.error, AzfShapes.Inner)
            .padding(horizontal = 16.dp, vertical = 12.dp)
            .semantics { liveRegion = LiveRegionMode.Assertive },
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onErrorContainer,
        )
    }
}

@Composable
private fun CaptureControls(
    state: CaptureMealUiState,
    onMealTypeChange: (MealType) -> Unit,
    onOpenPhotoPicker: () -> Unit,
    onShutter: () -> Unit,
    onRetake: () -> Unit,
    onAnalyze: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                Brush.verticalGradient(
                    listOf(Color.Transparent, Color.Black.copy(alpha = 0.85f), Color.Black),
                ),
            )
            .navigationBarsPadding()
            .padding(horizontal = 20.dp)
            .padding(top = 32.dp, bottom = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.padding(bottom = 20.dp),
        ) {
            NutritionFormat.MEAL_TYPES.forEach { mealType ->
                AzfChip(
                    text = stringResource(NutritionFormat.mealLabelRes(mealType)),
                    selected = state.mealType == mealType,
                    onClick = { onMealTypeChange(mealType) },
                )
            }
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            SquareIconButton(
                icon = Icons.Outlined.PhotoLibrary,
                contentDescription = stringResource(R.string.capture_gallery_cd),
                enabled = !state.uploading,
                onClick = onOpenPhotoPicker,
            )

            ShutterButton(
                enabled = state.permission == CameraPermission.Granted &&
                    state.staged == null &&
                    !state.uploading &&
                    !state.preparing,
                onClick = onShutter,
            )

            SquareIconButton(
                icon = Icons.Outlined.Replay,
                contentDescription = stringResource(R.string.capture_retake_cd),
                enabled = state.staged != null && !state.uploading,
                onClick = onRetake,
            )
        }

        if (state.staged != null) {
            PrimaryButton(
                text = stringResource(R.string.capture_analyze),
                onClick = onAnalyze,
                enabled = state.canAnalyze,
                loading = state.uploading,
                modifier = Modifier.padding(top = 20.dp),
            )
        }
    }
}

/** Camera permission rationale, with a graceful permanently-denied branch. */
@Composable
internal fun CameraRationale(
    permanentlyDenied: Boolean,
    onPrimary: () -> Unit,
    onOpenPhotoPicker: () -> Unit,
    modifier: Modifier = Modifier,
) {
    AzfCard(
        modifier = modifier.padding(horizontal = 20.dp),
        tier = AzfCardTier.Standard,
    ) {
        Text(
            text = stringResource(R.string.capture_permission_title),
            style = MaterialTheme.typography.titleLarge,
            color = MaterialTheme.colorScheme.onSurface,
        )
        Text(
            text = stringResource(
                if (permanentlyDenied) {
                    R.string.capture_permission_blocked_body
                } else {
                    R.string.capture_permission_body
                },
            ),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 8.dp),
        )
        PrimaryButton(
            text = stringResource(
                if (permanentlyDenied) {
                    R.string.capture_permission_settings
                } else {
                    R.string.capture_permission_grant
                },
            ),
            onClick = onPrimary,
            modifier = Modifier.padding(top = 20.dp),
        )
        SecondaryButton(
            text = stringResource(R.string.capture_permission_use_gallery),
            onClick = onOpenPhotoPicker,
            modifier = Modifier.padding(top = 12.dp),
        )
    }
}

/** The four corner brackets framing the plate. */
@Composable
internal fun ViewfinderBrackets(modifier: Modifier = Modifier) {
    val accent = LocalAzfExtended.current.primaryFixedDim
    Box(modifier = modifier.padding(horizontal = 32.dp, vertical = 120.dp)) {
        Bracket(accent, Alignment.TopStart)
        Bracket(accent, Alignment.TopEnd)
        Bracket(accent, Alignment.BottomStart)
        Bracket(accent, Alignment.BottomEnd)
    }
}

@Composable
private fun BoxScope.Bracket(
    color: Color,
    alignment: Alignment,
) {
    val thickness = 3.dp
    val length = 36.dp
    Box(modifier = Modifier.align(alignment)) {
        Box(
            modifier = Modifier
                .width(length)
                .height(thickness)
                .background(color.copy(alpha = 0.85f)),
        )
    }
    Box(modifier = Modifier.align(alignment)) {
        Box(
            modifier = Modifier
                .width(thickness)
                .height(length)
                .background(color.copy(alpha = 0.85f)),
        )
    }
}

@Composable
private fun RoundIconButton(
    icon: ImageVector,
    contentDescription: String,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .size(40.dp)
            .clip(CircleShape)
            .background(Color.White.copy(alpha = 0.12f)),
        contentAlignment = Alignment.Center,
    ) {
        IconButton(onClick = onClick) {
            Icon(
                imageVector = icon,
                contentDescription = contentDescription,
                tint = Color.White,
            )
        }
    }
}

@Composable
private fun SquareIconButton(
    icon: ImageVector,
    contentDescription: String,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .size(56.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(Color.White.copy(alpha = if (enabled) 0.14f else 0.05f)),
        contentAlignment = Alignment.Center,
    ) {
        IconButton(onClick = onClick, enabled = enabled) {
            Icon(
                imageVector = icon,
                contentDescription = contentDescription,
                tint = Color.White.copy(alpha = if (enabled) 1f else 0.4f),
            )
        }
    }
}

@Composable
private fun ShutterButton(enabled: Boolean, onClick: () -> Unit) {
    val label = stringResource(R.string.capture_shutter_cd)
    Box(
        modifier = Modifier
            .size(80.dp)
            .clip(CircleShape)
            .background(Color.White.copy(alpha = if (enabled) 1f else 0.35f)),
        contentAlignment = Alignment.Center,
    ) {
        IconButton(
            onClick = onClick,
            enabled = enabled,
            modifier = Modifier.size(80.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(68.dp)
                    .clip(CircleShape)
                    .border(3.dp, Color.Black.copy(alpha = 0.6f), CircleShape)
                    .semantics { contentDescription = label },
            )
        }
    }
}

// ---------------------------------------------------------------------------
// Platform helpers
// ---------------------------------------------------------------------------

internal fun Context.findActivity(): Activity? {
    var current: Context? = this
    while (current is ContextWrapper) {
        if (current is Activity) return current
        current = current.baseContext
    }
    return null
}

internal fun Activity.shouldShowCameraRationale(): Boolean =
    shouldShowRequestPermissionRationale(Manifest.permission.CAMERA)

/** Deep-link into this app's settings page so a blocked permission is fixable. */
internal fun Context.openAppSettings() {
    val intent = Intent(
        Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
        Uri.fromParts("package", packageName, null),
    ).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
    runCatching { startActivity(intent) }
}

/**
 * Await a CameraX `ListenableFuture` without pulling in a futures-ktx dependency.
 *
 * `resumeWith(runCatching { get() })` rather than `resume(get())`, and the
 * difference is a crash. The listener body runs on the MAIN executor, outside
 * the coroutine: if the future completed exceptionally, a bare `get()` throws
 * `ExecutionException` from a Runnable on the main Looper before `resume` is
 * ever reached. Nothing can catch it there — not the enclosing `scope.launch`,
 * not the `runCatching` the call sites open on the following line, not
 * `invokeOnCancellation`. The process dies.
 *
 * That is not hypothetical: the manifest declares
 * `<uses-feature android:name="android.hardware.camera" android:required="false" />`,
 * so Play installs this on camera-less devices where
 * `ProcessCameraProvider.getInstance()` fails with `InitializationException`
 * every time. Routing the failure through `runCatching` hands it to the
 * continuation instead, where the callers' existing error handling sees it.
 */
internal suspend fun <T> ListenableFuture<T>.awaitOnMain(
    context: Context,
): T = suspendCancellableCoroutine { continuation ->
    val executor: Executor = ContextCompat.getMainExecutor(context)
    addListener({ continuation.resumeWith(runCatching { get() }) }, executor)
    continuation.invokeOnCancellation { cancel(false) }
}

// ---------------------------------------------------------------------------
// Previews — the viewfinder cannot render in a preview, so the overlay is
// previewed over a flat stand-in surface.
// ---------------------------------------------------------------------------

@ComposePreview(showBackground = true, backgroundColor = 0xFF000000, heightDp = 720)
@Composable
private fun CaptureOverlayReadyPreview() {
    AzfTheme {
        Box(modifier = Modifier.fillMaxSize().background(Color(0xFF11201F))) {
            ViewfinderBrackets(modifier = Modifier.fillMaxSize())
            CaptureOverlay(
                state = CaptureMealUiState(
                    mealType = MealType.LUNCH,
                    permission = CameraPermission.Granted,
                    staged = StagedPhoto("/cache/meal-photos/stage.jpg", 812_345L),
                ),
                hasTorch = true,
                onBack = {},
                onToggleTorch = {},
                onMealTypeChange = {},
                onOpenPhotoPicker = {},
                onShutter = {},
                onRetake = {},
                onAnalyze = {},
                onRequestPermission = {},
                onOpenSettings = {},
                modifier = Modifier.fillMaxSize(),
            )
        }
    }
}

@ComposePreview(showBackground = true, backgroundColor = 0xFF000000, heightDp = 720)
@Composable
private fun CaptureOverlayErrorPreview() {
    AzfTheme {
        Box(modifier = Modifier.fillMaxSize().background(Color(0xFF11201F))) {
            CaptureOverlay(
                state = CaptureMealUiState(
                    permission = CameraPermission.Granted,
                    banner = CaptureBanner(messageRes = R.string.capture_error_too_large),
                ),
                hasTorch = false,
                onBack = {},
                onToggleTorch = {},
                onMealTypeChange = {},
                onOpenPhotoPicker = {},
                onShutter = {},
                onRetake = {},
                onAnalyze = {},
                onRequestPermission = {},
                onOpenSettings = {},
                modifier = Modifier.fillMaxSize(),
            )
        }
    }
}

@ComposePreview(showBackground = true, backgroundColor = 0xFF0E1416)
@Composable
private fun CameraRationaleBlockedPreview() {
    AzfTheme {
        CameraRationale(permanentlyDenied = true, onPrimary = {}, onOpenPhotoPicker = {})
    }
}
