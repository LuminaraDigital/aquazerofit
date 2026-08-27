package fit.aquazero.app.feature.progress

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
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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
import fit.aquazero.app.core.database.WeightLogEntity
import fit.aquazero.app.core.designsystem.AzfAppHeader
import fit.aquazero.app.core.designsystem.AzfCard
import fit.aquazero.app.core.designsystem.AzfColors
import fit.aquazero.app.core.designsystem.AzfSpacing
import fit.aquazero.app.core.designsystem.PrimaryButton
import fit.aquazero.app.core.designsystem.Sparkline
import javax.inject.Inject
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn

@HiltViewModel
class ProgressViewModel @Inject constructor(
    private val logsRepository: LogsRepository,
) : ViewModel() {

    val weightLogs: StateFlow<List<WeightLogEntity>> = logsRepository
        .recentWeightLogs(30)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
}

@Composable
fun ProgressScreen(
    onNavigateToLogWeight: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
    viewModel: ProgressViewModel = hiltViewModel(),
) {
    val logs by viewModel.weightLogs.collectAsState()
    val latestWeight = logs.firstOrNull()?.weightKg
    val sparklineValues = logs.reversed().map { it.weightKg.toFloat() }

    Scaffold(
        modifier = modifier.fillMaxSize(),
        topBar = {
            AzfAppHeader(title = stringResource(R.string.screen_progress).uppercase(), onBack = null)
        }
    ) { innerPadding ->
        LazyColumn(
            modifier = Modifier
                .padding(innerPadding)
                .fillMaxSize(),
            contentPadding = PaddingValues(AzfSpacing.ContainerPadding)
        ) {
            item {
                AzfCard(modifier = Modifier.fillMaxWidth()) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text(
                                text = "CURRENT WEIGHT",
                                style = MaterialTheme.typography.labelMedium,
                                color = AzfColors.SecondaryFixedDim
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = if (latestWeight != null) String.format("%.1f kg", latestWeight) else "-- kg",
                                style = MaterialTheme.typography.headlineLarge,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                        }
                        PrimaryButton(
                            text = "LOG WEIGHT",
                            onClick = { onNavigateToLogWeight?.invoke() }
                        )
                    }

                    if (sparklineValues.size >= 2) {
                        Spacer(modifier = Modifier.height(16.dp))
                        Sparkline(
                            values = sparklineValues,
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(56.dp),
                            color = AzfColors.PrimaryFixedDim
                        )
                    }
                }

                Spacer(modifier = Modifier.height(24.dp))
                Text(
                    text = "RECENT WEIGH-INS",
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(modifier = Modifier.height(12.dp))
            }

            if (logs.isEmpty()) {
                item {
                    Text(
                        text = "No weight logs recorded yet. Tap 'Log Weight' to start tracking.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(vertical = 16.dp)
                    )
                }
            } else {
                items(logs) { log ->
                    AzfCard(modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = log.localDate,
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                            Text(
                                text = String.format("%.1f kg", log.weightKg),
                                style = MaterialTheme.typography.titleMedium,
                                color = AzfColors.PrimaryFixedDim
                            )
                        }
                    }
                }
            }
        }
    }
}
