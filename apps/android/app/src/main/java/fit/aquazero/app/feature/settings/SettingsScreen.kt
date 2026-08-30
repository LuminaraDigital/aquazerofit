package fit.aquazero.app.feature.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
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
import androidx.compose.material.icons.automirrored.outlined.HelpOutline
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.outlined.OpenInNew
import androidx.compose.material.icons.outlined.AccountCircle
import androidx.compose.material.icons.outlined.Code
import androidx.compose.material.icons.outlined.DeleteForever
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Download
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.Gavel
import androidx.compose.material.icons.outlined.Group
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.NotificationsActive
import androidx.compose.material.icons.outlined.Psychology
import androidx.compose.material.icons.outlined.Shield
import androidx.compose.material.icons.outlined.WorkspacePremium
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import fit.aquazero.app.BuildConfig
import fit.aquazero.app.R
import fit.aquazero.app.core.designsystem.AzfAppHeader
import fit.aquazero.app.core.designsystem.AzfCard
import fit.aquazero.app.core.designsystem.AzfChip
import fit.aquazero.app.core.designsystem.AzfColors
import fit.aquazero.app.core.designsystem.AzfNavigationRow
import fit.aquazero.app.core.designsystem.AzfSectionHeading
import fit.aquazero.app.core.designsystem.AzfSegmentOption
import fit.aquazero.app.core.designsystem.AzfSegmented
import fit.aquazero.app.core.designsystem.AzfSpacing
import fit.aquazero.app.core.designsystem.AzfSwitchRow
import fit.aquazero.app.core.designsystem.AzfTextField
import fit.aquazero.app.core.designsystem.AzfTheme
import fit.aquazero.app.core.designsystem.ErrorState
import fit.aquazero.app.core.designsystem.PrimaryButton
import fit.aquazero.app.core.designsystem.SecondaryButton
import fit.aquazero.app.core.designsystem.ToastKind
import fit.aquazero.app.core.designsystem.currentLocale
import fit.aquazero.app.core.model.ActivityLevel
import fit.aquazero.app.core.model.Allergen
import fit.aquazero.app.core.model.DietaryPreference
import fit.aquazero.app.core.model.Goal
import fit.aquazero.app.core.model.Sex
import fit.aquazero.app.core.model.UnitPreference
import fit.aquazero.app.core.model.WellnessProfileDto
import fit.aquazero.app.core.ui.LocaleFormatters
import fit.aquazero.app.core.ui.SetupUnits
import fit.aquazero.app.core.ui.TargetsNotSetCard
import fit.aquazero.app.feature.dashboard.rememberToastSink
import java.time.YearMonth
import kotlin.math.roundToInt

/**
 * Profile and settings.
 *
 * This screen is a Play compliance surface as much as a preferences page.
 * Three things have to be true of it and are:
 *
 *  - the four granular consents are individually togglable, and each one
 *    changes what the app actually does rather than only what it shows;
 *  - account deletion is two taps from here, not buried, and its copy states
 *    the real grace period the server implements;
 *  - the AGPL §13 source link is reachable from the running app.
 *
 * Privacy, terms, support and the source repository open in a Chrome Custom
 * Tab: they are published documents on a release cadence of their own, and a
 * policy compiled into an APK is stale until the next store review.
 */
@Composable
fun SettingsScreen(
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    onOpenNotifications: () -> Unit = {},
    onOpenMemory: () -> Unit = {},
    onOpenPlan: () -> Unit = {},
    onOpenChallenges: () -> Unit = {},
    onEditBiometrics: () -> Unit = {},
    viewModel: SettingsViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val resources = LocalResources.current
    val toasts = rememberToastSink()
    val linkFailed = stringResource(R.string.settings_link_failed)

    LaunchedEffect(viewModel) {
        viewModel.events.collect { event ->
            when (event) {
                is SettingsEvent.Message -> toasts.show(
                    resources.getString(event.messageRes, SettingsViewModel.DELETION_GRACE_DAYS),
                    if (event.isError) ToastKind.Error else ToastKind.Success,
                )
                is SettingsEvent.ShareExport -> {
                    if (!context.shareDataExport(event.json)) {
                        toasts.show(
                            resources.getString(R.string.settings_export_failed),
                            ToastKind.Error,
                        )
                    }
                }
                SettingsEvent.SignedOut -> Unit // the shell swaps graphs on auth state
            }
        }
    }

    fun open(url: String) {
        if (!context.openInCustomTab(url)) toasts.show(linkFailed, ToastKind.Error)
    }

    Scaffold(
        modifier = modifier.fillMaxSize(),
        topBar = {
            AzfAppHeader(title = stringResource(R.string.settings_title), onBack = onBack)
        },
    ) { innerPadding ->
        LazyColumn(
            modifier = Modifier
                .padding(innerPadding)
                .fillMaxSize(),
            contentPadding = PaddingValues(
                start = AzfSpacing.ContainerMargin,
                end = AzfSpacing.ContainerMargin,
                top = AzfSpacing.ContainerMargin,
                bottom = 40.dp,
            ),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item(contentType = "identity") { IdentityCard(state, viewModel) }

            item(contentType = "disclaimer") { DisclaimerCard() }

            item(contentType = "heading") { AzfSectionHeading(stringResource(R.string.settings_profile_heading)) }
            item(contentType = "profile") {
                when {
                    state.profile != null -> ProfileSummaryCard(
                        profile = state.profile,
                        onEdit = onEditBiometrics,
                    )
                    state.profileUnavailable -> ErrorState(
                        title = stringResource(R.string.settings_profile_error_title),
                        message = stringResource(R.string.settings_profile_error),
                        retryLabel = stringResource(R.string.memory_retry),
                        onRetry = { viewModel.refresh() },
                    )
                    state.loading -> LoadingRow()
                    else -> TargetsNotSetCard(onSetUp = onEditBiometrics)
                }
            }

            if (state.profile != null) {
                item(contentType = "heading") {
                    AzfSectionHeading(stringResource(R.string.settings_preferences_heading))
                }
                item(contentType = "preferences") { PreferenceCards(state, viewModel) }
            }

            item(contentType = "nav-row") {
                AzfNavigationRow(
                    title = stringResource(R.string.settings_notifications),
                    body = stringResource(R.string.settings_notifications_body),
                    onClick = onOpenNotifications,
                    icon = Icons.Outlined.NotificationsActive,
                    trailing = Icons.AutoMirrored.Outlined.KeyboardArrowRight,
                )
            }

            item(contentType = "heading") { AzfSectionHeading(stringResource(R.string.settings_privacy_heading)) }
            item(contentType = "consent") { ConsentCard(state, viewModel) }

            item(contentType = "nav-row") {
                AzfNavigationRow(
                    title = stringResource(R.string.settings_memory_title),
                    body = stringResource(R.string.settings_memory_body),
                    onClick = onOpenMemory,
                    icon = Icons.Outlined.Psychology,
                    trailing = Icons.AutoMirrored.Outlined.KeyboardArrowRight,
                )
            }
            item(contentType = "nav-row") {
                AzfNavigationRow(
                    title = stringResource(R.string.settings_challenges_title),
                    body = stringResource(R.string.settings_challenges_body),
                    onClick = onOpenChallenges,
                    icon = Icons.Outlined.Group,
                    trailing = Icons.AutoMirrored.Outlined.KeyboardArrowRight,
                )
            }
            item(contentType = "nav-row") {
                AzfNavigationRow(
                    title = stringResource(R.string.settings_plan_title),
                    body = stringResource(R.string.settings_plan_body),
                    onClick = onOpenPlan,
                    icon = Icons.Outlined.WorkspacePremium,
                    trailing = Icons.AutoMirrored.Outlined.KeyboardArrowRight,
                )
            }
            item(contentType = "nav-row") {
                AzfNavigationRow(
                    title = if (state.exporting) {
                        stringResource(R.string.settings_export_preparing)
                    } else {
                        stringResource(R.string.settings_export_title)
                    },
                    body = stringResource(R.string.settings_export_body),
                    onClick = viewModel::exportData,
                    enabled = !state.exporting,
                    icon = Icons.Outlined.Download,
                )
            }

            item(contentType = "heading") { AzfSectionHeading(stringResource(R.string.settings_legal_heading)) }
            item(contentType = "legal") {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    AzfNavigationRow(
                        title = stringResource(R.string.settings_privacy_policy),
                        body = stringResource(R.string.settings_link_opens_browser),
                        onClick = { open(ExternalLinks.PRIVACY) },
                        icon = Icons.Outlined.Shield,
                        trailing = Icons.AutoMirrored.Outlined.OpenInNew,
                    )
                    AzfNavigationRow(
                        title = stringResource(R.string.settings_terms),
                        body = stringResource(R.string.settings_link_opens_browser),
                        onClick = { open(ExternalLinks.TERMS) },
                        icon = Icons.Outlined.Description,
                        trailing = Icons.AutoMirrored.Outlined.OpenInNew,
                    )
                    AzfNavigationRow(
                        title = stringResource(R.string.settings_support),
                        body = stringResource(R.string.settings_link_opens_browser),
                        onClick = { open(ExternalLinks.SUPPORT) },
                        icon = Icons.AutoMirrored.Outlined.HelpOutline,
                        trailing = Icons.AutoMirrored.Outlined.OpenInNew,
                    )
                    // AGPL-3.0 §13: the source of the running program must be
                    // offered to its users. This row is a licence obligation,
                    // not a credit — do not remove it, and repoint it if you
                    // ship a modified build.
                    AzfNavigationRow(
                        title = stringResource(R.string.settings_source_code),
                        body = stringResource(R.string.settings_source_code_body),
                        onClick = { open(ExternalLinks.SOURCE_CODE) },
                        icon = Icons.Outlined.Code,
                        trailing = Icons.AutoMirrored.Outlined.OpenInNew,
                    )
                    AzfNavigationRow(
                        title = stringResource(R.string.settings_licence),
                        body = stringResource(R.string.settings_link_opens_browser),
                        onClick = { open(ExternalLinks.LICENCE) },
                        icon = Icons.Outlined.Gavel,
                        trailing = Icons.AutoMirrored.Outlined.OpenInNew,
                    )
                }
            }

            item(contentType = "heading") { AzfSectionHeading(stringResource(R.string.settings_danger_heading)) }
            item(contentType = "deletion") {
                DeletionCard(
                    state = state,
                    viewModel = viewModel,
                    onOpenWeb = { open(ExternalLinks.ACCOUNT_DELETION) },
                )
            }

            item(contentType = "sign-out") {
                SecondaryButton(
                    text = stringResource(
                        if (state.signingOut) {
                            R.string.settings_sign_out_draining
                        } else {
                            R.string.settings_sign_out
                        },
                    ),
                    onClick = { viewModel.signOut() },
                    enabled = !state.signingOut,
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            item(contentType = "version") {
                Text(
                    text = stringResource(
                        R.string.settings_version,
                        BuildConfig.VERSION_NAME,
                        BuildConfig.VERSION_CODE,
                    ),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }

    SettingsDialogs(state = state, viewModel = viewModel)
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

@Composable
private fun LoadingRow() {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(96.dp),
        contentAlignment = Alignment.Center,
    ) {
        CircularProgressIndicator(color = AzfColors.PrimaryFixedDim)
    }
}

@Composable
private fun IdentityCard(state: SettingsUiState, viewModel: SettingsViewModel) {
    AzfCard(modifier = Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                imageVector = Icons.Outlined.AccountCircle,
                contentDescription = stringResource(R.string.settings_avatar_cd),
                tint = AzfColors.PrimaryFixedDim,
                modifier = Modifier.size(48.dp),
            )
            Spacer(modifier = Modifier.size(16.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = state.displayName.ifBlank {
                        stringResource(R.string.settings_default_name)
                    },
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    text = state.memberSince.takeIf { it.isNotBlank() }
                        ?.let { stringResource(R.string.settings_member_since, formatMonthYear(it)) }
                        ?: state.email,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (!state.editingName) {
                IconButton(onClick = viewModel::startEditingName) {
                    Icon(
                        imageVector = Icons.Outlined.Edit,
                        contentDescription = stringResource(R.string.settings_edit_name),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
        if (state.editingName) {
            Spacer(modifier = Modifier.height(12.dp))
            AzfTextField(
                value = state.nameDraft,
                onValueChange = viewModel::onNameDraftChange,
                label = stringResource(R.string.settings_display_name),
                enabled = !state.savingName,
            )
            Spacer(modifier = Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                SecondaryButton(
                    text = stringResource(R.string.settings_cancel),
                    onClick = viewModel::cancelEditingName,
                    enabled = !state.savingName,
                    modifier = Modifier.weight(1f),
                )
                PrimaryButton(
                    text = stringResource(R.string.settings_save),
                    onClick = viewModel::saveName,
                    loading = state.savingName,
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

@Composable
private fun DisclaimerCard() {
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
                    text = stringResource(R.string.settings_disclaimer_heading).uppercase(),
                    style = MaterialTheme.typography.labelMedium,
                    color = AzfColors.SecondaryFixedDim,
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = stringResource(R.string.settings_disclaimer_body),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun ProfileSummaryCard(profile: WellnessProfileDto?, onEdit: () -> Unit) {
    if (profile == null) return
    AzfCard(modifier = Modifier.fillMaxWidth()) {
        SummaryRow(stringResource(R.string.settings_profile_age), profile.age.toString())
        SummaryRow(stringResource(R.string.settings_profile_sex), stringResource(sexLabel(profile.sex)))
        SummaryRow(
            stringResource(R.string.settings_profile_height),
            formatHeight(profile.heightCm, profile.unitPreference),
        )
        SummaryRow(
            stringResource(R.string.settings_profile_weight),
            formatWeight(profile.weightKg, profile.unitPreference),
        )
        SummaryRow(stringResource(R.string.settings_profile_goal), stringResource(goalLabel(profile.goal)))
        SummaryRow(
            stringResource(R.string.settings_profile_activity),
            stringResource(activityLabel(profile.activityLevel)),
        )
        Spacer(modifier = Modifier.height(12.dp))
        SecondaryButton(
            text = stringResource(R.string.settings_profile_edit),
            onClick = onEdit,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
private fun SummaryRow(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface,
        )
    }
}

@Composable
private fun PreferenceCards(state: SettingsUiState, viewModel: SettingsViewModel) {
    val profile = state.profile ?: return
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        AzfCard(modifier = Modifier.fillMaxWidth()) {
            AzfSegmented(
                label = stringResource(R.string.settings_units),
                options = listOf(
                    AzfSegmentOption(
                        UnitPreference.METRIC,
                        stringResource(R.string.setup_unit_metric),
                    ),
                    AzfSegmentOption(
                        UnitPreference.IMPERIAL,
                        stringResource(R.string.setup_unit_imperial),
                    ),
                ),
                selected = profile.unitPreference,
                onSelect = { if (state.profileEditable) viewModel.setUnitPreference(it) },
            )
        }
        AzfCard(modifier = Modifier.fillMaxWidth()) {
            Text(
                text = stringResource(R.string.settings_dietary_heading),
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(modifier = Modifier.height(8.dp))
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                DietaryPreference.entries.forEach { preference ->
                    AzfChip(
                        text = stringResource(dietaryLabel(preference)),
                        selected = preference in profile.dietaryPreferences,
                        onClick = {
                            if (state.profileEditable) viewModel.toggleDietaryPreference(preference)
                        },
                    )
                }
            }
        }
        AzfCard(modifier = Modifier.fillMaxWidth()) {
            Text(
                text = stringResource(R.string.settings_allergies_heading),
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = stringResource(R.string.settings_allergies_body),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(modifier = Modifier.height(8.dp))
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Allergen.entries.forEach { allergen ->
                    AzfChip(
                        text = stringResource(allergenLabel(allergen)),
                        selected = allergen in profile.allergies,
                        onClick = { if (state.profileEditable) viewModel.toggleAllergy(allergen) },
                    )
                }
            }
        }
    }
}

@Composable
private fun ConsentCard(state: SettingsUiState, viewModel: SettingsViewModel) {
    val consents = state.consents
    AzfCard(modifier = Modifier.fillMaxWidth()) {
        if (consents == null) {
            Text(
                text = stringResource(R.string.settings_consents_loading),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            return@AzfCard
        }
        AzfSwitchRow(
            title = stringResource(R.string.consent_wellness_title),
            body = stringResource(R.string.consent_wellness_body),
            checked = consents.wellnessDataProcessing,
            onCheckedChange = { viewModel.setConsent(ConsentKey.WELLNESS, it) },
            enabled = state.savingConsent == null,
        )
        Spacer(modifier = Modifier.height(4.dp))
        AzfSwitchRow(
            title = stringResource(R.string.consent_ai_title),
            body = stringResource(R.string.consent_ai_body),
            checked = consents.aiPersonalisation,
            onCheckedChange = { viewModel.setConsent(ConsentKey.AI_PERSONALISATION, it) },
            enabled = state.savingConsent == null,
        )
        Spacer(modifier = Modifier.height(4.dp))
        AzfSwitchRow(
            title = stringResource(R.string.consent_analytics_title),
            body = stringResource(R.string.consent_analytics_body),
            checked = consents.anonymisedAnalytics,
            onCheckedChange = { viewModel.setConsent(ConsentKey.ANALYTICS, it) },
            enabled = state.savingConsent == null,
        )
        Spacer(modifier = Modifier.height(4.dp))
        AzfSwitchRow(
            title = stringResource(R.string.consent_reminders_title),
            body = stringResource(R.string.consent_reminders_body),
            checked = consents.reminders,
            onCheckedChange = { viewModel.setConsent(ConsentKey.REMINDERS, it) },
            enabled = state.savingConsent == null,
        )
    }
}

@Composable
private fun DeletionCard(
    state: SettingsUiState,
    viewModel: SettingsViewModel,
    onOpenWeb: () -> Unit,
) {
    val grace = SettingsViewModel.DELETION_GRACE_DAYS
    AzfCard(modifier = Modifier.fillMaxWidth()) {
        if (state.deletionRequestedAt == null) {
            Text(
                text = stringResource(R.string.settings_delete_body, grace),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = stringResource(R.string.settings_delete_export_first),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(modifier = Modifier.height(16.dp))
            SecondaryButton(
                text = stringResource(R.string.settings_delete_cta),
                onClick = { viewModel.showDialog(SettingsDialog.RequestDeletion) },
                modifier = Modifier.fillMaxWidth(),
            )
        } else {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = Icons.Outlined.DeleteForever,
                    contentDescription = null,
                    tint = AzfColors.Coral,
                    modifier = Modifier.size(20.dp),
                )
                Spacer(modifier = Modifier.size(8.dp))
                Text(
                    text = stringResource(R.string.settings_delete_pending_heading).uppercase(),
                    style = MaterialTheme.typography.labelMedium,
                    color = AzfColors.Coral,
                )
            }
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = stringResource(R.string.settings_delete_pending_body, grace),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(modifier = Modifier.height(16.dp))
            SecondaryButton(
                text = stringResource(R.string.settings_delete_now_cta),
                onClick = { viewModel.showDialog(SettingsDialog.PurgeNow) },
                modifier = Modifier.fillMaxWidth(),
            )
        }
        Spacer(modifier = Modifier.height(12.dp))
        Text(
            text = stringResource(R.string.settings_delete_web_note),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(modifier = Modifier.height(4.dp))
        TextButton(onClick = onOpenWeb) {
            Text(text = stringResource(R.string.settings_delete_web_cta))
        }
    }
}

@Composable
private fun SettingsDialogs(state: SettingsUiState, viewModel: SettingsViewModel) {
    val dialog = state.dialog ?: return
    val grace = SettingsViewModel.DELETION_GRACE_DAYS
    when (dialog) {
        SettingsDialog.RequestDeletion -> ConfirmDialog(
            title = stringResource(R.string.settings_delete_dialog_title),
            body = stringResource(R.string.settings_delete_dialog_body, grace),
            confirmLabel = stringResource(R.string.settings_delete_dialog_confirm),
            busy = state.deleting,
            onConfirm = viewModel::confirmDeletion,
            onDismiss = viewModel::dismissDialog,
        )
        SettingsDialog.PurgeNow -> ConfirmDialog(
            title = stringResource(R.string.settings_delete_now_dialog_title),
            body = stringResource(R.string.settings_delete_now_dialog_body),
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

private fun sexLabel(sex: Sex): Int = when (sex) {
    Sex.FEMALE -> R.string.setup_sex_female
    Sex.MALE -> R.string.setup_sex_male
    Sex.UNSPECIFIED -> R.string.setup_sex_unspecified
}

private fun goalLabel(goal: Goal): Int = when (goal) {
    Goal.LOSE -> R.string.setup_goal_lose
    Goal.MAINTAIN -> R.string.setup_goal_maintain
    Goal.GAIN -> R.string.setup_goal_gain
}

private fun activityLabel(level: ActivityLevel): Int = when (level) {
    ActivityLevel.SEDENTARY -> R.string.setup_activity_sedentary
    ActivityLevel.LIGHT -> R.string.setup_activity_light
    ActivityLevel.MODERATE -> R.string.setup_activity_moderate
    ActivityLevel.ACTIVE -> R.string.setup_activity_active
    ActivityLevel.VERY_ACTIVE -> R.string.setup_activity_very_active
}

private fun dietaryLabel(preference: DietaryPreference): Int = when (preference) {
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

private fun allergenLabel(allergen: Allergen): Int = when (allergen) {
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
private fun formatHeight(heightCm: Double, unit: UnitPreference): String =
    if (unit == UnitPreference.IMPERIAL) {
        val (feet, inches) = SetupUnits.cmToFtIn(heightCm)
        stringResource(R.string.settings_height_imperial, feet, inches)
    } else {
        stringResource(R.string.settings_height_metric, heightCm.roundToInt())
    }

@Composable
private fun formatWeight(weightKg: Double, unit: UnitPreference): String {
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
private fun formatMonthYear(isoTimestamp: String): String = runCatching {
    val date = java.time.OffsetDateTime.parse(isoTimestamp).toLocalDate()
    YearMonth.from(date).format(LocaleFormatters.of(MONTH_YEAR_PATTERN))
}.getOrDefault(isoTimestamp)

private const val MONTH_YEAR_PATTERN = "LLLL yyyy"

@Preview(showBackground = true, backgroundColor = 0xFF0E1416, heightDp = 1600)
@Composable
private fun SettingsPreview() {
    AzfTheme {
        Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            DisclaimerCard()
            SummaryRow("Goal", "Lose weight")
        }
    }
}
