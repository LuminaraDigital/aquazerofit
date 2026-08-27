package fit.aquazero.app.feature.training

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
import fit.aquazero.app.core.data.PlansRepository
import fit.aquazero.app.core.designsystem.AzfAppHeader
import fit.aquazero.app.core.designsystem.AzfCard
import fit.aquazero.app.core.designsystem.AzfColors
import fit.aquazero.app.core.designsystem.AzfSpacing
import fit.aquazero.app.core.designsystem.PrimaryButton
import fit.aquazero.app.core.network.ApiResult
import fit.aquazero.app.core.network.dto.TodayWorkoutEnvelopeDto
import fit.aquazero.app.core.network.dto.WorkoutSessionDto
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed interface WorkoutsUiState {
    data object Loading : WorkoutsUiState
    data class Success(val todayWorkout: TodayWorkoutEnvelopeDto?) : WorkoutsUiState
    data class Error(val message: String) : WorkoutsUiState
}

@HiltViewModel
class WorkoutLibraryViewModel @Inject constructor(
    private val plansRepository: PlansRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow<WorkoutsUiState>(WorkoutsUiState.Loading)
    val uiState: StateFlow<WorkoutsUiState> = _uiState.asStateFlow()

    init {
        loadWorkouts()
    }

    fun loadWorkouts() {
        viewModelScope.launch {
            _uiState.value = WorkoutsUiState.Loading
            when (val result = plansRepository.todayWorkout()) {
                is ApiResult.Success -> {
                    _uiState.value = WorkoutsUiState.Success(result.data)
                }
                is ApiResult.Failure -> {
                    _uiState.value = WorkoutsUiState.Success(null)
                }
            }
        }
    }
}

@Composable
fun WorkoutLibraryScreen(
    onNavigateToSession: ((String) -> Unit)? = null,
    modifier: Modifier = Modifier,
    viewModel: WorkoutLibraryViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()

    Scaffold(
        modifier = modifier.fillMaxSize(),
        topBar = {
            AzfAppHeader(title = stringResource(R.string.screen_workouts).uppercase(), onBack = null)
        }
    ) { innerPadding ->
        when (val s = state) {
            is WorkoutsUiState.Loading -> {
                Column(
                    modifier = Modifier
                        .padding(innerPadding)
                        .fillMaxSize(),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    CircularProgressIndicator(color = AzfColors.PrimaryFixedDim)
                }
            }
            is WorkoutsUiState.Error -> {
                Column(
                    modifier = Modifier
                        .padding(innerPadding)
                        .padding(AzfSpacing.ContainerMargin)
                        .fillMaxSize(),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(text = s.message, color = MaterialTheme.colorScheme.error)
                }
            }
            is WorkoutsUiState.Success -> {
                val session = s.todayWorkout?.session
                LazyColumn(
                    modifier = Modifier
                        .padding(innerPadding)
                        .fillMaxSize(),
                    contentPadding = PaddingValues(AzfSpacing.ContainerPadding)
                ) {
                    item {
                        AzfCard(modifier = Modifier.fillMaxWidth()) {
                            Text(
                                text = "TODAY'S WORKOUT",
                                style = MaterialTheme.typography.labelMedium,
                                color = AzfColors.SecondaryFixedDim
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = session?.focus?.uppercase() ?: "RECOVERY & MOBILITY",
                                style = MaterialTheme.typography.headlineMedium,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                text = if (session != null) {
                                    "${session.exercises.size} exercises planned • ~45 min"
                                } else {
                                    "No scheduled workout today. Rest or active recovery."
                                },
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )

                            if (session != null) {
                                Spacer(modifier = Modifier.height(16.dp))
                                PrimaryButton(
                                    text = "START SESSION",
                                    onClick = { onNavigateToSession?.invoke(session.id) },
                                    modifier = Modifier.fillMaxWidth()
                                )
                            }
                        }

                        Spacer(modifier = Modifier.height(24.dp))
                        Text(
                            text = "PLANNED EXERCISES",
                            style = MaterialTheme.typography.titleSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Spacer(modifier = Modifier.height(12.dp))
                    }

                    if (session != null && session.exercises.isNotEmpty()) {
                        items(session.exercises) { exercise ->
                            AzfCard(modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            text = exercise.name,
                                            style = MaterialTheme.typography.titleMedium,
                                            color = MaterialTheme.colorScheme.onSurface
                                        )
                                        Text(
                                            text = "${exercise.setsPlanned} sets • ${exercise.targetReps ?: exercise.reps.takeIf { it > 0 } ?: 10} reps",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                    }
                                    Text(
                                        text = "${exercise.restSeconds.takeIf { it > 0 } ?: 60}s REST",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = AzfColors.PrimaryFixedDim
                                    )
                                }
                            }
                        }
                    } else {
                        item {
                            Text(
                                text = "Take today to recover or do a light walk.",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(vertical = 16.dp)
                            )
                        }
                    }
                }
            }
        }
    }
}
