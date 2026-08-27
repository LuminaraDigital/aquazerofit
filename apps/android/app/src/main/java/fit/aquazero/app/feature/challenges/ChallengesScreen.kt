package fit.aquazero.app.feature.challenges

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
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import fit.aquazero.app.R
import fit.aquazero.app.core.designsystem.AzfAppHeader
import fit.aquazero.app.core.designsystem.AzfCard
import fit.aquazero.app.core.designsystem.AzfColors
import fit.aquazero.app.core.designsystem.AzfSpacing
import fit.aquazero.app.core.designsystem.MacroBar
import fit.aquazero.app.core.designsystem.PrimaryButton

@Composable
fun ChallengesScreen(
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Scaffold(
        modifier = modifier.fillMaxSize(),
        topBar = {
            AzfAppHeader(title = stringResource(R.string.screen_challenges).uppercase(), onBack = onBack)
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
                        text = "COMMUNITY CHALLENGES",
                        style = MaterialTheme.typography.labelMedium,
                        color = AzfColors.SecondaryFixedDim
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "HYDRATION & STREAKS",
                        style = MaterialTheme.typography.headlineMedium,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "Compete with friends, maintain consistency, and earn bond XP for your AI coach.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                Spacer(modifier = Modifier.height(24.dp))
                Text(
                    text = "ACTIVE CHALLENGES",
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(modifier = Modifier.height(12.dp))

                AzfCard(modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp)) {
                    Column {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "7-Day Hydration Mastery",
                                style = MaterialTheme.typography.titleMedium,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                            Text(
                                text = "DAY 4 / 7",
                                style = MaterialTheme.typography.labelSmall,
                                color = AzfColors.PrimaryFixedDim
                            )
                        }
                        Spacer(modifier = Modifier.height(12.dp))
                        MacroBar(
                            label = "PROGRESS",
                            consumed = 4.0,
                            target = 7.0,
                            color = AzfColors.PrimaryFixedDim,
                            unit = " days"
                        )
                    }
                }

                AzfCard(modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp)) {
                    Column {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "30-Day Nutrition Logging",
                                style = MaterialTheme.typography.titleMedium,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                            Text(
                                text = "DAY 18 / 30",
                                style = MaterialTheme.typography.labelSmall,
                                color = AzfColors.SecondaryFixedDim
                            )
                        }
                        Spacer(modifier = Modifier.height(12.dp))
                        MacroBar(
                            label = "PROGRESS",
                            consumed = 18.0,
                            target = 30.0,
                            color = AzfColors.SecondaryFixedDim,
                            unit = " days"
                        )
                    }
                }

                Spacer(modifier = Modifier.height(24.dp))
                PrimaryButton(
                    text = "JOIN WITH CODE",
                    onClick = { /* Join code dialog */ },
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }
    }
}
