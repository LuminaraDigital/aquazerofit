package fit.aquazero.app.feature.nutrition

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
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddAPhoto
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.FloatingActionButton
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
import fit.aquazero.app.core.database.MealLogEntity
import fit.aquazero.app.core.designsystem.AzfAppHeader
import fit.aquazero.app.core.designsystem.AzfCard
import fit.aquazero.app.core.designsystem.AzfColors
import fit.aquazero.app.core.designsystem.AzfSpacing
import fit.aquazero.app.core.designsystem.AzfTheme
import fit.aquazero.app.core.designsystem.DataSmall
import fit.aquazero.app.core.designsystem.RingProgress

@Composable
fun NutritionScreen(
    onNavigateToCapture: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: NutritionViewModel = hiltViewModel(),
) {
    val meals by viewModel.mealLogs.collectAsState()
    val dailyNutrition by viewModel.dailyNutrition.collectAsState()
    val selectedDate by viewModel.selectedDate.collectAsState()

    NutritionContent(
        meals = meals,
        dailyNutrition = dailyNutrition,
        selectedDate = selectedDate,
        onNavigateToCapture = onNavigateToCapture,
        onDeleteMeal = viewModel::deleteMeal,
        modifier = modifier
    )
}

@Composable
fun NutritionContent(
    meals: List<MealLogEntity>,
    dailyNutrition: LocalDailyNutrition?,
    selectedDate: String,
    onNavigateToCapture: () -> Unit,
    onDeleteMeal: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Scaffold(
        modifier = modifier.fillMaxSize(),
        topBar = {
            AzfAppHeader(
                title = stringResource(R.string.screen_nutrition).uppercase(),
                onBack = null
            )
        },
        floatingActionButton = {
            FloatingActionButton(
                onClick = onNavigateToCapture,
                containerColor = AzfColors.PrimaryFixedDim,
                contentColor = AzfColors.Background
            ) {
                Icon(Icons.Default.AddAPhoto, contentDescription = "Capture meal")
            }
        }
    ) { innerPadding ->
        LazyColumn(
            modifier = Modifier
                .padding(innerPadding)
                .fillMaxSize(),
            contentPadding = PaddingValues(AzfSpacing.ContainerPadding)
        ) {
            item {
                dailyNutrition?.let { data ->
                    AzfCard(modifier = Modifier.fillMaxWidth()) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceEvenly
                        ) {
                            NutrientRing(
                                label = "KCAL",
                                consumed = data.kcalConsumed,
                                target = data.kcalTarget,
                                color = AzfColors.PrimaryFixedDim
                            )
                            NutrientRing(
                                label = "PRO",
                                consumed = data.proteinConsumed,
                                target = data.proteinTarget,
                                color = AzfColors.SecondaryFixedDim
                            )
                            NutrientRing(
                                label = "CARB",
                                consumed = data.carbsConsumed,
                                target = data.carbsTarget,
                                color = AzfColors.PrimaryFixedDim
                            )
                            NutrientRing(
                                label = "FAT",
                                consumed = data.fatConsumed,
                                target = data.fatTarget,
                                color = AzfColors.Coral
                            )
                        }
                    }
                }
                Spacer(modifier = Modifier.height(24.dp))
                Text(
                    text = "TODAY'S LOGS",
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(modifier = Modifier.height(12.dp))
            }

            if (meals.isEmpty()) {
                item {
                    Text(
                        text = "No meals logged yet.",
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(vertical = 32.dp)
                    )
                }
            } else {
                items(meals, key = { it.localId }) { meal ->
                    MealItem(
                        meal = meal,
                        onDelete = { onDeleteMeal(meal.localId) }
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                }
            }
        }
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416)
@Composable
private fun NutritionPreview() {
    AzfTheme {
        NutritionContent(
            meals = listOf(
                MealLogEntity(
                    localId = "1",
                    mealType = "breakfast",
                    items = emptyList(),
                    totalKcal = 450.0,
                    totalProteinG = 24.0,
                    totalCarbsG = 45.0,
                    totalFatG = 12.0,
                    source = "manual",
                    loggedAt = "",
                    localDate = "2026-08-27",
                    syncState = fit.aquazero.app.core.database.SyncState.SYNCED,
                    idempotencyKey = ""
                ),
                MealLogEntity(
                    localId = "2",
                    mealType = "lunch",
                    items = emptyList(),
                    totalKcal = 650.0,
                    totalProteinG = 38.0,
                    totalCarbsG = 62.0,
                    totalFatG = 18.0,
                    source = "manual",
                    loggedAt = "",
                    localDate = "2026-08-27",
                    syncState = fit.aquazero.app.core.database.SyncState.SYNCED,
                    idempotencyKey = ""
                )
            ),
            dailyNutrition = LocalDailyNutrition(
                kcalTarget = 2400.0,
                kcalConsumed = 1100.0,
                kcalRemaining = 1300.0,
                proteinConsumed = 62.0,
                proteinTarget = 140.0,
                carbsConsumed = 107.0,
                carbsTarget = 220.0,
                fatConsumed = 30.0,
                fatTarget = 70.0,
                waterConsumedMl = 1250,
                waterTargetMl = 2000,
            ),
            selectedDate = "2026-08-27",
            onNavigateToCapture = {},
            onDeleteMeal = {}
        )
    }
}


@Composable
private fun NutrientRing(
    label: String,
    consumed: Double,
    target: Double,
    color: androidx.compose.ui.graphics.Color
) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        RingProgress(
            progress = if (target > 0) (consumed / target).toFloat() else 0f,
            size = 60.dp,
            strokeWidth = 5.dp,
            color = color
        ) {
            Text(
                text = consumed.toInt().toString(),
                style = DataSmall,
                color = MaterialTheme.colorScheme.onSurface
            )
        }
        Spacer(modifier = Modifier.height(4.dp))
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
private fun MealItem(
    meal: MealLogEntity,
    onDelete: () -> Unit
) {
    AzfCard(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = meal.mealType.uppercase(),
                    style = MaterialTheme.typography.labelMedium,
                    color = AzfColors.SecondaryFixedDim
                )
                Text(
                    text = "${meal.totalKcal.toInt()} kcal",
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurface
                )
                Text(
                    text = "P: ${meal.totalProteinG.toInt()}g  C: ${meal.totalCarbsG.toInt()}g  F: ${meal.totalFatG.toInt()}g",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            IconButton(onClick = onDelete) {
                Icon(
                    imageVector = Icons.Default.Delete,
                    contentDescription = "Delete meal",
                    tint = MaterialTheme.colorScheme.error.copy(alpha = 0.6f)
                )
            }
        }
    }
}
