package fit.aquazero.app.feature.settings

import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Undo
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.ExpandLess
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.Psychology
import androidx.compose.material.icons.outlined.Spa
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import fit.aquazero.app.R
import fit.aquazero.app.core.designsystem.AzfAppHeader
import fit.aquazero.app.core.designsystem.AzfCard
import fit.aquazero.app.core.designsystem.AzfChip
import fit.aquazero.app.core.designsystem.AzfColors
import fit.aquazero.app.core.designsystem.AzfSectionHeading
import fit.aquazero.app.core.designsystem.AzfSpacing
import fit.aquazero.app.core.designsystem.AzfTextField
import fit.aquazero.app.core.designsystem.AzfTheme
import fit.aquazero.app.core.designsystem.EmptyState
import fit.aquazero.app.core.designsystem.ErrorState
import fit.aquazero.app.core.designsystem.PrimaryButton
import fit.aquazero.app.core.designsystem.SecondaryButton
import fit.aquazero.app.core.designsystem.Skeleton
import fit.aquazero.app.core.designsystem.ToastKind
import fit.aquazero.app.core.model.MemoryFactCategory
import fit.aquazero.app.core.model.MemoryFactDto
import fit.aquazero.app.core.model.MemoryFactStatus
import fit.aquazero.app.feature.dashboard.rememberToastSink

/**
 * What your coach remembers.
 *
 * Two things carry the screen. One is that every control is a visible,
 * labelled button — nothing is revealed on hover or long-press, because the
 * point of the screen is that a person can see exactly what is held about them
 * and act on it. The other is the consent-off state: turning AI personalisation
 * off pauses memory rather than breaking it, so that state is a calm
 * explanation with a way back, not an error.
 */
@Composable
fun MemoryScreen(
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    onReviewConsents: () -> Unit = onBack,
    viewModel: MemoryViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val resources = LocalResources.current
    val toasts = rememberToastSink()

    LaunchedEffect(viewModel) {
        viewModel.events.collect { event ->
            when (event) {
                is MemoryEvent.Message -> toasts.show(
                    resources.getString(event.messageRes),
                    if (event.isError) ToastKind.Error else ToastKind.Success,
                )
            }
        }
    }

    Scaffold(
        modifier = modifier.fillMaxSize(),
        topBar = {
            AzfAppHeader(title = stringResource(R.string.memory_title), onBack = onBack)
        },
    ) { innerPadding ->
        if (state.consentOff) {
            ConsentOffState(
                onReviewConsents = onReviewConsents,
                modifier = Modifier
                    .padding(innerPadding)
                    .fillMaxSize(),
            )
            return@Scaffold
        }

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
            item(contentType = "intro") {
                Column {
                    Text(
                        text = stringResource(R.string.memory_heading),
                        style = MaterialTheme.typography.headlineMedium,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        text = stringResource(R.string.memory_intro),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            if (state.loading) {
                item(contentType = "skeleton") {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Skeleton(modifier = Modifier.fillMaxWidth().height(96.dp))
                        Skeleton(modifier = Modifier.fillMaxWidth().height(80.dp))
                        Skeleton(modifier = Modifier.fillMaxWidth().height(80.dp))
                    }
                }
                return@LazyColumn
            }

            if (state.loadFailed) {
                item(contentType = "error") {
                    ErrorState(
                        title = stringResource(R.string.memory_title),
                        message = stringResource(R.string.memory_error),
                        retryLabel = stringResource(R.string.memory_retry),
                        onRetry = viewModel::load,
                    )
                }
                return@LazyColumn
            }

            if (state.summary.isNotEmpty()) {
                item(contentType = "summary") {
                    AzfCard(modifier = Modifier.fillMaxWidth()) {
                        Text(
                            text = stringResource(R.string.memory_summary_heading).uppercase(),
                            style = MaterialTheme.typography.labelMedium,
                            color = AzfColors.SecondaryFixedDim,
                        )
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(
                            text = state.summary,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurface,
                        )
                    }
                }
            }

            if (state.isEmpty) {
                item(contentType = "empty") {
                    EmptyState(
                        title = stringResource(R.string.memory_empty_title),
                        message = stringResource(R.string.memory_empty_body),
                        icon = Icons.Outlined.Psychology,
                    )
                }
            }

            if (state.suggested.isNotEmpty()) {
                item(contentType = "suggested-heading") {
                    Column {
                        AzfSectionHeading(
                            stringResource(R.string.memory_suggested_heading, state.suggested.size),
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = stringResource(R.string.memory_suggested_body),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(start = 4.dp),
                        )
                    }
                }
                items(state.suggested, key = { it.id }, contentType = { "suggested-fact" }) { fact ->
                    SuggestedFactCard(
                        fact = fact,
                        busy = state.busy,
                        onKeep = { viewModel.setStatus(fact, MemoryFactStatus.CONFIRMED) },
                        onReject = { viewModel.setStatus(fact, MemoryFactStatus.REJECTED) },
                    )
                }
            }

            if (state.confirmed.isNotEmpty()) {
                item(contentType = "heading") {
                    AzfSectionHeading(
                        stringResource(R.string.memory_confirmed_heading, state.confirmed.size),
                    )
                }
                items(state.confirmed, key = { it.id }, contentType = { "confirmed-fact" }) { fact ->
                    ConfirmedFactCard(
                        fact = fact,
                        editing = state.editingFactId == fact.id,
                        editingText = state.editingText,
                        busy = state.busy,
                        onStartEdit = { viewModel.startEditing(fact) },
                        onEditChange = viewModel::onEditingTextChange,
                        onCancelEdit = viewModel::cancelEditing,
                        onSaveEdit = viewModel::saveEditing,
                        onDelete = { viewModel.deleteFact(fact) },
                    )
                }
            }

            if (state.rejected.isNotEmpty()) {
                item(contentType = "rejected-toggle") {
                    TextButton(onClick = viewModel::toggleRejected) {
                        Text(
                            text = stringResource(
                                R.string.memory_rejected_heading,
                                state.rejected.size,
                            ),
                        )
                        Spacer(modifier = Modifier.size(4.dp))
                        Icon(
                            imageVector = if (state.rejectedExpanded) {
                                Icons.Outlined.ExpandLess
                            } else {
                                Icons.Outlined.ExpandMore
                            },
                            contentDescription = null,
                        )
                    }
                }
                if (state.rejectedExpanded) {
                    items(state.rejected, key = { it.id }, contentType = { "rejected-fact" }) { fact ->
                        RejectedFactCard(
                            fact = fact,
                            busy = state.busy,
                            onRestore = { viewModel.setStatus(fact, MemoryFactStatus.CONFIRMED) },
                            onDelete = { viewModel.deleteFact(fact) },
                        )
                    }
                }
            }

            item(contentType = "add-fact") { AddFactCard(state = state, viewModel = viewModel) }

            item(contentType = "forget") {
                AzfCard(modifier = Modifier.fillMaxWidth()) {
                    Text(
                        text = stringResource(R.string.memory_forget_body),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    SecondaryButton(
                        text = stringResource(R.string.memory_forget_cta),
                        onClick = viewModel::showForgetDialog,
                        enabled = state.canForget,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
        }
    }

    if (state.showForgetDialog) {
        AlertDialog(
            onDismissRequest = { if (!state.busy) viewModel.dismissForgetDialog() },
            title = { Text(text = stringResource(R.string.memory_forget_dialog_title)) },
            text = { Text(text = stringResource(R.string.memory_forget_dialog_body)) },
            confirmButton = {
                TextButton(onClick = viewModel::forgetEverything, enabled = !state.busy) {
                    Text(
                        text = stringResource(R.string.memory_forget_confirm),
                        color = AzfColors.Coral,
                    )
                }
            },
            dismissButton = {
                TextButton(onClick = viewModel::dismissForgetDialog, enabled = !state.busy) {
                    Text(text = stringResource(R.string.memory_cancel))
                }
            },
            containerColor = AzfColors.SurfaceContainerHigh,
        )
    }
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

@Composable
private fun ConsentOffState(onReviewConsents: () -> Unit, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.padding(AzfSpacing.ContainerMargin),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(
            imageVector = Icons.Outlined.Spa,
            contentDescription = null,
            tint = AzfColors.SecondaryFixedDim,
            modifier = Modifier.size(56.dp),
        )
        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = stringResource(R.string.memory_consent_off_title),
            style = MaterialTheme.typography.headlineMedium,
            color = MaterialTheme.colorScheme.onSurface,
            textAlign = TextAlign.Center,
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = stringResource(R.string.memory_consent_off_body),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        Spacer(modifier = Modifier.height(24.dp))
        SecondaryButton(
            text = stringResource(R.string.memory_consent_off_cta),
            onClick = onReviewConsents,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
private fun SuggestedFactCard(
    fact: MemoryFactDto,
    busy: Boolean,
    onKeep: () -> Unit,
    onReject: () -> Unit,
) {
    AzfCard(modifier = Modifier.fillMaxWidth()) {
        Text(
            text = fact.text,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface,
        )
        Spacer(modifier = Modifier.height(8.dp))
        FactMeta(fact)
        Spacer(modifier = Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            SecondaryButton(
                text = stringResource(R.string.memory_not_right),
                onClick = onReject,
                enabled = !busy,
                modifier = Modifier.weight(1f),
            )
            PrimaryButton(
                text = stringResource(R.string.memory_keep),
                onClick = onKeep,
                enabled = !busy,
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun ConfirmedFactCard(
    fact: MemoryFactDto,
    editing: Boolean,
    editingText: String,
    busy: Boolean,
    onStartEdit: () -> Unit,
    onEditChange: (String) -> Unit,
    onCancelEdit: () -> Unit,
    onSaveEdit: () -> Unit,
    onDelete: () -> Unit,
) {
    AzfCard(modifier = Modifier.fillMaxWidth()) {
        if (editing) {
            AzfTextField(
                value = editingText,
                onValueChange = onEditChange,
                label = stringResource(R.string.memory_edit_label),
                singleLine = false,
            )
            Spacer(modifier = Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                SecondaryButton(
                    text = stringResource(R.string.memory_cancel),
                    onClick = onCancelEdit,
                    modifier = Modifier.weight(1f),
                )
                PrimaryButton(
                    text = stringResource(R.string.memory_save),
                    onClick = onSaveEdit,
                    enabled = editingText.isNotBlank(),
                    modifier = Modifier.weight(1f),
                )
            }
            return@AzfCard
        }
        Text(
            text = fact.text,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface,
        )
        Spacer(modifier = Modifier.height(8.dp))
        FactMeta(fact)
        Spacer(modifier = Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            IconTextButton(
                icon = Icons.Outlined.Edit,
                label = stringResource(R.string.memory_edit),
                tint = AzfColors.PrimaryFixedDim,
                enabled = !busy,
                onClick = onStartEdit,
            )
            IconTextButton(
                icon = Icons.Outlined.Delete,
                label = stringResource(R.string.memory_delete),
                tint = AzfColors.Coral,
                enabled = !busy,
                onClick = onDelete,
            )
        }
    }
}

@Composable
private fun RejectedFactCard(
    fact: MemoryFactDto,
    busy: Boolean,
    onRestore: () -> Unit,
    onDelete: () -> Unit,
) {
    AzfCard(modifier = Modifier.fillMaxWidth()) {
        Text(
            text = fact.text,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textDecoration = TextDecoration.LineThrough,
        )
        Spacer(modifier = Modifier.height(8.dp))
        FactMeta(fact)
        Spacer(modifier = Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            IconTextButton(
                icon = Icons.AutoMirrored.Outlined.Undo,
                label = stringResource(R.string.memory_restore),
                tint = AzfColors.PrimaryFixedDim,
                enabled = !busy,
                onClick = onRestore,
            )
            IconTextButton(
                icon = Icons.Outlined.Delete,
                label = stringResource(R.string.memory_delete),
                tint = AzfColors.Coral,
                enabled = !busy,
                onClick = onDelete,
            )
        }
    }
}

@Composable
private fun FactMeta(fact: MemoryFactDto) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(
            text = stringResource(categoryLabel(fact.category)).uppercase(),
            style = MaterialTheme.typography.labelSmall,
            color = AzfColors.SecondaryFixedDim,
        )
        Spacer(modifier = Modifier.size(8.dp))
        Text(
            text = stringResource(sourceLabel(fact.source.kind)),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun IconTextButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    tint: androidx.compose.ui.graphics.Color,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    TextButton(onClick = onClick, enabled = enabled) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = tint,
            modifier = Modifier.size(18.dp),
        )
        Spacer(modifier = Modifier.size(6.dp))
        Text(text = label, color = tint, style = MaterialTheme.typography.labelLarge)
    }
}

@Composable
private fun AddFactCard(state: MemoryUiState, viewModel: MemoryViewModel) {
    AzfCard(modifier = Modifier.fillMaxWidth()) {
        Text(
            text = stringResource(R.string.memory_add_heading).uppercase(),
            style = MaterialTheme.typography.labelMedium,
            color = AzfColors.SecondaryFixedDim,
        )
        Spacer(modifier = Modifier.height(12.dp))
        AzfTextField(
            value = state.draftText,
            onValueChange = viewModel::onDraftTextChange,
            label = stringResource(R.string.memory_add_label),
            singleLine = false,
        )
        Spacer(modifier = Modifier.height(12.dp))
        Text(
            text = stringResource(R.string.memory_category_label),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(modifier = Modifier.height(8.dp))
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            MemoryFactCategory.entries.forEach { category ->
                AzfChip(
                    text = stringResource(categoryLabel(category)),
                    selected = state.draftCategory == category,
                    onClick = { viewModel.onDraftCategoryChange(category) },
                )
            }
        }
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = stringResource(categoryHint(state.draftCategory)),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(modifier = Modifier.height(16.dp))
        PrimaryButton(
            text = stringResource(R.string.memory_add_cta),
            onClick = viewModel::addFact,
            enabled = state.canAdd,
            loading = state.adding,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

private fun categoryLabel(category: MemoryFactCategory): Int = when (category) {
    MemoryFactCategory.PREFERENCE -> R.string.memory_category_preference
    MemoryFactCategory.CONSTRAINT -> R.string.memory_category_constraint
    MemoryFactCategory.GOAL -> R.string.memory_category_goal
    MemoryFactCategory.MILESTONE -> R.string.memory_category_milestone
    MemoryFactCategory.CONTEXT -> R.string.memory_category_context
}

private fun categoryHint(category: MemoryFactCategory): Int = when (category) {
    MemoryFactCategory.PREFERENCE -> R.string.memory_category_preference_hint
    MemoryFactCategory.CONSTRAINT -> R.string.memory_category_constraint_hint
    MemoryFactCategory.GOAL -> R.string.memory_category_goal_hint
    MemoryFactCategory.MILESTONE -> R.string.memory_category_milestone_hint
    MemoryFactCategory.CONTEXT -> R.string.memory_category_context_hint
}

/** Where a fact came from; unknown kinds still render, never blank. */
private fun sourceLabel(kind: String): Int = when (kind) {
    "chat" -> R.string.memory_source_chat
    "log" -> R.string.memory_source_log
    "profile" -> R.string.memory_source_profile
    "user" -> R.string.memory_source_user
    else -> R.string.memory_source_unknown
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416, heightDp = 700)
@Composable
private fun MemoryPreview() {
    AzfTheme {
        Column(
            modifier = Modifier.padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            SuggestedFactCard(
                fact = MemoryFactDto(
                    id = "f1",
                    text = "Trains before work on weekdays",
                    category = MemoryFactCategory.CONTEXT,
                    status = MemoryFactStatus.SUGGESTED,
                ),
                busy = false,
                onKeep = {},
                onReject = {},
            )
            ConsentOffState(onReviewConsents = {})
        }
    }
}
