package fit.aquazero.app.feature.coach

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Lock
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
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import fit.aquazero.app.R
import fit.aquazero.app.core.designsystem.ActiveFrame
import fit.aquazero.app.core.designsystem.AzfAppHeader
import fit.aquazero.app.core.designsystem.AzfCard
import fit.aquazero.app.core.designsystem.AzfShapes
import fit.aquazero.app.core.designsystem.AzfSpacing
import fit.aquazero.app.core.designsystem.AzfTheme
import fit.aquazero.app.core.designsystem.ErrorState
import fit.aquazero.app.core.designsystem.LocalAzfExtended
import fit.aquazero.app.core.designsystem.Skeleton
import fit.aquazero.app.core.designsystem.StatLabel
import fit.aquazero.app.core.designsystem.ToastKind
import fit.aquazero.app.core.designsystem.pressScale
import fit.aquazero.app.core.gamification.XpPanel
import fit.aquazero.app.core.model.CoachRankDto
import fit.aquazero.app.core.model.ExperienceStatusDto
import fit.aquazero.app.core.ui.CoachAvatar
import fit.aquazero.app.core.ui.CoachRoster
import fit.aquazero.app.core.ui.rememberToastSink

/**
 * Character select: the bout sheet, nine fighters, one door.
 *
 * Locked coaches are drawn, dimmed, with the requirement under them. There is
 * no price, no "unlock now", and no second currency anywhere on this screen —
 * the level is the whole mechanism, and the copy at the foot of the list says
 * the thing that actually matters: the coach changes the tone, never the
 * advice.
 */
@Composable
fun CoachSelectScreen(
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: CoachSelectViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val toasts = rememberToastSink()
    val resources = LocalResources.current

    val switchFailed = stringResource(R.string.coach_select_failed)

    LaunchedEffect(viewModel) {
        viewModel.events.collect { event ->
            when (event) {
                is CoachSelectEvent.Switched -> onBack()
                CoachSelectEvent.OpenChat -> onBack()
                CoachSelectEvent.SwitchFailed -> toasts.show(switchFailed, ToastKind.Error)
                is CoachSelectEvent.StillLocked -> toasts.show(
                    resources.getString(
                        R.string.coach_locked_toast,
                        event.coachName,
                        event.level,
                    ),
                    ToastKind.Info,
                )
            }
        }
    }

    CoachSelectContent(
        state = state,
        onBack = onBack,
        onSelect = viewModel::select,
        onRetry = viewModel::refresh,
        modifier = modifier,
    )
}

@Composable
fun CoachSelectContent(
    state: CoachSelectUiState,
    onBack: () -> Unit,
    onSelect: (CoachCard) -> Unit,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Scaffold(
        modifier = modifier.fillMaxSize(),
        topBar = {
            AzfAppHeader(
                title = stringResource(R.string.coach_select_heading),
                onBack = onBack,
            )
        },
    ) { innerPadding ->
        if (state.rosterFailed && state.cards.isEmpty()) {
            ErrorState(
                title = stringResource(R.string.coach_select_roster_failed),
                message = stringResource(R.string.coach_select_roster_failed_body),
                retryLabel = stringResource(R.string.action_retry),
                onRetry = onRetry,
                modifier = Modifier.padding(innerPadding),
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
                top = 8.dp,
                bottom = AzfSpacing.SectionGap,
            ),
            verticalArrangement = Arrangement.spacedBy(AzfSpacing.Gutter),
        ) {
            item {
                Column {
                    Text(
                        text = stringResource(R.string.coach_select_sub),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(16.dp))
                    AzfCard(modifier = Modifier.fillMaxWidth()) {
                        if (state.experience == null) {
                            Skeleton(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(56.dp),
                            )
                        } else {
                            XpPanel(experience = state.experience)
                        }
                        Text(
                            text = stringResource(R.string.coach_select_xp_note),
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = 12.dp),
                        )
                    }
                }
            }

            if (state.loading && state.cards.isEmpty()) {
                items(count = 4) {
                    Skeleton(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(88.dp),
                        shape = AzfShapes.Card,
                    )
                }
            }

            items(items = state.cards, key = { it.persona.id }) { card ->
                CoachBout(
                    card = card,
                    switching = state.switchingCoachId == card.persona.id,
                    onSelect = { onSelect(card) },
                )
            }

            item {
                Text(
                    text = stringResource(R.string.coach_select_footer),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 12.dp),
                )
            }
        }
    }
}

/**
 * One line of the bout sheet: avatar, ring name, then "real name - status" as
 * a stat label. A locked coach is dimmed *and* carries a lock and its unlock
 * level in words, so the state never rests on colour or opacity alone.
 */
@Composable
private fun CoachBout(
    card: CoachCard,
    switching: Boolean,
    onSelect: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val persona = card.persona
    val interaction = remember { MutableInteractionSource() }
    val requirement = stringResource(R.string.coach_unlock_label, card.requiredLevel)
    val status = when {
        !card.unlocked -> requirement
        persona.isFree -> stringResource(R.string.coach_status_free)
        else -> stringResource(R.string.coach_status_unlocked)
    }
    val description = if (card.unlocked) {
        stringResource(R.string.coach_unlocked_cd, persona.name)
    } else {
        stringResource(R.string.coach_locked_cd, persona.name, requirement)
    }
    val dim = if (card.unlocked) 1f else 0.5f

    ActiveFrame(
        active = card.active,
        shape = AzfShapes.Card,
        modifier = modifier
            .fillMaxWidth()
            .pressScale(interaction)
            .clip(AzfShapes.Card)
            .background(MaterialTheme.colorScheme.surfaceContainerLow),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 88.dp)
                .clickable(
                    interactionSource = interaction,
                    indication = null,
                    role = Role.Button,
                    onClick = onSelect,
                )
                .semantics(mergeDescendants = true) { contentDescription = description }
                .padding(AzfSpacing.CardPadding),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            CoachAvatar(
                persona = persona,
                size = 56.dp,
                modifier = Modifier.alpha(dim),
            )
            Column(
                modifier = Modifier
                    .weight(1f)
                    .padding(horizontal = AzfSpacing.Gutter),
            ) {
                Text(
                    text = persona.ringName.uppercase(),
                    style = MaterialTheme.typography.headlineSmall,
                    color = if (card.unlocked) {
                        MaterialTheme.colorScheme.onSurface
                    } else {
                        MaterialTheme.colorScheme.onSurfaceVariant
                    },
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = "${persona.name} · $status".uppercase(),
                    style = StatLabel,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = stringResource(persona.domainRes),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = 4.dp),
                )
                if (card.unlocked && card.bondXp > 0) {
                    Text(
                        text = stringResource(R.string.coach_bond, card.bondLevel, card.bondXp.toString()),
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 4.dp),
                    )
                }
            }
            if (card.unlocked) {
                Text(
                    text = when {
                        switching -> stringResource(R.string.coach_select_switching)
                        card.active -> stringResource(R.string.coach_select_open)
                        else -> stringResource(R.string.coach_select_choose)
                    },
                    style = MaterialTheme.typography.labelLarge,
                    color = LocalAzfExtended.current.primaryFixedDim,
                )
            } else {
                Icon(
                    imageVector = Icons.Outlined.Lock,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(20.dp),
                )
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Previews
// ---------------------------------------------------------------------------

private fun previewCards(): List<CoachCard> = CoachRoster.personas.mapIndexed { index, persona ->
    CoachCard(
        persona = persona,
        unlocked = persona.isFree || index < 3,
        active = index == 0,
        requiredLevel = persona.unlockLevel,
        bondXp = if (index == 0) 1_320 else 0,
        bondLevel = if (index == 0) 6 else 1,
    )
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416, widthDp = 400, heightDp = 900)
@Composable
private fun CoachSelectContentPreview() {
    AzfTheme {
        CoachSelectContent(
            state = CoachSelectUiState(
                loading = false,
                cards = previewCards(),
                experience = ExperienceStatusDto(
                    totalXp = 1_240,
                    level = 6,
                    rank = CoachRankDto("prospect", "Prospect", 5),
                    levelStartXp = 1_125,
                    nextLevelXp = 1_575,
                    levelProgress = 0.26,
                    earnedToday = 85,
                ),
            ),
            onBack = {},
            onSelect = {},
            onRetry = {},
        )
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416, widthDp = 400, heightDp = 500)
@Composable
private fun CoachSelectLoadingPreview() {
    AzfTheme {
        CoachSelectContent(
            state = CoachSelectUiState(loading = true),
            onBack = {},
            onSelect = {},
            onRetry = {},
        )
    }
}
