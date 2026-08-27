package fit.aquazero.app.feature.settings

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
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import fit.aquazero.app.R
import fit.aquazero.app.core.designsystem.AzfAppHeader
import fit.aquazero.app.core.designsystem.AzfCard
import fit.aquazero.app.core.designsystem.AzfColors
import fit.aquazero.app.core.designsystem.AzfSpacing

@Composable
fun NotificationSettingsScreen(
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var hydrationEnabled by remember { mutableStateOf(true) }
    var workoutEnabled by remember { mutableStateOf(true) }
    var coachEnabled by remember { mutableStateOf(true) }
    var weeklyEnabled by remember { mutableStateOf(false) }

    Scaffold(
        modifier = modifier.fillMaxSize(),
        topBar = {
            AzfAppHeader(title = stringResource(R.string.screen_notification_settings).uppercase(), onBack = onBack)
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
                        text = "SMART REMINDERS",
                        style = MaterialTheme.typography.labelMedium,
                        color = AzfColors.SecondaryFixedDim
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "NOTIFICATION PREFERENCES",
                        style = MaterialTheme.typography.headlineMedium,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "AquaZeroFit sends context-aware nudges based on your activity, training schedule, and local time.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                Spacer(modifier = Modifier.height(24.dp))
                Text(
                    text = "ACTIVE CHANNELS",
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(modifier = Modifier.height(12.dp))
            }

            item {
                NotificationToggle(
                    title = "Hydration Nudges",
                    description = "Periodic reminders throughout the day to meet your water targets.",
                    checked = hydrationEnabled,
                    onCheckedChange = { hydrationEnabled = it }
                )
                Spacer(modifier = Modifier.height(8.dp))
                NotificationToggle(
                    title = "Daily Training Reminders",
                    description = "Alerts 30 minutes before your planned workout session.",
                    checked = workoutEnabled,
                    onCheckedChange = { workoutEnabled = it }
                )
                Spacer(modifier = Modifier.height(8.dp))
                NotificationToggle(
                    title = "AI Coach Check-Ins",
                    description = "Motivational messages and recovery insights from your chosen coach.",
                    checked = coachEnabled,
                    onCheckedChange = { coachEnabled = it }
                )
                Spacer(modifier = Modifier.height(8.dp))
                NotificationToggle(
                    title = "Weekly Progress Summary",
                    description = "End-of-week recap of macro consistency and weight trends.",
                    checked = weeklyEnabled,
                    onCheckedChange = { weeklyEnabled = it }
                )
            }
        }
    }
}

@Composable
private fun NotificationToggle(
    title: String,
    description: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
) {
    AzfCard(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Column(modifier = Modifier.weight(1f).padding(end = 16.dp)) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurface
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = description,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Switch(
                checked = checked,
                onCheckedChange = onCheckedChange,
                colors = SwitchDefaults.colors(
                    checkedThumbColor = AzfColors.Background,
                    checkedTrackColor = AzfColors.PrimaryFixedDim,
                    uncheckedThumbColor = MaterialTheme.colorScheme.outline,
                    uncheckedTrackColor = MaterialTheme.colorScheme.surfaceContainerLow
                )
            )
        }
    }
}
