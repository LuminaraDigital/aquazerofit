package fit.aquazero.app.feature.settings

import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Download
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import fit.aquazero.app.R
import fit.aquazero.app.core.designsystem.AzfCard
import fit.aquazero.app.core.designsystem.AzfColors
import fit.aquazero.app.core.designsystem.AzfNavigationRow
import fit.aquazero.app.core.designsystem.AzfSwitchRow
import fit.aquazero.app.core.designsystem.currentLocale
import fit.aquazero.app.core.model.ActivityLevel
import fit.aquazero.app.core.model.Allergen
import fit.aquazero.app.core.model.DietaryPreference
import fit.aquazero.app.core.model.Goal
import fit.aquazero.app.core.model.Sex
import fit.aquazero.app.core.model.UnitPreference
import fit.aquazero.app.core.security.DeviceSecurityState
import fit.aquazero.app.core.ui.LocaleFormatters
import fit.aquazero.app.core.ui.SetupUnits
import java.time.YearMonth
import kotlin.math.roundToInt

/**
 * Enterprise device security card (EN-2.1, EN-2.2, EN-3.3).
 *
 * Renders the app-lock and screen-capture protection switches. When an MDM
 * policy forces either control ON, the switch is checked, disabled, and shows
 * the policy-enforced description.
 */
@Composable
internal fun DeviceSecurityCard(
    security: DeviceSecurityState,
    onAppLockChanged: (Boolean) -> Unit,
    onScreenCaptureChanged: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    AzfCard(modifier = modifier.fillMaxWidth()) {
        AzfSwitchRow(
            title = stringResource(R.string.security_app_lock_title),
            body = if (security.restrictions.forceAppLock) {
                stringResource(R.string.security_app_lock_managed_body)
            } else {
                stringResource(R.string.security_app_lock_body)
            },
            checked = security.effectiveAppLockEnabled,
            onCheckedChange = onAppLockChanged,
            enabled = !security.restrictions.forceAppLock,
        )
        Spacer(modifier = Modifier.height(4.dp))
        AzfSwitchRow(
            title = stringResource(R.string.security_screen_capture_title),
            body = if (security.restrictions.forceScreenCaptureProtection) {
                stringResource(R.string.security_screen_capture_managed_body)
            } else {
                stringResource(R.string.security_screen_capture_body)
            },
            checked = security.effectiveScreenCaptureProtection,
            onCheckedChange = onScreenCaptureChanged,
            enabled = !security.restrictions.forceScreenCaptureProtection,
        )
    }
}

/**
 * JSON data export navigation row, disabled when MDM `disable_data_export` is active.
 */
@Composable
internal fun DataExportRow(
    exporting: Boolean,
    dataExportAllowed: Boolean,
    onExport: () -> Unit,
) {
    AzfNavigationRow(
        title = if (exporting) {
            stringResource(R.string.settings_export_preparing)
        } else {
            stringResource(R.string.settings_export_title)
        },
        body = if (dataExportAllowed) {
            stringResource(R.string.settings_export_body)
        } else {
            stringResource(R.string.settings_export_disabled_by_policy)
        },
        onClick = onExport,
        enabled = !exporting && dataExportAllowed,
        icon = Icons.Outlined.Download,
    )
}

@Composable
internal fun SettingsDialogs(state: SettingsUiState, viewModel: SettingsViewModel) {
    val dialog = state.dialog ?: return
    val grace = SettingsViewModel.DELETION_GRACE_DAYS
    val playWarning = if (state.playSubscriptionActive) {
        "\n\n" + stringResource(R.string.settings_delete_play_warning)
    } else {
        ""
    }
    when (dialog) {
        SettingsDialog.RequestDeletion -> ConfirmDialog(
            title = stringResource(R.string.settings_delete_dialog_title),
            body = stringResource(R.string.settings_delete_dialog_body, grace) + playWarning,
            confirmLabel = stringResource(R.string.settings_delete_dialog_confirm),
            busy = state.deleting,
            onConfirm = viewModel::confirmDeletion,
            onDismiss = viewModel::dismissDialog,
        )
        SettingsDialog.PurgeNow -> ConfirmDialog(
            title = stringResource(R.string.settings_delete_now_dialog_title),
            body = stringResource(R.string.settings_delete_now_dialog_body) + playWarning,
            confirmLabel = stringResource(R.string.settings_delete_now_confirm),
            busy = state.deleting,
            onConfirm = viewModel::confirmDeletion,
            onDismiss = viewModel::dismissDialog,
        )
        is SettingsDialog.SignOutWithPending -> ConfirmDialog(
            title = stringResource(R.string.settings_sign_out_pending_title),
            body = stringResource(R.string.settings_sign_out_pending_body, dialog.pending),
            confirmLabel = stringResource(R.string.settings_sign_out_pending_confirm),
            busy = state.signingOut,
            onConfirm = { viewModel.signOut(force = true) },
            onDismiss = viewModel::dismissDialog,
        )
    }
}

@Composable
private fun ConfirmDialog(
    title: String,
    body: String,
    confirmLabel: String,
    busy: Boolean,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        title = { Text(text = title, style = MaterialTheme.typography.titleMedium) },
        text = { Text(text = body, style = MaterialTheme.typography.bodyMedium) },
        confirmButton = {
            TextButton(onClick = onConfirm, enabled = !busy) {
                Text(text = confirmLabel, color = AzfColors.Coral)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !busy) {
                Text(text = stringResource(R.string.settings_cancel))
            }
        },
        containerColor = AzfColors.SurfaceContainerHigh,
    )
}

// ---------------------------------------------------------------------------
// Labels and formatting
// ---------------------------------------------------------------------------

internal fun sexLabel(sex: Sex): Int = when (sex) {
    Sex.FEMALE -> R.string.setup_sex_female
    Sex.MALE -> R.string.setup_sex_male
    Sex.UNSPECIFIED -> R.string.setup_sex_unspecified
}

internal fun goalLabel(goal: Goal): Int = when (goal) {
    Goal.LOSE -> R.string.setup_goal_lose
    Goal.MAINTAIN -> R.string.setup_goal_maintain
    Goal.GAIN -> R.string.setup_goal_gain
}

internal fun activityLabel(level: ActivityLevel): Int = when (level) {
    ActivityLevel.SEDENTARY -> R.string.setup_activity_sedentary
    ActivityLevel.LIGHT -> R.string.setup_activity_light
    ActivityLevel.MODERATE -> R.string.setup_activity_moderate
    ActivityLevel.ACTIVE -> R.string.setup_activity_active
    ActivityLevel.VERY_ACTIVE -> R.string.setup_activity_very_active
}

internal fun dietaryLabel(preference: DietaryPreference): Int = when (preference) {
    DietaryPreference.VEGETARIAN -> R.string.diet_vegetarian
    DietaryPreference.VEGAN -> R.string.diet_vegan
    DietaryPreference.PESCATARIAN -> R.string.diet_pescatarian
    DietaryPreference.HALAL -> R.string.diet_halal
    DietaryPreference.KOSHER -> R.string.diet_kosher
    DietaryPreference.GLUTEN_FREE -> R.string.diet_gluten_free
    DietaryPreference.DAIRY_FREE -> R.string.diet_dairy_free
    DietaryPreference.LOW_CARB -> R.string.diet_low_carb
    DietaryPreference.HIGH_PROTEIN -> R.string.diet_high_protein
}

internal fun allergenLabel(allergen: Allergen): Int = when (allergen) {
    Allergen.PEANUTS -> R.string.allergen_title_peanuts
    Allergen.TREE_NUTS -> R.string.allergen_title_tree_nuts
    Allergen.MILK -> R.string.allergen_title_milk
    Allergen.EGGS -> R.string.allergen_title_eggs
    Allergen.FISH -> R.string.allergen_title_fish
    Allergen.SHELLFISH -> R.string.allergen_title_shellfish
    Allergen.SOY -> R.string.allergen_title_soy
    Allergen.WHEAT -> R.string.allergen_title_wheat
    Allergen.SESAME -> R.string.allergen_title_sesame
}

@Composable
internal fun formatHeight(heightCm: Double, unit: UnitPreference): String =
    if (unit == UnitPreference.IMPERIAL) {
        val (feet, inches) = SetupUnits.cmToFtIn(heightCm)
        stringResource(R.string.settings_height_imperial, feet, inches)
    } else {
        stringResource(R.string.settings_height_metric, heightCm.roundToInt())
    }

@Composable
internal fun formatWeight(weightKg: Double, unit: UnitPreference): String {
    val value = SetupUnits.round1(SetupUnits.kgToDisplay(weightKg, unit))
    val text = String.format(currentLocale(), "%.1f", value)
    return if (unit == UnitPreference.IMPERIAL) {
        stringResource(R.string.settings_weight_imperial, text)
    } else {
        stringResource(R.string.settings_weight_metric, text)
    }
}

/**
 * "August 2026" from the ISO timestamp `/me` returns; the raw value on failure.
 *
 * Called from inside the identity card's composition, so the formatter comes
 * from the [LocaleFormatters] cache instead of being compiled per call.
 */
internal fun formatMonthYear(isoTimestamp: String): String = runCatching {
    val date = java.time.OffsetDateTime.parse(isoTimestamp).toLocalDate()
    YearMonth.from(date).format(LocaleFormatters.of(MONTH_YEAR_PATTERN))
}.getOrDefault(isoTimestamp)

private const val MONTH_YEAR_PATTERN = "LLLL yyyy"
