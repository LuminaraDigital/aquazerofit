package fit.aquazero.app.feature.nutrition

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import fit.aquazero.app.R
import fit.aquazero.app.core.data.LogsRepository
import fit.aquazero.app.core.data.VisionRepository
import fit.aquazero.app.core.designsystem.AzfAppHeader
import fit.aquazero.app.core.designsystem.AzfCard
import fit.aquazero.app.core.designsystem.AzfColors
import fit.aquazero.app.core.designsystem.AzfSpacing
import fit.aquazero.app.core.designsystem.MacroBar
import fit.aquazero.app.core.designsystem.PrimaryButton
import fit.aquazero.app.core.network.ApiResult
import fit.aquazero.app.core.network.dto.MealLogItemDto
import fit.aquazero.app.core.network.dto.MealType
import fit.aquazero.app.core.network.dto.VisionJobDto
import fit.aquazero.app.core.network.dto.VisionJobStatus
import javax.inject.Inject
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed interface AnalysisState {
    data object Loading : AnalysisState
    data class Ready(val job: VisionJobDto, val items: List<MealLogItemDto>) : AnalysisState
    data class Error(val message: String) : AnalysisState
    data object Confirmed : AnalysisState
}

@HiltViewModel
class AnalysisResultsViewModel @Inject constructor(
    private val visionRepository: VisionRepository,
    private val logsRepository: LogsRepository,
) : ViewModel() {

    private val _state = MutableStateFlow<AnalysisState>(AnalysisState.Loading)
    val state: StateFlow<AnalysisState> = _state.asStateFlow()

    fun pollJob(jobId: String) {
        viewModelScope.launch {
            _state.value = AnalysisState.Loading
            var attempts = 0
            while (attempts < 20) {
                when (val result = visionRepository.getJob(jobId)) {
                    is ApiResult.Success -> {
                        val job = result.data
                        when (job.status) {
                            VisionJobStatus.SUCCEEDED -> {
                                val items = job.predictions.map { pred ->
                                    MealLogItemDto(
                                        foodId = pred.foodId,
                                        name = pred.name,
                                        grams = pred.estimatedGrams,
                                        kcal = pred.kcal,
                                        proteinG = pred.proteinG,
                                        carbsG = pred.carbsG,
                                        fatG = pred.fatG,
                                    )
                                }
                                _state.value = AnalysisState.Ready(job, items)
                                return@launch
                            }
                            VisionJobStatus.FAILED -> {
                                _state.value = AnalysisState.Error(job.error ?: "Analysis failed")
                                return@launch
                            }
                            else -> {
                                delay(1500)
                                attempts++
                            }
                        }
                    }
                    is ApiResult.Failure -> {
                        delay(1500)
                        attempts++
                    }
                }
            }
            _state.value = AnalysisState.Error("Analysis timed out. Please try again.")
        }
    }

    fun confirmMeal(mealType: MealType, items: List<MealLogItemDto>, onConfirmed: () -> Unit) {
        viewModelScope.launch {
            logsRepository.logMeal(mealType = mealType, items = items, source = "photo")
            _state.value = AnalysisState.Confirmed
            onConfirmed()
        }
    }
}

@Composable
fun AnalysisResultsScreen(
    jobId: String,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: AnalysisResultsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()

    LaunchedEffect(jobId) {
        viewModel.pollJob(jobId)
    }

    Scaffold(
        modifier = modifier.fillMaxSize(),
        topBar = {
            AzfAppHeader(title = stringResource(R.string.screen_analysis_results).uppercase(), onBack = onBack)
        }
    ) { innerPadding ->
        when (val s = state) {
            is AnalysisState.Loading -> {
                Column(
                    modifier = Modifier
                        .padding(innerPadding)
                        .fillMaxSize(),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    CircularProgressIndicator(color = AzfColors.PrimaryFixedDim)
                    Spacer(modifier = Modifier.height(16.dp))
                    Text(
                        text = "Analyzing your meal...",
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Text(
                        text = "Identifying ingredients & calculating macros",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
            is AnalysisState.Error -> {
                Column(
                    modifier = Modifier
                        .padding(innerPadding)
                        .padding(AzfSpacing.ContainerMargin)
                        .fillMaxSize(),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        text = s.message,
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.error
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    PrimaryButton(
                        text = "TRY AGAIN",
                        onClick = { viewModel.pollJob(jobId) }
                    )
                }
            }
            is AnalysisState.Ready -> {
                val totalKcal = s.items.sumOf { it.kcal }
                val totalProtein = s.items.sumOf { it.proteinG }
                val totalCarbs = s.items.sumOf { it.carbsG }
                val totalFat = s.items.sumOf { it.fatG }

                LazyColumn(
                    modifier = Modifier
                        .padding(innerPadding)
                        .fillMaxSize(),
                    contentPadding = PaddingValues(AzfSpacing.ContainerPadding)
                ) {
                    item {
                        AzfCard(modifier = Modifier.fillMaxWidth()) {
                            Text(
                                text = "${totalKcal.toInt()} KCAL",
                                style = MaterialTheme.typography.headlineMedium,
                                color = AzfColors.PrimaryFixedDim
                            )
                            Spacer(modifier = Modifier.height(12.dp))
                            MacroBar(
                                label = "PROTEIN",
                                consumed = totalProtein,
                                target = 150.0,
                                color = AzfColors.SecondaryFixedDim
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            MacroBar(
                                label = "CARBS",
                                consumed = totalCarbs,
                                target = 200.0,
                                color = AzfColors.PrimaryFixedDim
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            MacroBar(
                                label = "FAT",
                                consumed = totalFat,
                                target = 70.0,
                                color = AzfColors.Coral
                            )
                        }

                        Spacer(modifier = Modifier.height(24.dp))
                        Text(
                            text = "IDENTIFIED ITEMS",
                            style = MaterialTheme.typography.titleSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Spacer(modifier = Modifier.height(12.dp))
                    }

                    items(s.items) { item ->
                        AzfCard(modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = item.name,
                                        style = MaterialTheme.typography.titleMedium,
                                        color = MaterialTheme.colorScheme.onSurface
                                    )
                                    Text(
                                        text = "${item.grams.toInt()}g • P: ${item.proteinG.toInt()}g C: ${item.carbsG.toInt()}g F: ${item.fatG.toInt()}g",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                                Text(
                                    text = "${item.kcal.toInt()} kcal",
                                    style = MaterialTheme.typography.labelLarge,
                                    color = AzfColors.PrimaryFixedDim
                                )
                            }
                        }
                    }

                    item {
                        Spacer(modifier = Modifier.height(24.dp))
                        PrimaryButton(
                            text = "CONFIRM & LOG MEAL",
                            onClick = {
                                viewModel.confirmMeal(s.job.mealType, s.items, onConfirmed = onBack)
                            },
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                }
            }
            is AnalysisState.Confirmed -> {
                // Handled via callback
            }
        }
    }
}

