package fit.aquazero.app.feature.dashboard

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
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import fit.aquazero.app.R
import fit.aquazero.app.core.common.LocalDailyNutrition
import fit.aquazero.app.core.database.UserEntity
import fit.aquazero.app.core.designsystem.AzfAppHeader
import fit.aquazero.app.core.designsystem.AzfCard
import fit.aquazero.app.core.designsystem.AzfColors
import fit.aquazero.app.core.designsystem.AzfSpacing
import fit.aquazero.app.core.designsystem.AzfTheme
import fit.aquazero.app.core.designsystem.DataLarge
import fit.aquazero.app.core.designsystem.MacroBar
import fit.aquazero.app.core.designsystem.RingProgress
import fit.aquazero.app.core.designsystem.WaterDroplets

@Composable
fun DashboardScreen(
    modifier: Modifier = Modifier,
    viewModel: DashboardViewModel = hiltViewModel(),
) {
    val dailyNutrition by viewModel.dailyNutrition.collectAsState()
    val user by viewModel.user.collectAsState()

    DashboardContent(
        dailyNutrition = dailyNutrition,
        user = user,
        onLogWater = viewModel::logWater,
        modifier = modifier
    )
}

@Composable
fun DashboardContent(
    dailyNutrition: LocalDailyNutrition?,
    user: UserEntity?,
    onLogWater: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Scaffold(
        modifier = modifier.fillMaxSize(),
        topBar = {
            AzfAppHeader(
                title = if (user != null) {
                    "HELLO, ${user.displayName?.uppercase() ?: "USER"}"
                } else {
                    stringResource(R.string.screen_dashboard).uppercase()
                },
                onBack = null
            )
        }
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .padding(innerPadding)
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(AzfSpacing.ContainerPadding)
        ) {
            dailyNutrition?.let { data ->
                // Calories Card
                AzfCard(modifier = Modifier.fillMaxWidth()) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        RingProgress(
                            progress = if (data.kcalTarget > 0) (data.kcalConsumed / data.kcalTarget).toFloat() else 0f,
                            size = 140.dp,
                            strokeWidth = 10.dp
                        ) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Text(
                                    text = data.kcalRemaining.toInt().toString(),
                                    style = DataLarge,
                                    color = MaterialTheme.colorScheme.onSurface
                                )
                                Text(
                                    text = "LEFT",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }

                        Column(
                            modifier = Modifier
                                .padding(start = 24.dp)
                                .weight(1f)
                        ) {
                            MacroBar(
                                label = "PROTEIN",
                                consumed = data.proteinConsumed,
                                target = data.proteinTarget,
                                color = AzfColors.SecondaryFixedDim
                            )
                            Spacer(modifier = Modifier.height(12.dp))
                            MacroBar(
                                label = "CARBS",
                                consumed = data.carbsConsumed,
                                target = data.carbsTarget,
                                color = AzfColors.PrimaryFixedDim
                            )
                            Spacer(modifier = Modifier.height(12.dp))
                            MacroBar(
                                label = "FAT",
                                consumed = data.fatConsumed,
                                target = data.fatTarget,
                                color = AzfColors.Coral
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                // Water Card
                AzfCard(modifier = Modifier.fillMaxWidth()) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = "HYDRATION",
                                style = MaterialTheme.typography.titleMedium,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                            Text(
                                text = "${data.waterConsumedMl} / ${data.waterTargetMl}ml",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Spacer(modifier = Modifier.height(12.dp))
                            WaterDroplets(
                                filled = data.waterConsumedMl / 250,
                                total = data.waterTargetMl / 250
                            )
                        }
                        IconButton(
                            onClick = onLogWater,
                            modifier = Modifier.size(48.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Add,
                                contentDescription = "Add water",
                                tint = AzfColors.PrimaryFixedDim
                            )
                        }
                    }
                }
            } ?: run {
                // Loading or Empty State
                Text(text = "Loading dashboard...")
            }

            Spacer(modifier = Modifier.height(32.dp))
        }
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416)
@Composable
fun DashboardPreview() {
    AzfTheme {
        DashboardContent(
            dailyNutrition = LocalDailyNutrition(
                kcalTarget = 2400.0,
                kcalConsumed = 1800.0,
                kcalRemaining = 600.0,
                proteinConsumed = 92.0,
                proteinTarget = 140.0,
                carbsConsumed = 180.0,
                carbsTarget = 220.0,
                fatConsumed = 40.0,
                fatTarget = 70.0,
                waterConsumedMl = 1250,
                waterTargetMl = 2000,
            ),
            user = UserEntity(
                id = "1",
                email = "demo@aquazero.fit",
                displayName = "Demo User",
                role = "user",
                tier = "free",
                emailVerified = true,
                hasProfile = true,
                timezone = "UTC",
                createdAt = "2026-01-01T00:00:00Z",
                updatedAtMs = 0
            ),
            onLogWater = {}
        )
    }
}

