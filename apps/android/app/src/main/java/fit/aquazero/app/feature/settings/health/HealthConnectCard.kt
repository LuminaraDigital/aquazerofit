package fit.aquazero.app.feature.settings.health

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.annotation.StringRes
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.DirectionsWalk
import androidx.compose.material.icons.outlined.Favorite
import androidx.compose.material.icons.outlined.LocalFireDepartment
import androidx.compose.material.icons.outlined.MonitorHeart
import androidx.compose.material.icons.outlined.NightsStay
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import fit.aquazero.app.R
import fit.aquazero.app.core.designsystem.AzfAppHeader
import fit.aquazero.app.core.designsystem.AzfCard
import fit.aquazero.app.core.designsystem.AzfCardTier
import fit.aquazero.app.core.designsystem.AzfSectionHeading
import fit.aquazero.app.core.designsystem.AzfSpacing
import fit.aquazero.app.core.designsystem.AzfTheme
import fit.aquazero.app.core.designsystem.PrimaryButton
import fit.aquazero.app.core.designsystem.SecondaryButton
import fit.aquazero.app.core.designsystem.currentLocale
import fit.aquazero.app.core.health.HealthConnectAvailability
import fit.aquazero.app.core.health.HealthDaySnapshot
import java.text.NumberFormat

/**
 * The Health Connect screen.
 *
 * A thin frame around [HealthConnectCard], which is the real unit: the card
 * carries its own ViewModel and its own permission launcher, so Settings can
 * drop it into an existing list without inheriting a navigation destination,
 * and this screen exists only for the case where it gets one.
 */
@Composable
fun HealthConnectScreen(
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Scaffold(modifier = modifier.fillMaxSize()) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState()),
        ) {
            AzfAppHeader(title = stringResource(R.string.health_heading), onBack = onBack)
            HealthConnectCard(
                modifier = Modifier.padding(
                    horizontal = AzfSpacing.ContainerMargin,
                    vertical = AzfSpacing.ElementGapMedium,
                ),
            )
        }
    }
}

/**
 * Health Connect, as one self-contained card.
 *
 * Everything the integration needs lives here — state, the permission
 * launcher, the intents — so that wiring it into Settings is a single call
 * with no plumbing. Health data is the most sensitive thing this app touches,
 * and a feature whose consent gate is spread across three files is one whose
 * gate eventually gets bypassed by accident.
 *
 * The card is honest in all four states rather than only the happy one: a
 * device that cannot run Health Connect says so and offers nothing, a device
 * missing the app offers the store, a lapsed permission is distinguished from
 * a refused one, and a connected card shows a dash where a figure is absent
 * instead of a zero.
 */
@Composable
fun HealthConnectCard(
    modifier: Modifier = Modifier,
    viewModel: HealthConnectViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val contract = remember(viewModel) { viewModel.permissionContract() }

    val permissionLauncher = rememberLauncherForActivityResult(contract) {
        // The granted set is intentionally ignored; the ViewModel re-asks the
        // platform rather than trusting a sheet result. See onPermissionsResult.
        viewModel.onPermissionsResult()
    }

    LaunchedEffect(viewModel) {
        viewModel.events.collect { event ->
            when (event) {
                is HealthConnectEvent.RequestPermissions ->
                    permissionLauncher.launch(event.permissions)
                HealthConnectEvent.OpenProviderInstall ->
                    context.launchOrIgnore(viewModel.providerInstallIntent())
                HealthConnectEvent.OpenProviderSettings ->
                    context.launchOrIgnore(viewModel.providerSettingsIntent())
            }
        }
    }

    // Health Connect can be installed, updated or have a grant revoked while
    // this screen is backgrounded, so every gate is re-read on resume rather
    // than trusted from construction.
    LifecycleResumeEffect(viewModel) {
        viewModel.refresh()
        onPauseOrDispose { }
    }

    AzfCard(modifier = modifier, tier = AzfCardTier.Standard) {
        Text(
            text = stringResource(R.string.health_card_title),
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurface,
        )
        Spacer(Modifier.height(AzfSpacing.ElementGapSmall))
        Text(
            text = stringResource(R.string.health_card_body),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(AzfSpacing.ElementGapMedium))

        when {
            state.loading -> LoadingRow()
            !state.available -> UnavailableSection(state.availability, viewModel::connect)
            state.permissionsLapsed -> LapsedSection(viewModel::openProviderSettings)
            state.connected -> ConnectedSection(
                snapshot = state.snapshot,
                onManage = viewModel::openProviderSettings,
                onDisconnect = viewModel::disconnect,
            )
            else -> DisconnectedSection(busy = state.busy, onConnect = viewModel::connect)
        }

        state.messageRes?.let { messageRes ->
            Spacer(Modifier.height(AzfSpacing.ElementGapSmall))
            Text(
                text = stringResource(messageRes),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.primary,
            )
        }
    }
}

/** Nothing to connect to on this device. */
@Composable
private fun UnavailableSection(
    availability: HealthConnectAvailability,
    onInstall: () -> Unit,
) {
    // SDK_UNAVAILABLE covers two very different phones: one below Android 14
    // that could install the app, and one that could never run it. Only the
    // OS version tells them apart, and the install intent is harmless on the
    // second — the store simply reports it as unsupported — so the offer is
    // made in both cases rather than guessing and being wrong for someone.
    val title = when (availability) {
        HealthConnectAvailability.UPDATE_REQUIRED -> R.string.health_update_title
        else -> R.string.health_install_title
    }
    val body = when (availability) {
        HealthConnectAvailability.UPDATE_REQUIRED -> R.string.health_update_body
        else -> R.string.health_install_body
    }
    val action = when (availability) {
        HealthConnectAvailability.UPDATE_REQUIRED -> R.string.health_update_action
        else -> R.string.health_install_action
    }
    Text(
        text = stringResource(title),
        style = MaterialTheme.typography.titleSmall,
        color = MaterialTheme.colorScheme.onSurface,
    )
    Spacer(Modifier.height(AzfSpacing.ElementGapSmall))
    Text(
        text = stringResource(body),
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    Spacer(Modifier.height(AzfSpacing.ElementGapMedium))
    SecondaryButton(text = stringResource(action), onClick = onInstall)
}

/** Available and not connected: the only state that offers to read anything. */
@Composable
private fun DisconnectedSection(busy: Boolean, onConnect: () -> Unit) {
    Text(
        text = stringResource(R.string.health_privacy_note),
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    Spacer(Modifier.height(AzfSpacing.ElementGapMedium))
    PrimaryButton(
        text = stringResource(R.string.health_connect_action),
        onClick = onConnect,
        loading = busy,
    )
}

/** Connected here, but the platform has taken a permission back. */
@Composable
private fun LapsedSection(onManage: () -> Unit) {
    Text(
        text = stringResource(R.string.health_permissions_partial),
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    Spacer(Modifier.height(AzfSpacing.ElementGapMedium))
    SecondaryButton(text = stringResource(R.string.health_manage_action), onClick = onManage)
}

/** Connected and reading: today's figures, plus the two ways back out. */
@Composable
private fun ConnectedSection(
    snapshot: HealthDaySnapshot,
    onManage: () -> Unit,
    onDisconnect: () -> Unit,
) {
    AzfSectionHeading(text = stringResource(R.string.health_today_heading))
    Spacer(Modifier.height(AzfSpacing.ElementGapSmall))
    if (snapshot.isEmpty) {
        Text(
            text = stringResource(R.string.health_empty),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    } else {
        FigureRow(Icons.Outlined.DirectionsWalk, R.string.health_steps_label, snapshot.stepsText())
        FigureRow(Icons.Outlined.Favorite, R.string.health_heart_rate_label, snapshot.averageBpmText())
        FigureRow(Icons.Outlined.MonitorHeart, R.string.health_resting_label, snapshot.restingBpmText())
        FigureRow(Icons.Outlined.NightsStay, R.string.health_sleep_label, snapshot.sleepText())
        FigureRow(
            Icons.Outlined.LocalFireDepartment,
            R.string.health_energy_label,
            snapshot.energyText(),
        )
        Spacer(Modifier.height(AzfSpacing.ElementGapSmall))
        Text(
            text = stringResource(R.string.health_energy_note),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
    Spacer(Modifier.height(AzfSpacing.ElementGapMedium))
    Text(
        text = stringResource(R.string.health_disconnect_note),
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    Spacer(Modifier.height(AzfSpacing.ElementGapMedium))
    SecondaryButton(text = stringResource(R.string.health_manage_action), onClick = onManage)
    Spacer(Modifier.height(AzfSpacing.ElementGapSmall))
    SecondaryButton(text = stringResource(R.string.health_disconnect_action), onClick = onDisconnect)
}

/** One labelled figure. */
@Composable
private fun FigureRow(icon: ImageVector, @StringRes labelRes: Int, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(AzfSpacing.TouchTarget),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(20.dp),
            )
            Spacer(Modifier.size(12.dp))
            Text(
                text = stringResource(labelRes),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Text(
            text = value,
            style = MaterialTheme.typography.titleSmall,
            color = MaterialTheme.colorScheme.onSurface,
        )
    }
}

@Composable
private fun LoadingRow() {
    Row(
        modifier = Modifier.fillMaxWidth().height(AzfSpacing.TouchTarget),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CircularProgressIndicator(
            modifier = Modifier.size(20.dp),
            color = MaterialTheme.colorScheme.primary,
            strokeWidth = 2.dp,
        )
    }
}

// ----- formatting -----

@Composable
private fun HealthDaySnapshot.stepsText(): String {
    val locale = currentLocale()
    val steps = steps ?: return stringResource(R.string.health_value_none)
    return remember(steps, locale) { NumberFormat.getIntegerInstance(locale).format(steps) }
}

@Composable
private fun HealthDaySnapshot.averageBpmText(): String =
    averageHeartRateBpm?.let { stringResource(R.string.health_value_bpm, it) }
        ?: stringResource(R.string.health_value_none)

@Composable
private fun HealthDaySnapshot.restingBpmText(): String =
    restingHeartRateBpm?.let { stringResource(R.string.health_value_bpm, it) }
        ?: stringResource(R.string.health_value_none)

@Composable
private fun HealthDaySnapshot.energyText(): String =
    energyBurnedKcal?.let { stringResource(R.string.health_value_kcal, it) }
        ?: stringResource(R.string.health_value_none)

/**
 * Sleep as hours and minutes, dropping the hours for a nap.
 *
 * "0h 47m" reads as a broken figure rather than a short one, which is the sort
 * of thing that makes someone distrust the whole card.
 */
@Composable
private fun HealthDaySnapshot.sleepText(): String {
    val minutes = sleepMinutes ?: return stringResource(R.string.health_value_none)
    val hours = minutes / MINUTES_PER_HOUR
    val remainder = minutes % MINUTES_PER_HOUR
    return if (hours > 0) {
        stringResource(R.string.health_value_sleep_hours_minutes, hours, remainder)
    } else {
        stringResource(R.string.health_value_sleep_minutes, remainder)
    }
}

private const val MINUTES_PER_HOUR = 60L

/**
 * Start [intent], or do nothing.
 *
 * A device can lack the Play Store, and Health Connect's settings activity is
 * not guaranteed to exist even when the SDK reports it available. Neither is
 * worth a crash on a Settings tap.
 */
private fun Context.launchOrIgnore(intent: Intent) {
    try {
        startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    } catch (_: ActivityNotFoundException) {
        // Nothing to show. The card already explains the state it is in.
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416)
@Composable
private fun HealthConnectFiguresPreview() {
    AzfTheme {
        Column(Modifier.padding(16.dp)) {
            AzfCard {
                ConnectedSection(
                    snapshot = HealthDaySnapshot(
                        steps = 8421,
                        averageHeartRateBpm = 74,
                        restingHeartRateBpm = 52,
                        sleepMinutes = 437,
                        energyBurnedKcal = 2310,
                    ),
                    onManage = {},
                    onDisconnect = {},
                )
            }
        }
    }
}
