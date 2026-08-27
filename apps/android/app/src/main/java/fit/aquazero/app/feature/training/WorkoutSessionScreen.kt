package fit.aquazero.app.feature.training

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import fit.aquazero.app.R
import fit.aquazero.app.core.designsystem.AzfAppHeader
import fit.aquazero.app.core.designsystem.AzfCard
import fit.aquazero.app.core.designsystem.AzfColors
import fit.aquazero.app.core.designsystem.AzfSpacing
import fit.aquazero.app.core.designsystem.PrimaryButton
import kotlinx.coroutines.launch

data class ActiveSet(
    val setNumber: Int,
    val targetReps: Int,
    val targetWeightKg: Double,
    var isCompleted: Boolean = false,
)

@Composable
fun WorkoutSessionScreen(
    sessionId: String,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val sets = remember {
        mutableStateListOf(
            ActiveSet(1, 10, 60.0),
            ActiveSet(2, 10, 60.0),
            ActiveSet(3, 8, 65.0),
            ActiveSet(4, 8, 65.0),
        )
    }
    val scope = rememberCoroutineScope()

    Scaffold(
        modifier = modifier.fillMaxSize(),
        topBar = {
            AzfAppHeader(title = stringResource(R.string.screen_workout_session).uppercase(), onBack = onBack)
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
                    Text(
                        text = "EXERCISE 1 OF 5",
                        style = MaterialTheme.typography.labelMedium,
                        color = AzfColors.SecondaryFixedDim
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "BARBELL BENCH PRESS",
                        style = MaterialTheme.typography.headlineMedium,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "Focus on controlled eccentric descent (3s tempo) with explosive drive on the push.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                Spacer(modifier = Modifier.height(24.dp))
                Text(
                    text = "TARGET SETS & REPS",
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(modifier = Modifier.height(12.dp))
            }

            itemsIndexed(sets) { index, set ->
                AzfCard(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 8.dp)
                        .clickable {
                            sets[index] = set.copy(isCompleted = !set.isCompleted)
                        }
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(
                                modifier = Modifier
                                    .size(36.dp)
                                    .clip(CircleShape)
                                    .background(
                                        if (set.isCompleted) AzfColors.PrimaryFixedDim
                                        else MaterialTheme.colorScheme.surfaceContainerLow
                                    ),
                                contentAlignment = Alignment.Center
                            ) {
                                if (set.isCompleted) {
                                    Icon(
                                        imageVector = Icons.Default.Check,
                                        contentDescription = null,
                                        tint = AzfColors.Background,
                                        modifier = Modifier.size(20.dp)
                                    )
                                } else {
                                    Text(
                                        text = "${set.setNumber}",
                                        style = MaterialTheme.typography.titleSmall,
                                        color = MaterialTheme.colorScheme.onSurface
                                    )
                                }
                            }
                            Spacer(modifier = Modifier.size(16.dp))
                            Column {
                                Text(
                                    text = "Set ${set.setNumber}",
                                    style = MaterialTheme.typography.titleMedium,
                                    color = MaterialTheme.colorScheme.onSurface
                                )
                                Text(
                                    text = "${set.targetReps} reps • ${set.targetWeightKg} kg",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                        Text(
                            text = if (set.isCompleted) "DONE" else "TAP TO COMPLETE",
                            style = MaterialTheme.typography.labelSmall,
                            color = if (set.isCompleted) AzfColors.SecondaryFixedDim else MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }

            item {
                Spacer(modifier = Modifier.height(24.dp))
                PrimaryButton(
                    text = "FINISH WORKOUT",
                    onClick = {
                        scope.launch {
                            onBack()
                        }
                    },
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }
    }
}
