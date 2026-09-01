package fit.aquazero.app.feature.settings

import android.Manifest
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.FitnessCenter
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.MonitorWeight
import androidx.compose.material.icons.outlined.NotificationsActive
import androidx.compose.material.icons.outlined.Restaurant
import androidx.compose.material.icons.outlined.WaterDrop
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.TimePickerState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import fit.aquazero.app.R
import fit.aquazero.app.core.designsystem.AzfAppHeader
import fit.aquazero.app.core.designsystem.AzfCard
import fit.aquazero.app.core.designsystem.AzfChip
import fit.aquazero.app.core.designsystem.AzfColors
import fit.aquazero.app.core.designsystem.AzfSectionHeading
import fit.aquazero.app.core.designsystem.AzfSpacing
import fit.aquazero.app.core.designsystem.AzfSwitchRow
import fit.aquazero.app.core.designsystem.AzfTheme
import fit.aquazero.app.core.designsystem.SecondaryButton
import fit.aquazero.app.core.designsystem.ToastKind
import fit.aquazero.app.core.designsystem.currentLocale
import fit.aquazero.app.core.ui.LocaleFormatters
import fit.aquazero.app.core.ui.rememberToastSink
import fit.aquazero.app.core.ui.reminders.ReminderPrefs
import fit.aquazero.app.core.ui.reminders.TimeOfDay
import fit.aquazero.app.core.ui.reminders.WaterFrequency
import java.time.DayOfWeek
import java.time.LocalTime
import java.time.format.TextStyle

/** Which time control the picker dialog is currently editing. */
private enum class TimeTarget { MEALS, WORKOUT, WEIGH_IN }

/**
 * Reminder settings — the screen behind the app's only notifications.
 *
 * Two gates, both real. The master switch is the account's `reminders`
 * consent, so turning it off travels with the account and immediately cancels
 * the scheduled work. The second is POST_NOTIFICATIONS, requested only once
 * someone has actually asked for reminders — a permission prompt on arrival,
 * before any of it has been explained, is the prompt people deny reflexively.
 *
 * A denial is handled rather than punished: the per-type choices are still
 * saved, the screen says plainly that nothing will be delivered, and reminders
 * begin the moment the permission is granted.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotificationSettingsScreen(
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: NotificationSettingsViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val resources = LocalResources.current
    val toasts = rememberToastSink()
    var timeTarget by remember { mutableStateOf<TimeTarget?>(null) }

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
    ) { granted -> viewModel.onPermissionResult(granted) }

    LaunchedEffect(viewModel) {
        viewModel.events.collect { event ->
            when (event) {
                is NotificationSettingsEvent.Message -> toasts.show(
                    resources.getString(event.messageRes),
                    if (event.isError) ToastKind.Error else ToastKind.Success,
                )
                NotificationSettingsEvent.RequestPermission -> {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        permissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                    } else {
                        viewModel.onPermissionResult(granted = true)
                    }
                }
                NotificationSettingsEvent.OpenSystemSettings ->
                    context.openNotificationSettings()
            }
        }
    }

    // The permission can be revoked from system settings while this screen is
    // backgrounded, so it is re-read every time the screen comes back.
    LifecycleResumeEffect(viewModel) {
        viewModel.refreshPermission()
        onPauseOrDispose { }
    }

    Scaffold(
        modifier = modifier.fillMaxSize(),
        topBar = {
            AzfAppHeader(title = stringResource(R.string.reminders_heading), onBack = onBack)
        },
    ) { innerPadding ->
        LazyColumn(
            modifier = Modifier
                .padding(innerPadding)
                .fillMaxSize(),
            contentPadding = PaddingValues(AzfSpacing.ContainerMargin),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                NoteCard(
                    text = stringResource(R.string.reminders_intro),
                    secondary = stringResource(R.string.reminders_inexact_note),
                )
            }

            item {
                AzfCard(modifier = Modifier.fillMaxWidth()) {
                    AzfSwitchRow(
                        title = stringResource(R.string.reminders_master_title),
                        body = stringResource(R.string.reminders_master_body),
                        checked = state.remindersConsented,
                        onCheckedChange = viewModel::setMaster,
                        enabled = !state.savingConsent && state.consents != null,
                        icon = Icons.Outlined.NotificationsActive,
                    )
                }
            }

            if (state.remindersConsented &&
                state.permission != NotificationPermissionState.GRANTED
            ) {
                item {
                    PermissionCard(
                        blocked = state.permission == NotificationPermissionState.BLOCKED,
                        onAction = viewModel::requestPermission,
                    )
                }
            }

            if (!state.remindersConsented) {
                item {
                    NoteCard(text = stringResource(R.string.reminders_consent_off_body))
                }
            }

            item { AzfSectionHeading(stringResource(R.string.settings_notifications)) }

            item {
                ReminderCard(
                    title = stringResource(R.string.reminders_meals_title),
                    body = stringResource(R.string.reminders_meals_body),
                    icon = Icons.Outlined.Restaurant,
                    checked = state.prefs.mealsEnabled,
                    onCheckedChange = viewModel::setMealsEnabled,
                    enabled = state.granularEnabled,
                ) {
                    TimeRow(
                        label = stringResource(R.string.reminders_time_label),
                        time = state.prefs.mealsTime,
                        enabled = state.granularEnabled && state.prefs.mealsEnabled,
                        onClick = { timeTarget = TimeTarget.MEALS },
                    )
                }
            }

            item {
                ReminderCard(
                    title = stringResource(R.string.reminders_water_title),
                    body = stringResource(R.string.reminders_water_body),
                    icon = Icons.Outlined.WaterDrop,
                    checked = state.prefs.waterEnabled,
                    onCheckedChange = viewModel::setWaterEnabled,
                    enabled = state.granularEnabled,
                ) {
                    Text(
                        text = stringResource(R.string.reminders_frequency_label),
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        WaterFrequency.entries.forEach { frequency ->
                            AzfChip(
                                text = stringResource(frequencyLabel(frequency)),
                                selected = state.prefs.waterFrequency == frequency,
                                onClick = { viewModel.setWaterFrequency(frequency) },
                            )
                        }
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = stringResource(
                            R.string.reminders_water_window,
                            formatHour(ReminderPrefs.WATER_WINDOW_START_HOUR),
                            formatHour(ReminderPrefs.WATER_WINDOW_END_HOUR),
                        ),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            item {
                ReminderCard(
                    title = stringResource(R.string.reminders_workout_title),
                    body = stringResource(R.string.reminders_workout_body),
                    icon = Icons.Outlined.FitnessCenter,
                    checked = state.prefs.workoutEnabled,
                    onCheckedChange = viewModel::setWorkoutEnabled,
                    enabled = state.granularEnabled,
                ) {
                    TimeRow(
                        label = stringResource(R.string.reminders_time_label),
                        time = state.prefs.workoutTime,
                        enabled = state.granularEnabled && state.prefs.workoutEnabled,
                        onClick = { timeTarget = TimeTarget.WORKOUT },
                    )
                }
            }

            item {
                ReminderCard(
                    title = stringResource(R.string.reminders_weigh_in_title),
                    body = stringResource(R.string.reminders_weigh_in_body),
                    icon = Icons.Outlined.MonitorWeight,
                    checked = state.prefs.weighInEnabled,
                    onCheckedChange = viewModel::setWeighInEnabled,
                    enabled = state.granularEnabled,
                ) {
                    Text(
                        text = stringResource(R.string.reminders_day_label),
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    androidx.compose.foundation.layout.FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        val locale = currentLocale()
                        DayOfWeek.entries.forEach { day ->
                            AzfChip(
                                text = day.getDisplayName(TextStyle.SHORT, locale),
                                selected = state.prefs.weighInDay == day,
                                onClick = { viewModel.setWeighInDay(day) },
                            )
                        }
                    }
                    Spacer(modifier = Modifier.height(12.dp))
                    TimeRow(
                        label = stringResource(R.string.reminders_time_label),
                        time = state.prefs.weighInTime,
                        enabled = state.granularEnabled && state.prefs.weighInEnabled,
                        onClick = { timeTarget = TimeTarget.WEIGH_IN },
                    )
                }
            }
        }
    }

    val target = timeTarget
    if (target != null) {
        val initial = when (target) {
            TimeTarget.MEALS -> state.prefs.mealsTime
            TimeTarget.WORKOUT -> state.prefs.workoutTime
            TimeTarget.WEIGH_IN -> state.prefs.weighInTime
        }
        TimePickerDialog(
            initial = initial,
            onDismiss = { timeTarget = null },
            onConfirm = { picked ->
                when (target) {
                    TimeTarget.MEALS -> viewModel.setMealsTime(picked)
                    TimeTarget.WORKOUT -> viewModel.setWorkoutTime(picked)
                    TimeTarget.WEIGH_IN -> viewModel.setWeighInTime(picked)
                }
                timeTarget = null
            },
        )
    }
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

@Composable
private fun NoteCard(text: String, secondary: String? = null) {
    AzfCard(modifier = Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.Top) {
            Icon(
                imageVector = Icons.Outlined.Info,
                contentDescription = null,
                tint = AzfColors.PrimaryFixedDim,
                modifier = Modifier.size(20.dp),
            )
            Spacer(modifier = Modifier.size(12.dp))
            Column {
                Text(
                    text = text,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (secondary != null) {
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        text = secondary,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

@Composable
private fun PermissionCard(blocked: Boolean, onAction: () -> Unit) {
    AzfCard(modifier = Modifier.fillMaxWidth()) {
        Text(
            text = stringResource(R.string.reminders_permission_title).uppercase(),
            style = MaterialTheme.typography.labelMedium,
            color = AzfColors.SecondaryFixedDim,
        )
        Spacer(modifier = Modifier.height(6.dp))
        Text(
            text = stringResource(
                if (blocked) {
                    R.string.reminders_permission_blocked_body
                } else {
                    R.string.reminders_permission_body
                },
            ),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(modifier = Modifier.height(16.dp))
        SecondaryButton(
            text = stringResource(
                if (blocked) {
                    R.string.reminders_permission_blocked_cta
                } else {
                    R.string.reminders_permission_cta
                },
            ),
            onClick = onAction,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
private fun ReminderCard(
    title: String,
    body: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    enabled: Boolean,
    detail: @Composable () -> Unit,
) {
    AzfCard(modifier = Modifier.fillMaxWidth()) {
        AzfSwitchRow(
            title = title,
            body = body,
            checked = checked,
            onCheckedChange = onCheckedChange,
            enabled = enabled,
            icon = icon,
        )
        Spacer(modifier = Modifier.height(12.dp))
        detail()
    }
}

@Composable
private fun TimeRow(
    label: String,
    time: TimeOfDay,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    val formatted = formatTime(time)
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        AzfChip(
            text = formatted,
            selected = enabled,
            onClick = { if (enabled) onClick() },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TimePickerDialog(
    initial: TimeOfDay,
    onDismiss: () -> Unit,
    onConfirm: (TimeOfDay) -> Unit,
) {
    val pickerState: TimePickerState = rememberTimePickerState(
        initialHour = initial.hour,
        initialMinute = initial.minute,
        is24Hour = android.text.format.DateFormat.is24HourFormat(LocalContext.current),
    )
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(text = stringResource(R.string.reminders_pick_time)) },
        text = { TimePicker(state = pickerState) },
        confirmButton = {
            TextButton(onClick = { onConfirm(TimeOfDay(pickerState.hour, pickerState.minute)) }) {
                Text(text = stringResource(R.string.settings_save))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(text = stringResource(R.string.settings_cancel))
            }
        },
        containerColor = AzfColors.SurfaceContainerHigh,
    )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

private fun frequencyLabel(frequency: WaterFrequency): Int = when (frequency) {
    WaterFrequency.EVERY_1H -> R.string.reminders_every_1h
    WaterFrequency.EVERY_2H -> R.string.reminders_every_2h
    WaterFrequency.EVERY_4H -> R.string.reminders_every_4h
}

/**
 * Locale-aware clock label; the stored value stays 24h.
 *
 * Both of these run inside composition, so the formatter is taken from the
 * [LocaleFormatters] cache rather than compiled from the pattern per call.
 */
private fun formatTime(time: TimeOfDay): String =
    LocalTime.of(time.hour, time.minute).format(LocaleFormatters.of(CLOCK_PATTERN))

private fun formatHour(hour: Int): String =
    LocalTime.of(hour, 0).format(LocaleFormatters.of(CLOCK_PATTERN))

private const val CLOCK_PATTERN = "HH:mm"

/** Send the user to this app's notification settings when a prompt cannot help. */
private fun Context.openNotificationSettings() {
    val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
            .putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
    } else {
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
            .setData(Uri.fromParts("package", packageName, null))
    }
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    runCatching { startActivity(intent) }
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416, heightDp = 700)
@Composable
private fun NotificationSettingsPreview() {
    AzfTheme {
        Column(
            modifier = Modifier.padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            NoteCard(
                text = stringResource(R.string.reminders_intro),
                secondary = stringResource(R.string.reminders_inexact_note),
            )
            PermissionCard(blocked = false, onAction = {})
            ReminderCard(
                title = stringResource(R.string.reminders_water_title),
                body = stringResource(R.string.reminders_water_body),
                icon = Icons.Outlined.WaterDrop,
                checked = true,
                onCheckedChange = {},
                enabled = true,
            ) {
                TimeRow(
                    label = stringResource(R.string.reminders_time_label),
                    time = TimeOfDay(8, 30),
                    enabled = true,
                    onClick = {},
                )
            }
        }
    }
}
