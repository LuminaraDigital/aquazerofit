package fit.aquazero.app.feature.onboarding

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Chat
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.outlined.FitnessCenter
import androidx.compose.material.icons.outlined.MonitorWeight
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import fit.aquazero.app.R
import fit.aquazero.app.core.designsystem.AzfAppHeader
import fit.aquazero.app.core.designsystem.AzfNavigationRow
import fit.aquazero.app.core.designsystem.AzfSectionHeading
import fit.aquazero.app.core.designsystem.AzfSpacing
import fit.aquazero.app.core.designsystem.AzfTheme
import fit.aquazero.app.core.designsystem.revealOnEnter
import fit.aquazero.app.core.ui.TargetsNotSetCard

/**
 * First-run home — what a signed-in account with no wellness profile sees.
 *
 * A four-step form between registration and the product is the shape of first
 * session people do not come back from. So nothing here asks for anything: the
 * three entries below all work with no profile, and the daily-targets card
 * states plainly that there is nothing to show yet rather than filling the
 * space with a made-up number.
 */
@Composable
fun FirstRunScreen(
    onSetUpTargets: () -> Unit,
    onBrowseWorkouts: () -> Unit,
    onAskCoach: () -> Unit,
    onLogWeight: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: FirstRunViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    FirstRunContent(
        firstName = state.firstName,
        onSetUpTargets = onSetUpTargets,
        onBrowseWorkouts = onBrowseWorkouts,
        onAskCoach = onAskCoach,
        onLogWeight = onLogWeight,
        modifier = modifier,
    )
}

@Composable
private fun FirstRunContent(
    firstName: String?,
    onSetUpTargets: () -> Unit,
    onBrowseWorkouts: () -> Unit,
    onAskCoach: () -> Unit,
    onLogWeight: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Scaffold(
        modifier = modifier.fillMaxSize(),
        topBar = { AzfAppHeader(title = stringResource(R.string.app_name)) },
    ) { innerPadding ->
        LazyColumn(
            modifier = Modifier
                .padding(innerPadding)
                .fillMaxSize(),
            contentPadding = PaddingValues(AzfSpacing.ContainerMargin),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Column(modifier = Modifier.revealOnEnter(0)) {
                    Text(
                        text = firstName
                            ?.let { stringResource(R.string.firstrun_greeting_named, it) }
                            ?: stringResource(R.string.firstrun_greeting),
                        style = MaterialTheme.typography.headlineLarge,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        text = stringResource(R.string.firstrun_body),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            item {
                Column(modifier = Modifier.revealOnEnter(1)) {
                    TargetsNotSetCard(onSetUp = onSetUpTargets)
                }
            }

            item {
                Column(modifier = Modifier.revealOnEnter(2)) {
                    Spacer(modifier = Modifier.height(8.dp))
                    AzfSectionHeading(text = stringResource(R.string.firstrun_start_here))
                    Spacer(modifier = Modifier.height(12.dp))
                    AzfNavigationRow(
                        title = stringResource(R.string.firstrun_workouts_title),
                        body = stringResource(R.string.firstrun_workouts_body),
                        onClick = onBrowseWorkouts,
                        icon = Icons.Outlined.FitnessCenter,
                        trailing = Icons.AutoMirrored.Outlined.KeyboardArrowRight,
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    AzfNavigationRow(
                        title = stringResource(R.string.firstrun_coach_title),
                        body = stringResource(R.string.firstrun_coach_body),
                        onClick = onAskCoach,
                        icon = Icons.AutoMirrored.Outlined.Chat,
                        trailing = Icons.AutoMirrored.Outlined.KeyboardArrowRight,
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    AzfNavigationRow(
                        title = stringResource(R.string.firstrun_weight_title),
                        body = stringResource(R.string.firstrun_weight_body),
                        onClick = onLogWeight,
                        icon = Icons.Outlined.MonitorWeight,
                        trailing = Icons.AutoMirrored.Outlined.KeyboardArrowRight,
                    )
                }
            }

            item {
                Spacer(modifier = Modifier.height(16.dp))
                Text(
                    text = stringResource(R.string.firstrun_disclaimer).uppercase(),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416, heightDp = 900)
@Composable
private fun FirstRunPreview() {
    AzfTheme {
        FirstRunContent(
            firstName = "Ada",
            onSetUpTargets = {},
            onBrowseWorkouts = {},
            onAskCoach = {},
            onLogWeight = {},
        )
    }
}
