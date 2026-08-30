package fit.aquazero.app.feature.nutrition.barcode

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.compose.CameraXViewfinder
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.core.SurfaceRequest
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.mlkit.vision.MlKitAnalyzer
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.FlashlightOff
import androidx.compose.material.icons.outlined.FlashlightOn
import androidx.compose.material.icons.outlined.Warning
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.google.android.gms.common.moduleinstall.ModuleInstall
import com.google.mlkit.vision.barcode.BarcodeScanner
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import fit.aquazero.app.R
import fit.aquazero.app.core.designsystem.AzfCard
import fit.aquazero.app.core.designsystem.AzfCardTier
import fit.aquazero.app.core.designsystem.AzfChip
import fit.aquazero.app.core.designsystem.AzfShapes
import fit.aquazero.app.core.designsystem.AzfSpacing
import fit.aquazero.app.core.designsystem.AzfTextField
import fit.aquazero.app.core.designsystem.AzfTheme
import fit.aquazero.app.core.designsystem.DataSmall
import fit.aquazero.app.core.designsystem.GramsStepper
import fit.aquazero.app.core.designsystem.LocalAzfExtended
import fit.aquazero.app.core.designsystem.PrimaryButton
import fit.aquazero.app.core.designsystem.SecondaryButton
import fit.aquazero.app.core.designsystem.Skeleton
import fit.aquazero.app.core.designsystem.rememberReducedMotion
import fit.aquazero.app.core.model.Allergen
import fit.aquazero.app.core.model.FoodDto
import fit.aquazero.app.core.model.FoodNutrientsDto
import fit.aquazero.app.core.model.MealType
import fit.aquazero.app.core.model.Nutriscore
import fit.aquazero.app.feature.dashboard.NutritionFormat
import fit.aquazero.app.feature.nutrition.CameraPermission
import fit.aquazero.app.feature.nutrition.NutritionMath
import fit.aquazero.app.feature.nutrition.awaitOnMain
import fit.aquazero.app.feature.nutrition.findActivity
import fit.aquazero.app.feature.nutrition.openAppSettings
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import androidx.compose.ui.tooling.preview.Preview as ComposePreview

/** ML Kit formats we ask for: retail product codes only. */
private val BARCODE_FORMATS = intArrayOf(
    Barcode.FORMAT_EAN_13,
    Barcode.FORMAT_EAN_8,
    Barcode.FORMAT_UPC_A,
    Barcode.FORMAT_UPC_E,
)

/**
 * Ask Play services to fetch the barcode model in the background.
 *
 * We ship the *unbundled* scanner (`play-services-mlkit-barcode-scanning`),
 * which carries no native model — that is what keeps 20.2 MB of
 * `libbarhopper_v3.so` out of the APK. The price is that on a device which has
 * never scanned anything the model is not there yet, and the first scan either
 * stalls behind a download or fails outright.
 *
 * `deferredInstall` fixes that without costing the user anything: it queues the
 * download for a moment Play services considers cheap and returns immediately.
 * It is a no-op once the module is present, so calling it speculatively — on
 * every visit to the nutrition tab, on every scanner failure — is correct and
 * free. Nothing here is awaited and nothing here reports success; treat it as a
 * hint, never as a precondition.
 *
 * Every line of it can throw on a device with no Play services, broken Play
 * services, or a stripped ROM — which is precisely the device this exists to
 * help — so the whole thing is swallowed. A failed hint must never be the
 * reason a screen does not open.
 */
fun prefetchBarcodeScannerModule(context: Context) {
    runCatching {
        // The scanner client doubles as the `OptionalModuleApi` descriptor that
        // names the module to fetch; close it once the request is lodged so we
        // do not leave a detector pipeline open just to read a descriptor.
        val descriptor = BarcodeScanning.getClient()
        ModuleInstall.getClient(context)
            .deferredInstall(descriptor)
            .addOnCompleteListener { descriptor.close() }
    }
}

/**
 * Barcode scan-and-log sheet.
 *
 * Scanning runs entirely on-device through ML Kit's barcode model
 * (`MlKitAnalyzer` + `camera-mlkit-vision`) — no frames leave the phone, so
 * this adds nothing to the Data safety declaration. Only the resolved code is
 * sent, to `GET /foods/barcode/:code`.
 *
 * The model itself lives in Play services rather than in our APK (see
 * [prefetchBarcodeScannerModule]), so "the scanner works" is not something this
 * screen may assume. [LiveScanner] treats a scanner that will not start as an
 * ordinary state, not as an error, and the manual-entry field below it is
 * always on screen for exactly that reason.
 *
 * Three things are non-negotiable in the result card: the Nutri-Score badge,
 * the deterministic allergen warning (declared allergens ∩ the user's
 * profile — see [BarcodeRules]), and the Open Food Facts attribution the ODbL
 * requires.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BarcodeScannerSheet(
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    onLogged: (String) -> Unit = {},
    viewModel: BarcodeScannerViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val context = LocalContext.current
    val haptics = LocalHapticFeedback.current

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
    ) { granted ->
        viewModel.onPermissionResult(
            granted = granted,
            canAskAgain = granted ||
                context.findActivity()?.shouldShowRequestPermissionRationale(
                    Manifest.permission.CAMERA,
                ) == true,
        )
    }

    LaunchedEffect(Unit) {
        // Backstop only. By the time the sheet is open this is too late to help
        // *this* scan, so the lead wires the real call at the nutrition tab —
        // but a cheap no-op here means a device that failed once has the model
        // queued before the user tries again.
        prefetchBarcodeScannerModule(context)
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

    // Haptic confirmation the instant a code is accepted.
    LaunchedEffect(state.scanHitToken) {
        if (state.scanHitToken > 0L) {
            haptics.performHapticFeedback(HapticFeedbackType.Confirm)
        }
    }

    LaunchedEffect(viewModel) {
        viewModel.eventFlow.collect { event ->
            when (event) {
                is BarcodeEvent.Logged -> {
                    haptics.performHapticFeedback(HapticFeedbackType.Confirm)
                    onLogged(event.name)
                    onDismiss()
                }
            }
        }
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
        modifier = modifier,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .navigationBarsPadding()
                .padding(horizontal = AzfSpacing.ContainerMargin)
                .padding(bottom = AzfSpacing.ContainerMargin),
            verticalArrangement = Arrangement.spacedBy(AzfSpacing.ElementGapSmall),
        ) {
            Text(
                text = stringResource(R.string.barcode_title),
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onSurface,
            )

            val result = state.result
            if (result == null) {
                ScannerPane(
                    state = state,
                    onToggleTorch = viewModel::toggleTorch,
                    onDetected = viewModel::onBarcodeDetected,
                    onRequestPermission = {
                        permissionLauncher.launch(Manifest.permission.CAMERA)
                    },
                    onOpenSettings = { context.openAppSettings() },
                )
                ManualEntry(
                    state = state,
                    onCodeChange = viewModel::setManualCode,
                    onSubmit = viewModel::submitManualCode,
                )
                if (state.looking) {
                    Skeleton(modifier = Modifier.fillMaxWidth().height(96.dp))
                }
                if (state.notFound && !state.looking) {
                    InlineNotice(
                        text = stringResource(R.string.barcode_not_found),
                        tone = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            } else {
                BarcodeResultCard(
                    result = result,
                    grams = state.grams,
                    mealType = state.mealType,
                    logging = state.logging,
                    onGramsChange = viewModel::setGrams,
                    onMealTypeChange = viewModel::setMealType,
                    onLog = viewModel::logPortion,
                    onScanAnother = viewModel::scanAnother,
                )
            }

            state.banner?.let { banner ->
                InlineNotice(
                    text = banner.message
                        ?: banner.messageRes?.let { stringResource(it) }.orEmpty(),
                    tone = MaterialTheme.colorScheme.error,
                    assertive = true,
                )
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Camera pane
// ---------------------------------------------------------------------------

@Composable
private fun ScannerPane(
    state: BarcodeUiState,
    onToggleTorch: () -> Unit,
    onDetected: (String?) -> Unit,
    onRequestPermission: () -> Unit,
    onOpenSettings: () -> Unit,
) {
    when (state.permission) {
        CameraPermission.Granted -> LiveScanner(
            state = state,
            onToggleTorch = onToggleTorch,
            onDetected = onDetected,
        )

        CameraPermission.PermanentlyDenied -> ScannerUnavailable(
            bodyRes = R.string.barcode_permission_blocked,
            actionRes = R.string.capture_permission_settings,
            onAction = onOpenSettings,
        )

        CameraPermission.Denied, CameraPermission.Unknown -> ScannerUnavailable(
            bodyRes = R.string.barcode_permission_body,
            actionRes = R.string.capture_permission_grant,
            onAction = onRequestPermission,
        )
    }
}

@Composable
private fun ScannerUnavailable(bodyRes: Int, actionRes: Int, onAction: () -> Unit) {
    AzfCard(tier = AzfCardTier.Compact) {
        Text(
            text = stringResource(bodyRes),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        SecondaryButton(
            text = stringResource(actionRes),
            onClick = onAction,
            modifier = Modifier.padding(top = 12.dp),
        )
    }
}

@Composable
private fun LiveScanner(
    state: BarcodeUiState,
    onToggleTorch: () -> Unit,
    onDetected: (String?) -> Unit,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val scope = rememberCoroutineScope()
    var surfaceRequest by remember { mutableStateOf<SurfaceRequest?>(null) }
    var camera by remember { mutableStateOf<Camera?>(null) }
    var hasTorch by remember { mutableStateOf(false) }
    var unavailable by remember { mutableStateOf(false) }
    // Bumped by the retry button; it is a key of the effect below, so a new
    // value tears the old attempt down and starts a clean one.
    var attempt by remember { mutableIntStateOf(0) }

    DisposableEffect(lifecycleOwner, attempt) {
        var provider: ProcessCameraProvider? = null
        var scanner: BarcodeScanner? = null
        var analysis: ImageAnalysis? = null
        val job = scope.launch {
            // The WHOLE body is guarded, on purpose. This coroutine belongs to
            // `rememberCoroutineScope()`, which carries no exception handler:
            // anything that escapes it is an unhandled coroutine exception and
            // takes the process down. Three separate calls below throw on
            // devices that are otherwise working perfectly well:
            //
            //   * `ProcessCameraProvider.getInstance` — no camera at all, or a
            //     vendor HAL that fails to initialise;
            //   * `BarcodeScanning.getClient` — `MlKitException.UNAVAILABLE`
            //     when Play services has not fetched the unbundled model yet or
            //     is not on the device, and `IllegalStateException` if R8 ever
            //     drops the ML Kit component registrar (the keep rule in
            //     proguard-rules.pro guards that one trigger, and only that
            //     one);
            //   * `bindToLifecycle` — the camera is already held elsewhere.
            //
            // Only the last of those used to be covered. Narrowing this back to
            // the bind call, or to any subset, restores the crash. If you need
            // finer-grained handling, nest a `runCatching` inside — do not
            // shrink this one.
            runCatching {
                val cameraProvider = ProcessCameraProvider.getInstance(context).awaitOnMain(context)
                provider = cameraProvider
                val options = BarcodeScannerOptions.Builder()
                    .setBarcodeFormats(BARCODE_FORMATS.first(), *BARCODE_FORMATS.drop(1).toIntArray())
                    .build()
                val barcodeScanner = BarcodeScanning.getClient(options)
                scanner = barcodeScanner

                val preview = Preview.Builder().build().apply {
                    setSurfaceProvider { request -> surfaceRequest = request }
                }
                val imageAnalysis = ImageAnalysis.Builder()
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .build()
                analysis = imageAnalysis
                val executor = ContextCompat.getMainExecutor(context)
                imageAnalysis.setAnalyzer(
                    executor,
                    MlKitAnalyzer(
                        listOf(barcodeScanner),
                        ImageAnalysis.COORDINATE_SYSTEM_ORIGINAL,
                        executor,
                    ) { result ->
                        val hit = result.getValue(barcodeScanner)?.firstOrNull { barcode ->
                            barcode.format in BARCODE_FORMATS
                        }
                        onDetected(hit?.rawValue)
                    },
                )

                cameraProvider.unbindAll()
                camera = cameraProvider.bindToLifecycle(
                    lifecycleOwner,
                    CameraSelector.DEFAULT_BACK_CAMERA,
                    preview,
                    imageAnalysis,
                )
                hasTorch = camera?.cameraInfo?.hasFlashUnit() == true
            }.onFailure { error ->
                // Cancellation is not a failure. `onDispose` cancels this job on
                // every teardown and on every retry, and `runCatching` catches
                // `CancellationException` like anything else — swallowing it
                // here would break structured concurrency and would light the
                // error state up on the way out, permanently wedging retry.
                if (error is CancellationException) throw error
                unavailable = true
                // The most likely cause is a model that is not on the device
                // yet, so queue it before offering the retry.
                prefetchBarcodeScannerModule(context)
            }
        }
        onDispose {
            job.cancel()
            analysis?.clearAnalyzer()
            provider?.unbindAll()
            scanner?.close()
            camera = null
            surfaceRequest = null
            hasTorch = false
        }
    }

    LaunchedEffect(state.torchOn, camera) {
        val bound = camera ?: return@LaunchedEffect
        if (bound.cameraInfo.hasFlashUnit()) {
            runCatching { bound.cameraControl.enableTorch(state.torchOn) }
        }
    }

    if (unavailable) {
        ScannerUnavailable(
            bodyRes = R.string.barcode_scanner_unavailable,
            actionRes = R.string.barcode_scanner_retry,
            onAction = {
                unavailable = false
                attempt++
            },
        )
    } else {
        CameraSurface(
            surfaceRequest = surfaceRequest,
            torchOn = state.torchOn,
            hasTorch = hasTorch,
            onToggleTorch = onToggleTorch,
        )
    }
}

/** The viewfinder itself: preview, reticle, and the torch toggle over the top. */
@Composable
private fun CameraSurface(
    surfaceRequest: SurfaceRequest?,
    torchOn: Boolean,
    hasTorch: Boolean,
    onToggleTorch: () -> Unit,
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .aspectRatio(4f / 3f)
            .clip(AzfShapes.Inner)
            .background(Color.Black),
    ) {
        surfaceRequest?.let { request ->
            CameraXViewfinder(
                surfaceRequest = request,
                modifier = Modifier.fillMaxWidth().aspectRatio(4f / 3f),
            )
        }
        ScanReticle(modifier = Modifier.align(Alignment.Center))
        if (hasTorch) {
            IconButton(
                onClick = onToggleTorch,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(8.dp)
                    .clip(CircleShape)
                    .background(Color.Black.copy(alpha = 0.5f)),
            ) {
                Icon(
                    imageVector = if (torchOn) {
                        Icons.Outlined.FlashlightOn
                    } else {
                        Icons.Outlined.FlashlightOff
                    },
                    contentDescription = stringResource(
                        if (torchOn) {
                            R.string.capture_torch_off_cd
                        } else {
                            R.string.capture_torch_on_cd
                        },
                    ),
                    tint = Color.White,
                )
            }
        }
    }
}

private val RETICLE_WIDTH = 240.dp
private val RETICLE_HEIGHT = 140.dp

/**
 * How far the scan line travels either side of the reticle's centre, as a
 * fraction of [RETICLE_HEIGHT]. At 0.35 the line swings ±49dp about the 70dp
 * midpoint of a 140dp box — 21dp to 119dp — which stops it just inside the
 * 18dp corner brackets at both ends. The animation runs over the *full* signed
 * range; anything that discards the negative half halves the sweep.
 */
private const val SWEEP_FRACTION = 0.35f

/** Aiming reticle: corner brackets plus a sweeping line (motion-gated). */
@Composable
private fun ScanReticle(modifier: Modifier = Modifier) {
    val accent = LocalAzfExtended.current.primaryFixedDim
    val reducedMotion = rememberReducedMotion()
    val transition = rememberInfiniteTransition(label = "reticle")
    // Deliberately NOT `by`: destructuring the State here would read `sweep`
    // during composition, so every animation frame would recompose, remeasure
    // and relayout this subtree — sixty times a second, on the same main
    // thread that is already driving a CameraX preview and ML Kit analysis.
    // Held as a State and read inside the `graphicsLayer` lambda below, the
    // read happens in the draw phase instead: no composition, no layout.
    val sweep = transition.animateFloat(
        initialValue = -SWEEP_FRACTION,
        targetValue = SWEEP_FRACTION,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1600, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "sweep",
    )
    Box(
        modifier = modifier
            .width(RETICLE_WIDTH)
            .height(RETICLE_HEIGHT)
            .border(1.dp, accent.copy(alpha = 0.35f), RoundedCornerShape(12.dp)),
    ) {
        Corner(accent, Alignment.TopStart)
        Corner(accent, Alignment.TopEnd)
        Corner(accent, Alignment.BottomStart)
        Corner(accent, Alignment.BottomEnd)
        Box(
            modifier = Modifier
                .align(Alignment.Center)
                .fillMaxWidth()
                .height(2.dp)
                .padding(horizontal = 8.dp)
                // `translationY` is signed, so the line sweeps up as well as
                // down. The old `padding(top = ...)` could not go negative and
                // was clamped to zero, which silently threw away the whole
                // upper half of the travel.
                .then(
                    if (reducedMotion) {
                        Modifier
                    } else {
                        Modifier.graphicsLayer {
                            translationY = sweep.value * RETICLE_HEIGHT.toPx()
                        }
                    },
                )
                .background(accent.copy(alpha = 0.9f)),
        )
    }
}

@Composable
private fun BoxScope.Corner(color: Color, alignment: Alignment) {
    Box(modifier = Modifier.align(alignment).size(18.dp)) {
        Box(modifier = Modifier.fillMaxWidth().height(2.dp).background(color))
        Box(modifier = Modifier.width(2.dp).height(18.dp).background(color))
    }
}

// ---------------------------------------------------------------------------
// Manual entry + result
// ---------------------------------------------------------------------------

@Composable
private fun ManualEntry(
    state: BarcodeUiState,
    onCodeChange: (String) -> Unit,
    onSubmit: () -> Unit,
) {
    AzfTextField(
        value = state.manualCode,
        onValueChange = onCodeChange,
        label = stringResource(R.string.barcode_manual_label),
    )
    PrimaryButton(
        text = stringResource(R.string.barcode_lookup),
        onClick = onSubmit,
        enabled = state.canSubmitManual,
        loading = state.looking,
    )
}

@Composable
internal fun BarcodeResultCard(
    result: BarcodeResultUi,
    grams: Int,
    mealType: MealType,
    logging: Boolean,
    onGramsChange: (Int) -> Unit,
    onMealTypeChange: (MealType) -> Unit,
    onLog: () -> Unit,
    onScanAnother: () -> Unit,
) {
    val food = result.food
    val preview = NutritionFormat.itemFromFood(food, grams)

    // Allergen warning first — before the product is made appetising.
    if (result.verdict.hasWarning) AllergenWarning(result)

    AzfCard(tier = AzfCardTier.Standard) {
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = food.name,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    text = listOfNotNull(food.brand, food.category.takeIf { it.isNotBlank() })
                        .joinToString(" · "),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            food.nutriscore?.let { NutriscoreBadge(grade = it) }
        }

        Text(
            text = stringResource(
                R.string.barcode_per_100g,
                NutritionFormat.fmtInt(food.per100g.kcal),
                NutritionFormat.fmt1(food.per100g.proteinG),
                NutritionFormat.fmt1(food.per100g.carbsG),
                NutritionFormat.fmt1(food.per100g.fatG),
            ),
            style = DataSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 8.dp),
        )

        Row(
            modifier = Modifier.padding(top = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (food.isVegan == true) {
                DietChip(stringResource(R.string.barcode_vegan))
            } else if (food.isVegetarian == true) {
                DietChip(stringResource(R.string.barcode_vegetarian))
            }
        }

        // ODbL requires attribution wherever an OFF record is shown.
        if (result.showOffAttribution) {
            Text(
                text = stringResource(R.string.barcode_off_attribution),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 12.dp),
            )
        }
    }

    Row(
        modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(
            text = stringResource(R.string.barcode_portion),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface,
        )
        GramsStepper(grams = grams, onGramsChange = onGramsChange)
    }

    AzfCard(tier = AzfCardTier.Compact) {
        Text(
            text = stringResource(
                R.string.barcode_preview,
                NutritionFormat.fmtInt(preview.kcal),
                NutritionFormat.fmt1(preview.proteinG),
                NutritionFormat.fmt1(preview.carbsG),
                NutritionFormat.fmt1(preview.fatG),
            ),
            style = DataSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }

    Row(
        modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        NutritionFormat.MEAL_TYPES.forEach { type ->
            AzfChip(
                text = stringResource(NutritionFormat.mealLabelRes(type)),
                selected = mealType == type,
                onClick = { onMealTypeChange(type) },
            )
        }
    }

    PrimaryButton(
        text = stringResource(
            R.string.barcode_log_cta,
            grams,
            stringResource(NutritionFormat.mealLabelRes(mealType)),
        ),
        onClick = onLog,
        enabled = !logging,
        loading = logging,
        modifier = Modifier.padding(top = 8.dp),
    )
    SecondaryButton(text = stringResource(R.string.barcode_scan_another), onClick = onScanAnother)
}

/**
 * The deterministic allergen warning. Rendered from declared data only, and
 * assertive so TalkBack interrupts rather than queues it.
 */
@Composable
private fun AllergenWarning(result: BarcodeResultUi) {
    val coral = LocalAzfExtended.current.coral
    val hitLabels = result.verdict.hits.map { stringResource(NutritionMath.allergenLabel(it)) }
    val names = hitLabels.joinToString(", ")
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(AzfShapes.Inner)
            .border(1.dp, coral, AzfShapes.Inner)
            .background(coral.copy(alpha = 0.12f))
            .padding(14.dp)
            .semantics { liveRegion = LiveRegionMode.Assertive },
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                imageVector = Icons.Outlined.Warning,
                contentDescription = null,
                tint = coral,
                modifier = Modifier.size(18.dp),
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = stringResource(R.string.barcode_allergen_title),
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Bold,
                color = coral,
            )
        }
        Text(
            text = stringResource(
                when (result.verdict.kind) {
                    AllergenWarningKind.MayContainTraces -> R.string.barcode_allergen_traces_body
                    else -> R.string.barcode_allergen_contains_body
                },
                names,
            ),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 6.dp),
        )
    }
}

/** Nutri-Score A–E badge. */
@Composable
internal fun NutriscoreBadge(grade: Nutriscore) {
    val extended = LocalAzfExtended.current
    val background = when (grade) {
        Nutriscore.A -> extended.secondaryFixedDim
        Nutriscore.B -> extended.secondaryFixedDim.copy(alpha = 0.6f)
        Nutriscore.C -> extended.primaryFixedDim.copy(alpha = 0.7f)
        Nutriscore.D -> extended.coral.copy(alpha = 0.75f)
        Nutriscore.E -> extended.coral
    }
    val letter = grade.name
    val label = stringResource(R.string.barcode_nutriscore_cd, letter)
    Box(
        modifier = Modifier
            .size(28.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(background)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = letter,
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.Black,
            color = MaterialTheme.colorScheme.scrim,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun DietChip(label: String) {
    val accent = LocalAzfExtended.current.secondaryFixedDim
    Text(
        text = label,
        style = MaterialTheme.typography.labelSmall,
        color = accent,
        modifier = Modifier
            .clip(AzfShapes.Pill)
            .background(accent.copy(alpha = 0.15f))
            .padding(horizontal = 10.dp, vertical = 4.dp),
    )
}

@Composable
private fun InlineNotice(text: String, tone: Color, assertive: Boolean = false) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(AzfShapes.Inner)
            .border(1.dp, tone.copy(alpha = 0.5f), AzfShapes.Inner)
            .background(tone.copy(alpha = 0.08f))
            .padding(horizontal = 14.dp, vertical = 10.dp)
            .semantics {
                liveRegion = if (assertive) LiveRegionMode.Assertive else LiveRegionMode.Polite
            },
    ) {
        Text(text = text, style = MaterialTheme.typography.bodySmall, color = tone)
    }
}

// ---------------------------------------------------------------------------
// Previews — the camera pane cannot render, so the result card is previewed.
// ---------------------------------------------------------------------------

private fun previewFood(): FoodDto = FoodDto(
    id = "food-hazelnut-spread",
    name = "Hazelnut cocoa spread",
    brand = "Sample Brand",
    category = "Spreads",
    per100g = FoodNutrientsDto(kcal = 539.0, proteinG = 6.3, carbsG = 57.5, fatG = 30.9),
    allergens = listOf(Allergen.TREE_NUTS, Allergen.MILK),
    nutriscore = Nutriscore.E,
    isVegetarian = true,
    source = "openfoodfacts",
    licence = "ODbL",
)

@ComposePreview(showBackground = true, backgroundColor = 0xFF0E1416, heightDp = 900)
@Composable
private fun BarcodeResultPreview() {
    AzfTheme {
        Column(modifier = Modifier.padding(20.dp)) {
            BarcodeResultCard(
                result = BarcodeResultUi(
                    food = previewFood(),
                    lookup = fit.aquazero.app.core.model.BarcodeLookupDto(
                        food = previewFood(),
                        allergens = listOf(Allergen.TREE_NUTS, Allergen.MILK),
                        origin = "off-api",
                    ),
                    verdict = AllergenVerdict(
                        kind = AllergenWarningKind.Contains,
                        hits = listOf(Allergen.TREE_NUTS),
                    ),
                    showOffAttribution = true,
                ),
                grams = 30,
                mealType = MealType.BREAKFAST,
                logging = false,
                onGramsChange = {},
                onMealTypeChange = {},
                onLog = {},
                onScanAnother = {},
            )
        }
    }
}
