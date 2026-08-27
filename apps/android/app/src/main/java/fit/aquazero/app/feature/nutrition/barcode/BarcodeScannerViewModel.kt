package fit.aquazero.app.feature.nutrition.barcode

import androidx.annotation.StringRes
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import fit.aquazero.app.R
import fit.aquazero.app.core.data.CatalogRepository
import fit.aquazero.app.core.data.LogsRepository
import fit.aquazero.app.core.data.ProfileRepository
import fit.aquazero.app.core.model.ApiResult
import fit.aquazero.app.core.model.BarcodeLookupDto
import fit.aquazero.app.core.model.FoodDto
import fit.aquazero.app.core.model.MealType
import fit.aquazero.app.feature.dashboard.NutritionFormat
import fit.aquazero.app.feature.nutrition.CameraPermission
import javax.inject.Inject
import kotlin.math.roundToInt
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch

/** Default portion when a product declares no common serving. */
internal const val BARCODE_DEFAULT_GRAMS: Int = 100

/** Inline copy for the barcode sheet. */
data class BarcodeBanner(
    @param:StringRes val messageRes: Int? = null,
    val message: String? = null,
)

/** A resolved product, with its deterministic allergen verdict. */
data class BarcodeResultUi(
    val food: FoodDto,
    val lookup: BarcodeLookupDto,
    val verdict: AllergenVerdict,
    val showOffAttribution: Boolean,
)

/** Immutable barcode-sheet state. */
data class BarcodeUiState(
    val permission: CameraPermission = CameraPermission.Unknown,
    val scanning: Boolean = true,
    val torchOn: Boolean = false,
    val manualCode: String = "",
    val looking: Boolean = false,
    val notFound: Boolean = false,
    val result: BarcodeResultUi? = null,
    val grams: Int = BARCODE_DEFAULT_GRAMS,
    val mealType: MealType = NutritionFormat.mealTypeForNow(),
    val logging: Boolean = false,
    val banner: BarcodeBanner? = null,
    /** Bumped on every accepted scan so the UI can flash + buzz once. */
    val scanHitToken: Long = 0L,
) {
    val canSubmitManual: Boolean get() = BarcodeRules.isSubmittable(manualCode) && !looking
}

/** One-shot signals. */
sealed interface BarcodeEvent {
    /** The user confirmed a portion and it is now in the log. */
    data class Logged(val grams: Int, val mealType: MealType, val name: String) : BarcodeEvent
}

/**
 * Barcode sheet state holder.
 *
 * Scanning is fully on-device (ML Kit); the only network call is the product
 * lookup. Logging happens on an explicit "log this portion" tap, through
 * [LogsRepository] so the write is offline-first and goes through the outbox.
 */
@HiltViewModel
class BarcodeScannerViewModel @Inject constructor(
    private val catalogRepository: CatalogRepository,
    private val profileRepository: ProfileRepository,
    private val logsRepository: LogsRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(BarcodeUiState())
    val state: StateFlow<BarcodeUiState> = _state.asStateFlow()

    private val events = Channel<BarcodeEvent>(Channel.BUFFERED)
    val eventFlow: Flow<BarcodeEvent> = events.receiveAsFlow()

    /** The last code we acted on, so one product is not looked up per frame. */
    private var lastHandledCode: String? = null

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

    fun setManualCode(raw: String) {
        _state.value = _state.value.copy(
            manualCode = BarcodeRules.sanitize(raw),
            banner = null,
        )
    }

    /** A frame produced a barcode. Ignored while a result is on screen. */
    fun onBarcodeDetected(rawValue: String?) {
        val code = BarcodeRules.sanitize(rawValue.orEmpty())
        val current = _state.value
        if (!current.scanning || current.looking || current.result != null) return
        if (code.length < BarcodeRules.MIN_CODE_LENGTH) return
        if (code == lastHandledCode) return
        lastHandledCode = code
        _state.value = current.copy(scanHitToken = current.scanHitToken + 1)
        lookup(code)
    }

    /** Manual EAN entry fallback. */
    fun submitManualCode() {
        val code = BarcodeRules.sanitize(_state.value.manualCode)
        if (code.length < BarcodeRules.MIN_CODE_LENGTH) return
        lastHandledCode = code
        lookup(code)
    }

    private fun lookup(code: String) {
        _state.value = _state.value.copy(
            looking = true,
            scanning = false,
            notFound = false,
            banner = null,
        )
        viewModelScope.launch {
            val allergies = BarcodeRules.parseProfileAllergies(
                profileRepository.profile().first()?.allergiesCsv.orEmpty(),
            )
            when (val result = catalogRepository.lookupBarcode(code)) {
                is ApiResult.Success -> {
                    val food = result.data.food
                    if (food == null) {
                        _state.value = _state.value.copy(
                            looking = false,
                            notFound = true,
                            scanning = true,
                        )
                        lastHandledCode = null
                    } else {
                        _state.value = _state.value.copy(
                            looking = false,
                            result = BarcodeResultUi(
                                food = food,
                                lookup = result.data,
                                verdict = BarcodeRules.allergenVerdict(result.data, allergies),
                                showOffAttribution = BarcodeRules.requiresOffAttribution(result.data),
                            ),
                            grams = food.commonServings.firstOrNull()?.grams?.roundToInt()
                                ?: BARCODE_DEFAULT_GRAMS,
                        )
                    }
                }

                is ApiResult.Failure.Api -> {
                    lastHandledCode = null
                    if (result.httpStatus == HTTP_NOT_FOUND) {
                        _state.value = _state.value.copy(
                            looking = false,
                            notFound = true,
                            scanning = true,
                        )
                    } else {
                        _state.value = _state.value.copy(
                            looking = false,
                            scanning = true,
                            banner = BarcodeBanner(
                                messageRes = if (result.code == "VALIDATION_FAILED") {
                                    R.string.barcode_invalid_code
                                } else {
                                    null
                                },
                                message = result.message.takeIf { result.code != "VALIDATION_FAILED" },
                            ),
                        )
                    }
                }

                is ApiResult.Failure.Network -> {
                    lastHandledCode = null
                    _state.value = _state.value.copy(
                        looking = false,
                        scanning = true,
                        banner = BarcodeBanner(messageRes = R.string.barcode_lookup_offline),
                    )
                }

                is ApiResult.Failure.Malformed -> {
                    lastHandledCode = null
                    _state.value = _state.value.copy(
                        looking = false,
                        scanning = true,
                        banner = BarcodeBanner(messageRes = R.string.barcode_lookup_unreadable),
                    )
                }
            }
        }
    }

    fun setGrams(grams: Int) {
        _state.value = _state.value.copy(grams = grams)
    }

    fun setMealType(mealType: MealType) {
        _state.value = _state.value.copy(mealType = mealType)
    }

    /** Clear the result and go back to scanning. */
    fun scanAnother() {
        lastHandledCode = null
        _state.value = _state.value.copy(
            result = null,
            manualCode = "",
            notFound = false,
            scanning = true,
            banner = null,
        )
    }

    /**
     * Log the previewed portion. This is the user's explicit confirmation —
     * nothing on this sheet writes anything before it.
     */
    fun logPortion() {
        val current = _state.value
        val result = current.result ?: return
        if (current.logging) return
        _state.value = current.copy(logging = true)
        viewModelScope.launch {
            runCatching {
                logsRepository.logMeal(
                    mealType = current.mealType,
                    items = listOf(NutritionFormat.itemFromFood(result.food, current.grams)),
                    source = "manual",
                )
                catalogRepository.touchFood(result.food.id)
            }.onSuccess {
                _state.value = _state.value.copy(logging = false)
                events.trySend(
                    BarcodeEvent.Logged(current.grams, current.mealType, result.food.name),
                )
            }.onFailure {
                _state.value = _state.value.copy(
                    logging = false,
                    banner = BarcodeBanner(messageRes = R.string.meal_log_failed),
                )
            }
        }
    }

    fun dismissBanner() {
        _state.value = _state.value.copy(banner = null)
    }

    private companion object {
        const val HTTP_NOT_FOUND = 404
    }
}
