package fit.aquazero.app.feature.progress

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import fit.aquazero.app.R
import fit.aquazero.app.core.data.LogsRepository
import fit.aquazero.app.core.designsystem.AzfAppHeader
import fit.aquazero.app.core.designsystem.AzfSpacing
import fit.aquazero.app.core.designsystem.AzfTextField
import fit.aquazero.app.core.designsystem.PrimaryButton
import javax.inject.Inject
import kotlinx.coroutines.launch

@HiltViewModel
class LogWeightViewModel @Inject constructor(
    private val logsRepository: LogsRepository,
) : ViewModel() {

    suspend fun saveWeight(weightKg: Double, note: String?) {
        logsRepository.logWeight(weightKg, note)
    }
}

@Composable
fun LogWeightScreen(
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: LogWeightViewModel = hiltViewModel(),
) {
    var weightText by remember { mutableStateOf("") }
    var noteText by remember { mutableStateOf("") }
    var errorText by remember { mutableStateOf<String?>(null) }
    var isSaving by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    Scaffold(
        modifier = modifier.fillMaxSize(),
        topBar = {
            AzfAppHeader(title = stringResource(R.string.screen_log_weight).uppercase(), onBack = onBack)
        }
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .padding(innerPadding)
                .padding(AzfSpacing.ContainerPadding)
                .fillMaxSize()
        ) {
            Text(
                text = "LOG WEIGH-IN",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface
            )
            Spacer(modifier = Modifier.height(16.dp))

            AzfTextField(
                value = weightText,
                onValueChange = {
                    weightText = it
                    errorText = null
                },
                label = "Weight (kg)",
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                error = errorText,
            )

            Spacer(modifier = Modifier.height(12.dp))

            AzfTextField(
                value = noteText,
                onValueChange = { noteText = it },
                label = "Notes (optional)",
            )

            Spacer(modifier = Modifier.height(24.dp))

            PrimaryButton(
                text = "SAVE WEIGH-IN",
                onClick = {
                    val weight = weightText.toDoubleOrNull()
                    if (weight == null || weight <= 0 || weight > 500) {
                        errorText = "Please enter a valid weight in kg (e.g. 75.5)"
                        return@PrimaryButton
                    }
                    isSaving = true
                    scope.launch {
                        viewModel.saveWeight(weight, noteText.ifBlank { null })
                        onBack()
                    }
                },
                loading = isSaving,
                modifier = Modifier.fillMaxWidth()
            )
        }
    }
}
