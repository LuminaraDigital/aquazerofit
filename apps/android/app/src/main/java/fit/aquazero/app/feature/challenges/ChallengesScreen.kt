package fit.aquazero.app.feature.challenges

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
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
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.Group
import androidx.compose.material.icons.outlined.Share
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import fit.aquazero.app.R
import fit.aquazero.app.core.data.ChallengesRepository
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
import fit.aquazero.app.core.designsystem.MacroBar
import fit.aquazero.app.core.designsystem.PrimaryButton
import fit.aquazero.app.core.designsystem.SecondaryButton
import fit.aquazero.app.core.designsystem.Skeleton
import fit.aquazero.app.core.designsystem.ToastKind
import fit.aquazero.app.core.model.BuddyChallengeDto
import fit.aquazero.app.core.model.BuddyChallengeKind
import fit.aquazero.app.core.model.BuddyChallengeMemberDto
import fit.aquazero.app.core.model.BuddyChallengeStatus
import fit.aquazero.app.core.ui.rememberToastSink

/**
 * Buddy huddles.
 *
 * Private accountability with up to four people, reached only by an invite
 * code. Everything about the framing is additive: progress is "show-up days",
 * a member's row shows days accumulated out of the target, and a huddle that
 * runs out of time is "finished" rather than failed.
 */
@Composable
fun ChallengesScreen(
    onBack: () -> Unit,
    initialJoinCode: String? = null,
    modifier: Modifier = Modifier,
    viewModel: ChallengesViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val resources = LocalResources.current
    val toasts = rememberToastSink()
    val copied = stringResource(R.string.challenges_code_copied)

    LaunchedEffect(initialJoinCode) {
        if (!initialJoinCode.isNullOrBlank()) {
            viewModel.prefillJoinCode(initialJoinCode)
        }
    }

    LaunchedEffect(viewModel) {
        viewModel.events.collect { event ->
            when (event) {
                is ChallengesEvent.Message -> toasts.show(
                    resources.getString(event.messageRes),
                    if (event.isError) ToastKind.Error else ToastKind.Success,
                )
                is ChallengesEvent.MessageWithArg -> toasts.show(
                    resources.getString(event.messageRes, event.arg),
                    ToastKind.Success,
                )
                is ChallengesEvent.ShareInvite -> context.shareInvite(event.code)
                is ChallengesEvent.CopyCode -> {
                    context.copyToClipboard(event.code)
                    toasts.show(copied, ToastKind.Success)
                }
            }
        }
    }

    Scaffold(
        modifier = modifier.fillMaxSize(),
        topBar = {
            AzfAppHeader(title = stringResource(R.string.challenges_title), onBack = onBack)
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
            item {
                AzfCard(modifier = Modifier.fillMaxWidth()) {
                    Row(verticalAlignment = Alignment.Top) {
                        Icon(
                            imageVector = Icons.Outlined.Group,
                            contentDescription = null,
                            tint = AzfColors.PrimaryFixedDim,
                            modifier = Modifier.size(24.dp),
                        )
                        Spacer(modifier = Modifier.size(12.dp))
                        Text(
                            text = stringResource(R.string.challenges_intro),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }

            item { CreateCard(state = state, viewModel = viewModel) }

            item { JoinCard(state = state, viewModel = viewModel) }

            item { AzfSectionHeading(stringResource(R.string.challenges_yours_heading)) }

            when {
                state.loading -> item {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Skeleton(modifier = Modifier.fillMaxWidth().height(112.dp))
                        Skeleton(modifier = Modifier.fillMaxWidth().height(112.dp))
                    }
                }
                state.loadFailed -> item {
                    ErrorState(
                        title = stringResource(R.string.challenges_title),
                        message = stringResource(R.string.challenges_error),
                        retryLabel = stringResource(R.string.challenges_retry),
                        onRetry = viewModel::load,
                    )
                }
                state.isEmpty -> item {
                    EmptyState(
                        title = stringResource(R.string.challenges_empty_title),
                        message = stringResource(R.string.challenges_empty_body),
                        icon = Icons.Outlined.Group,
                    )
                }
                else -> items(state.challenges, key = { it.id }) { challenge ->
                    ChallengeCard(
                        challenge = challenge,
                        onShare = { viewModel.shareInvite(challenge) },
                        onCopy = { viewModel.copyCode(challenge) },
                    )
                }
            }
        }
    }
}

@Composable
private fun CreateCard(state: ChallengesUiState, viewModel: ChallengesViewModel) {
    AzfCard(modifier = Modifier.fillMaxWidth()) {
        Text(
            text = stringResource(R.string.challenges_create_heading).uppercase(),
            style = MaterialTheme.typography.labelMedium,
            color = AzfColors.SecondaryFixedDim,
        )
        Spacer(modifier = Modifier.height(12.dp))
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            BuddyChallengeKind.entries.forEach { kind ->
                AzfChip(
                    text = stringResource(kindLabel(kind)),
                    selected = state.kind == kind,
                    onClick = { viewModel.setKind(kind) },
                )
            }
        }
        Spacer(modifier = Modifier.height(16.dp))
        PrimaryButton(
            text = stringResource(
                R.string.challenges_create_cta,
                ChallengesRepository.DEFAULT_DURATION_DAYS,
            ),
            onClick = viewModel::create,
            loading = state.creating,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = stringResource(
                R.string.challenges_create_note,
                ChallengesRepository.MAX_MEMBERS,
            ),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun JoinCard(state: ChallengesUiState, viewModel: ChallengesViewModel) {
    AzfCard(modifier = Modifier.fillMaxWidth()) {
        Text(
            text = stringResource(R.string.challenges_join_heading).uppercase(),
            style = MaterialTheme.typography.labelMedium,
            color = AzfColors.SecondaryFixedDim,
        )
        Spacer(modifier = Modifier.height(12.dp))
        AzfTextField(
            value = state.joinCode,
            onValueChange = viewModel::onJoinCodeChange,
            label = stringResource(R.string.challenges_join_label),
            enabled = !state.joining,
            keyboardOptions = KeyboardOptions(
                capitalization = KeyboardCapitalization.Characters,
            ),
        )
        Spacer(modifier = Modifier.height(12.dp))
        SecondaryButton(
            text = stringResource(R.string.challenges_join_cta),
            onClick = viewModel::join,
            enabled = state.canJoin,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
private fun ChallengeCard(
    challenge: BuddyChallengeDto,
    onShare: () -> Unit,
    onCopy: () -> Unit,
) {
    AzfCard(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.Top,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = stringResource(kindLabel(challenge.kind)).uppercase(),
                    style = MaterialTheme.typography.labelSmall,
                    color = AzfColors.PrimaryFixedDim,
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = challenge.code,
                    style = MaterialTheme.typography.titleMedium.copy(
                        fontFamily = FontFamily.Monospace,
                    ),
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }
            Text(
                text = stringResource(statusLabel(challenge.status)),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = stringResource(
                R.string.challenges_target,
                challenge.targetDays,
                challenge.endsAt,
            ),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(modifier = Modifier.height(4.dp))
        Text(
            text = stringResource(
                R.string.challenges_members,
                challenge.members.size,
                ChallengesRepository.MAX_MEMBERS,
            ),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(modifier = Modifier.height(12.dp))
        challenge.members.forEach { member ->
            MemberRow(member = member, targetDays = challenge.targetDays)
        }
        Spacer(modifier = Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            TextButton(onClick = onCopy) {
                Icon(
                    imageVector = Icons.Outlined.ContentCopy,
                    contentDescription = null,
                    modifier = Modifier.size(18.dp),
                )
                Spacer(modifier = Modifier.size(6.dp))
                Text(text = stringResource(R.string.challenges_copy_code))
            }
            TextButton(onClick = onShare) {
                Icon(
                    imageVector = Icons.Outlined.Share,
                    contentDescription = null,
                    modifier = Modifier.size(18.dp),
                )
                Spacer(modifier = Modifier.size(6.dp))
                Text(text = stringResource(R.string.challenges_share_code))
            }
        }
    }
}

@Composable
private fun MemberRow(member: BuddyChallengeMemberDto, targetDays: Int) {
    Column(modifier = Modifier.padding(bottom = 10.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                text = member.displayName,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Text(
                text = stringResource(
                    R.string.challenges_progress,
                    member.progressDays,
                    targetDays,
                ),
                style = MaterialTheme.typography.bodySmall,
                color = AzfColors.PrimaryFixedDim,
            )
        }
        Spacer(modifier = Modifier.height(6.dp))
        MacroBar(
            label = member.displayName,
            consumed = member.progressDays.toDouble(),
            target = targetDays.coerceAtLeast(1).toDouble(),
            color = AzfColors.SecondaryFixedDim,
            unit = "",
        )
    }
}

// ---------------------------------------------------------------------------
// Labels and platform glue
// ---------------------------------------------------------------------------

private fun kindLabel(kind: BuddyChallengeKind): Int = when (kind) {
    BuddyChallengeKind.LOGGING_STREAK -> R.string.challenges_kind_logging
    BuddyChallengeKind.WORKOUTS -> R.string.challenges_kind_workouts
    BuddyChallengeKind.MEAL_LOGS -> R.string.challenges_kind_meals
}

private fun statusLabel(status: BuddyChallengeStatus): Int = when (status) {
    BuddyChallengeStatus.OPEN -> R.string.challenges_status_open
    BuddyChallengeStatus.ACTIVE -> R.string.challenges_status_active
    BuddyChallengeStatus.COMPLETED -> R.string.challenges_status_completed
    BuddyChallengeStatus.EXPIRED -> R.string.challenges_status_expired
}

/** Share an invite as plain text with deep link URL and code. */
private fun Context.shareInvite(code: String) {
    val url = fit.aquazero.app.core.navigation.DeepLinkStore.joinChallengeUrl(code)
    val text = getString(R.string.challenges_share_text, url, code)
    val intent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_TEXT, text)
    }
    runCatching {
        startActivity(
            Intent.createChooser(intent, getString(R.string.challenges_share_code))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    }
}

private fun Context.copyToClipboard(code: String) {
    val manager = getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager ?: return
    manager.setPrimaryClip(ClipData.newPlainText(getString(R.string.challenges_join_label), code))
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416, heightDp = 800)
@Composable
private fun ChallengesPreview() {
    AzfTheme {
        Column(
            modifier = Modifier.padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            ChallengeCard(
                challenge = BuddyChallengeDto(
                    id = "c1",
                    code = "AQUA-7K3M2P",
                    kind = BuddyChallengeKind.LOGGING_STREAK,
                    targetDays = 7,
                    durationDays = 14,
                    status = BuddyChallengeStatus.ACTIVE,
                    members = listOf(
                        BuddyChallengeMemberDto(userId = "u1", displayName = "You", progressDays = 4),
                        BuddyChallengeMemberDto(userId = "u2", displayName = "Sam", progressDays = 6),
                    ),
                    endsAt = "2026-09-09",
                ),
                onShare = {},
                onCopy = {},
            )
        }
    }
}
