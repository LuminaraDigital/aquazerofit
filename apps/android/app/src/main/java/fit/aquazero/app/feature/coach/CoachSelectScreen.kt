package fit.aquazero.app.feature.coach

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import fit.aquazero.app.R
import fit.aquazero.app.core.designsystem.AzfAppHeader
import fit.aquazero.app.core.designsystem.AzfCard
import fit.aquazero.app.core.designsystem.AzfShapes
import fit.aquazero.app.core.designsystem.AzfSpacing
import fit.aquazero.app.core.designsystem.AzfTheme
import fit.aquazero.app.core.designsystem.ErrorState
import fit.aquazero.app.core.designsystem.PrimaryButton
import fit.aquazero.app.core.designsystem.Skeleton
import fit.aquazero.app.core.designsystem.ToastKind
import fit.aquazero.app.core.designsystem.pressScale
import fit.aquazero.app.core.model.CoachRankDto
import fit.aquazero.app.core.model.ExperienceStatusDto
import fit.aquazero.app.feature.dashboard.rememberToastSink
import fit.aquazero.app.feature.gamification.XpPanel

/**
 * Character select: nine fighters, one door.
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

        LazyVerticalGrid(
            columns = GridCells.Fixed(2),
            modifier = Modifier
                .padding(innerPadding)
                .fillMaxSize(),
            contentPadding = PaddingValues(AzfSpacing.ContainerMargin),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item(span = { GridItemSpan(2) }) {
                Column {
                    Text(
                        text = stringResource(R.string.coach_select_sub),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(14.dp))
                    AzfCard(modifier = Modifier.fillMaxWidth()) {
                        if (state.experience == null) {
                            Skeleton(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(58.dp),
                            )
                        } else {
                            XpPanel(experience = state.experience)
                        }
                        Text(
                            text = stringResource(R.string.coach_select_xp_note),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = 10.dp),
                        )
                    }
                    Spacer(Modifier.height(6.dp))
                }
            }

            if (state.loading && state.cards.isEmpty()) {
                items(count = 4) {
                    Skeleton(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(250.dp),
                        shape = AzfShapes.Card,
                    )
                }
            }

            items(items = state.cards, key = { it.persona.id }) { card ->
                CoachTile(
                    card = card,
                    switching = state.switchingCoachId == card.persona.id,
                    onSelect = { onSelect(card) },
                )
            }

            item(span = { GridItemSpan(2) }) {
                Text(
                    text = stringResource(R.string.coach_select_footer),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 12.dp, bottom = 24.dp),
                )
            }
        }
    }
}

@Composable
private fun CoachTile(
    card: CoachCard,
    switching: Boolean,
    onSelect: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val persona = card.persona
    val interaction = remember { MutableInteractionSource() }
    val requirement = stringResource(R.string.coach_unlock_label, card.requiredLevel)
    val description = if (card.unlocked) {
        stringResource(R.string.coach_unlocked_cd, persona.name)
    } else {
        stringResource(R.string.coach_locked_cd, persona.name, requirement)
    }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .pressScale(interaction)
            .clip(AzfShapes.Card)
            .background(MaterialTheme.colorScheme.surfaceContainerLow)
            .border(
                BorderStroke(
                    1.dp,
                    if (card.active) {
                        persona.colour
                    } else {
                        MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f)
                    },
                ),
                AzfShapes.Card,
            )
            .clickable(interactionSource = interaction, indication = null, onClick = onSelect)
            .semantics { contentDescription = description },
    ) {
        Box(modifier = Modifier.fillMaxWidth()) {
            CoachPortrait(
                persona = persona,
                shape = AzfShapes.Card,
                dimmed = !card.unlocked,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(158.dp),
            )
            if (card.active) {
                Text(
                    text = stringResource(R.string.coach_select_active).uppercase(),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.surface,
                    modifier = Modifier
                        .padding(8.dp)
                        .clip(AzfShapes.Pill)
                        .background(persona.colour)
                        .padding(horizontal = 8.dp, vertical = 3.dp),
                )
            }
            if (!card.unlocked) {
                Icon(
                    imageVector = Icons.Outlined.Lock,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(8.dp)
                        .size(18.dp),
                )
            }
        }

        Column(modifier = Modifier.padding(12.dp)) {
            Text(
                text = persona.name,
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = "${persona.ringName} · ${stringResource(persona.voiceWordRes)}".uppercase(),
                style = MaterialTheme.typography.labelSmall,
                color = persona.colour,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(top = 2.dp),
            )
            Text(
                text = stringResource(persona.domainRes),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(top = 6.dp),
            )

            if (card.unlocked && card.bondXp > 0) {
                Text(
                    text = stringResource(
                        R.string.coach_bond,
                        card.bondLevel,
                        card.bondXp.toString(),
                    ),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 6.dp),
                )
            }

            Spacer(Modifier.height(10.dp))

            if (card.unlocked) {
                PrimaryButton(
                    text = when {
                        switching -> stringResource(R.string.coach_select_switching)
                        card.active -> stringResource(R.string.coach_select_open)
                        else -> stringResource(R.string.coach_select_choose)
                    },
                    onClick = onSelect,
                    enabled = !switching,
                )
            } else {
                // The requirement, and nothing else. No price, no shortcut.
                Text(
                    text = requirement,
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth(),
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
