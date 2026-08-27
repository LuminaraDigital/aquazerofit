package fit.aquazero.app.feature.nutrition

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.Preview as CameraPreview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.LocalLifecycleOwner
import fit.aquazero.app.R
import fit.aquazero.app.core.designsystem.AzfAppHeader
import fit.aquazero.app.core.designsystem.AzfChip
import fit.aquazero.app.core.designsystem.AzfColors
import fit.aquazero.app.core.designsystem.AzfSpacing
import fit.aquazero.app.core.designsystem.PrimaryButton
import fit.aquazero.app.core.network.dto.MealType
import fit.aquazero.app.feature.dashboard.NutritionFormat
import java.io.File

@Composable
fun CaptureMealScreen(
    onBack: () -> Unit,
    onNavigateToAnalysis: (String) -> Unit,
    modifier: Modifier = Modifier,
    viewModel: CaptureMealViewModel = hiltViewModel(),
) {
    val state by viewModel.uploadState.collectAsState()
    val context = LocalContext.current
    var hasCameraPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.CAMERA
            ) == PackageManager.PERMISSION_GRANTED
        )
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        hasCameraPermission = isGranted
    }

    LaunchedEffect(Unit) {
        if (!hasCameraPermission) {
            permissionLauncher.launch(Manifest.permission.CAMERA)
        }
    }

    LaunchedEffect(state) {
        if (state is UploadState.Success) {
            onNavigateToAnalysis((state as UploadState.Success).jobId)
            viewModel.reset()
        }
    }

    CaptureMealContent(
        state = state,
        hasPermission = hasCameraPermission,
        onRequestPermission = { permissionLauncher.launch(Manifest.permission.CAMERA) },
        onBack = onBack,
        onCapturePhoto = { uri, mealType ->
            viewModel.upload(uri, mealType)
        },
        modifier = modifier
    )
}

@Composable
fun CaptureMealContent(
    state: UploadState,
    hasPermission: Boolean,
    onRequestPermission: () -> Unit,
    onBack: () -> Unit,
    onCapturePhoto: (Uri, MealType) -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    var selectedMealType by remember { mutableStateOf(NutritionFormat.mealTypeForNow()) }
    var imageCapture: ImageCapture? by remember { mutableStateOf(null) }

    Scaffold(
        modifier = modifier.fillMaxSize(),
        topBar = {
            AzfAppHeader(title = stringResource(R.string.screen_capture_meal).uppercase(), onBack = onBack)
        }
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .padding(innerPadding)
                .fillMaxSize()
                .background(Color.Black)
        ) {
            if (hasPermission) {
                AndroidView(
                    factory = { ctx ->
                        val previewView = PreviewView(ctx)
                        val cameraProviderFuture = ProcessCameraProvider.getInstance(ctx)
                        cameraProviderFuture.addListener({
                            val cameraProvider = cameraProviderFuture.get()
                            val preview = CameraPreview.Builder().build().also {
                                it.surfaceProvider = previewView.surfaceProvider
                            }
                            val capture = ImageCapture.Builder()
                                .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
                                .build()
                            imageCapture = capture

                            try {
                                cameraProvider.unbindAll()
                                cameraProvider.bindToLifecycle(
                                    lifecycleOwner,
                                    CameraSelector.DEFAULT_BACK_CAMERA,
                                    preview,
                                    capture
                                )
                            } catch (e: Exception) {
                                e.printStackTrace()
                            }
                        }, ContextCompat.getMainExecutor(ctx))
                        previewView
                    },
                    modifier = Modifier.fillMaxSize()
                )
            } else {
                Column(
                    modifier = Modifier
                        .align(Alignment.Center)
                        .padding(AzfSpacing.ContainerMargin),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        text = "Camera Permission Required",
                        style = MaterialTheme.typography.titleMedium,
                        color = Color.White
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "AquaZeroFit needs camera access to analyze meal photos and estimate macros.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = Color.White.copy(alpha = 0.7f),
                        modifier = Modifier.padding(bottom = 16.dp)
                    )
                    PrimaryButton(
                        text = "Grant Permission",
                        onClick = onRequestPermission
                    )
                }
            }

            // Meal Type Selector Chips
            Row(
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .fillMaxWidth()
                    .padding(top = 16.dp, start = 16.dp, end = 16.dp),
                horizontalArrangement = Arrangement.SpaceEvenly
            ) {
                NutritionFormat.MEAL_TYPES.forEach { mealType ->
                    AzfChip(
                        text = stringResource(NutritionFormat.mealLabelRes(mealType)),
                        selected = selectedMealType == mealType,
                        onClick = { selectedMealType = mealType }
                    )
                }
            }

            // Bottom Shutter & Status Controls
            Column(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(24.dp)
                    .fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                if (state is UploadState.Uploading) {
                    CircularProgressIndicator(color = AzfColors.PrimaryFixedDim)
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "Uploading meal for AI analysis...",
                        style = MaterialTheme.typography.bodySmall,
                        color = Color.White
                    )
                } else {
                    if (state is UploadState.Error) {
                        Text(
                            text = state.message,
                            color = MaterialTheme.colorScheme.error,
                            modifier = Modifier.padding(bottom = 12.dp)
                        )
                    }

                    if (hasPermission) {
                        IconButton(
                            onClick = {
                                val capture = imageCapture ?: return@IconButton
                                val photoFile = File(context.cacheDir, "meal_${System.currentTimeMillis()}.jpg")
                                val outputOptions = ImageCapture.OutputFileOptions.Builder(photoFile).build()
                                capture.takePicture(
                                    outputOptions,
                                    ContextCompat.getMainExecutor(context),
                                    object : ImageCapture.OnImageSavedCallback {
                                        override fun onImageSaved(output: ImageCapture.OutputFileResults) {
                                            onCapturePhoto(Uri.fromFile(photoFile), selectedMealType)
                                        }

                                        override fun onError(exc: ImageCaptureException) {
                                            exc.printStackTrace()
                                        }
                                    }
                                )
                            },
                            modifier = Modifier
                                .size(72.dp)
                                .clip(CircleShape)
                                .background(AzfColors.PrimaryFixedDim)
                        ) {
                            Icon(
                                imageVector = Icons.Default.CameraAlt,
                                contentDescription = "Capture",
                                tint = AzfColors.Background,
                                modifier = Modifier.size(36.dp)
                            )
                        }
                    }
                }
            }
        }
    }
}

