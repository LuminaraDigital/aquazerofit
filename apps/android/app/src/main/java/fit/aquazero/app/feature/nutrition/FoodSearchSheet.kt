package fit.aquazero.app.feature.nutrition

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ArrowBack
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.text.KeyboardOptions
import fit.aquazero.app.R
import fit.aquazero.app.core.designsystem.AzfShapes
import fit.aquazero.app.core.designsystem.AzfSpacing
import fit.aquazero.app.core.designsystem.AzfTextField
import fit.aquazero.app.core.designsystem.AzfTheme
import fit.aquazero.app.core.designsystem.DataSmall
import fit.aquazero.app.core.designsystem.EmptyState
import fit.aquazero.app.core.designsystem.GramsStepper
import fit.aquazero.app.core.designsystem.LocalAzfExtended
import fit.aquazero.app.core.designsystem.PrimaryButton
import fit.aquazero.app.core.designsystem.Skeleton
import fit.aquazero.app.core.designsystem.pressScale
import fit.aquazero.app.core.network.dto.FoodDto
import fit.aquazero.app.core.network.dto.FoodNutrientsDto
import fit.aquazero.app.core.network.dto.FoodServingDto
import fit.aquazero.app.core.network.dto.MealType
import fit.aquazero.app.feature.dashboard.NutritionFormat

/**
 * Bottom-sheet food search.
 *
 * Two panes: a debounced server search (with the repository's Room
 * recent/frequent fallback behind it, so a dropped connection still lists
 * foods you have logged before) and a portion pane whose kcal and macros are
 * *computed* from the food's per-100 g values — never estimated, and never
 * logged until the explicit add tap.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun FoodSearchSheet(
    state: FoodSearchUi,
    onDismiss: () -> Unit,
    onTermChange: (String) -> Unit,
    onSelectFood: (FoodDto) -> Unit,
    onClearSelection: () -> Unit,
    onGramsChange: (Int) -> Unit,
    onConfirm: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(horizontal = AzfSpacing.ContainerMargin)
                .padding(bottom = AzfSpacing.ContainerMargin),
        ) {
            Text(
                text = stringResource(
                    R.string.food_sheet_title_meal,
                    stringResource(NutritionFormat.mealLabelRes(state.mealType)),
                ).uppercase(),
                style = MaterialTheme.typography.headlineSmall,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Spacer(Modifier.height(AzfSpacing.ElementGapMedium))

            val selected = state.selected
            if (selected == null) {
                SearchPane(
                    state = state,
                    onTermChange = onTermChange,
                    onSelectFood = onSelectFood,
                )
            } else {
                PortionPane(
                    state = state,
                    food = selected,
                    onBack = onClearSelection,
                    onGramsChange = onGramsChange,
                    onConfirm = onConfirm,
                )
            }
        }
    }
}

@Composable
private fun SearchPane(
    state: FoodSearchUi,
    onTermChange: (String) -> Unit,
    onSelectFood: (FoodDto) -> Unit,
) {
    AzfTextField(
        value = state.term,
        onValueChange = onTermChange,
        label = stringResource(R.string.food_search_label),
        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
    )
    Spacer(Modifier.height(AzfSpacing.ElementGapMedium))

    val showRecents = !state.searchActive ||
        (!state.searching && state.results.isEmpty() && state.recents.isNotEmpty())

    when {
        state.searching -> Column {
            repeat(3) {
                Skeleton(
                    modifier = Modifier
                        .padding(bottom = 8.dp)
                        .fillMaxWidth()
                        .height(64.dp),
                )
            }
        }

        state.searchActive && state.results.isEmpty() && state.recents.isEmpty() -> EmptyState(
            title = stringResource(R.string.food_search_none_title),
            message = stringResource(R.string.food_search_none_body),
        )

        else -> LazyColumn(
            modifier = Modifier.heightIn(max = 380.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (showRecents) {
                item(key = "recents-header") {
                    Column {
                        Text(
                            text = stringResource(R.string.food_recent_title).uppercase(),
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        if (state.searchActive) {
                            Text(
                                text = stringResource(R.string.food_offline_note),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(top = 2.dp),
                            )
                        }
                    }
                }
                if (state.recents.isEmpty()) {
                    item(key = "recents-hint") {
                        Text(
                            text = stringResource(R.string.food_search_min),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                items(state.recents, key = { "recent-${it.id}" }) { food ->
                    FoodRow(food = food, onClick = { onSelectFood(food) })
                }
            } else {
                items(state.results, key = { it.id }) { food ->
                    FoodRow(food = food, onClick = { onSelectFood(food) })
                }
            }
        }
    }
}

@Composable
private fun PortionPane(
    state: FoodSearchUi,
    food: FoodDto,
    onBack: () -> Unit,
    onGramsChange: (Int) -> Unit,
    onConfirm: () -> Unit,
) {
    val preview = state.preview
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .clip(AzfShapes.Pill)
            .clickable(onClick = onBack)
            .padding(vertical = 6.dp, horizontal = 4.dp),
    ) {
        Icon(
            imageVector = Icons.Outlined.ArrowBack,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.height(18.dp),
        )
        Text(
            text = stringResource(R.string.food_back_to_search),
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.primary,
            modifier = Modifier.padding(start = 6.dp),
        )
    }

    Spacer(Modifier.height(8.dp))
    Text(
        text = food.name,
        style = MaterialTheme.typography.titleMedium,
        color = MaterialTheme.colorScheme.onSurface,
    )
    Text(
        text = stringResource(
            R.string.food_per_100g,
            NutritionFormat.fmtInt(food.per100g.kcal),
            NutritionFormat.fmt1(food.per100g.proteinG),
            NutritionFormat.fmt1(food.per100g.carbsG),
            NutritionFormat.fmt1(food.per100g.fatG),
        ),
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(top = 2.dp),
    )

    AllergenNotice(food)

    if (food.commonServings.isNotEmpty()) {
        Spacer(Modifier.height(AzfSpacing.ElementGapMedium))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            food.commonServings.take(MAX_SERVING_CHIPS).forEach { serving ->
                ServingChip(
                    label = stringResource(
                        R.string.food_serving_label,
                        serving.label,
                        serving.grams.toInt(),
                    ),
                    selected = state.grams == serving.grams.toInt(),
                    onClick = { onGramsChange(serving.grams.toInt()) },
                )
            }
        }
    }

    Spacer(Modifier.height(AzfSpacing.ElementGapMedium))
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(
            text = stringResource(R.string.food_portion),
            style = MaterialTheme.typography.titleSmall,
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.weight(1f),
        )
        GramsStepper(grams = state.grams, onGramsChange = onGramsChange)
    }

    if (preview != null) {
        Spacer(Modifier.height(AzfSpacing.ElementGapMedium))
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(AzfShapes.Inner)
                .background(MaterialTheme.colorScheme.surfaceContainerLow)
                .padding(16.dp),
        ) {
            Row(modifier = Modifier.fillMaxWidth()) {
                Text(
                    text = stringResource(R.string.food_preview_calories),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.weight(1f),
                )
                Text(
                    text = stringResource(
                        R.string.kcal_value,
                        NutritionFormat.fmtInt(preview.kcal),
                    ),
                    style = DataSmall,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
            Text(
                text = stringResource(
                    R.string.macro_line,
                    NutritionFormat.fmt1(preview.proteinG),
                    NutritionFormat.fmt1(preview.carbsG),
                    NutritionFormat.fmt1(preview.fatG),
                ),
                style = DataSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 6.dp),
            )
        }
    }

    Spacer(Modifier.height(AzfSpacing.ElementGapMedium))
    PrimaryButton(
        text = stringResource(R.string.food_add_grams, state.grams),
        onClick = onConfirm,
        enabled = preview != null && !state.adding,
        loading = state.adding,
    )
}

/**
 * Declared allergens, rendered verbatim and in canonical order. The client
 * never infers an allergen, so this can never produce a false negative.
 */
@Composable
private fun AllergenNotice(food: FoodDto) {
    val labels = NutritionMath.allergenLabels(food)
    if (labels.isEmpty()) return
    // `map` is inline, so the composable `stringResource` call is legal here;
    // `joinToString`'s transform is not, which is why it runs in two steps.
    val names = labels.map { stringResource(it) }.joinToString(", ")
    Row(
        modifier = Modifier
            .padding(top = 8.dp)
            .fillMaxWidth()
            .clip(AzfShapes.Inner)
            .background(LocalAzfExtended.current.coral.copy(alpha = 0.12f))
            .border(
                BorderStroke(1.dp, LocalAzfExtended.current.coral.copy(alpha = 0.4f)),
                AzfShapes.Inner,
            )
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = Icons.Outlined.WarningAmber,
            contentDescription = null,
            tint = LocalAzfExtended.current.coral,
        )
        Text(
            text = stringResource(R.string.food_allergens, names),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.padding(start = 8.dp),
        )
    }
}

@Composable
private fun FoodRow(food: FoodDto, onClick: () -> Unit) {
    val interaction = remember { MutableInteractionSource() }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .pressScale(interaction)
            .clip(AzfShapes.Inner)
            .background(MaterialTheme.colorScheme.surfaceContainerLow)
            .border(
                BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                AzfShapes.Inner,
            )
            .clickable(interactionSource = interaction, indication = null, onClick = onClick)
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = food.name,
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = listOfNotNull(food.brand, food.category.takeIf { it.isNotBlank() })
                    .joinToString(" · "),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Text(
            text = stringResource(
                R.string.food_kcal_per_100g,
                NutritionFormat.fmtInt(food.per100g.kcal),
            ),
            style = DataSmall,
            color = MaterialTheme.colorScheme.primary,
            modifier = Modifier.padding(start = 12.dp),
        )
    }
}

@Composable
private fun ServingChip(label: String, selected: Boolean, onClick: () -> Unit) {
    val accent = LocalAzfExtended.current.primaryFixedDim
    Text(
        text = label,
        style = MaterialTheme.typography.labelMedium,
        color = if (selected) accent else MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier
            .clip(AzfShapes.Pill)
            .background(
                if (selected) accent.copy(alpha = 0.15f) else MaterialTheme.colorScheme.surfaceContainerLow,
            )
            .border(
                BorderStroke(
                    1.dp,
                    if (selected) accent else MaterialTheme.colorScheme.outlineVariant,
                ),
                AzfShapes.Pill,
            )
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 6.dp),
    )
}

private const val MAX_SERVING_CHIPS = 3

@Preview(showBackground = true, backgroundColor = 0xFF0E1416)
@Composable
private fun FoodPortionPreview() {
    AzfTheme {
        Column(Modifier.padding(16.dp)) {
            PortionPane(
                state = FoodSearchUi(
                    mealType = MealType.LUNCH,
                    selected = previewFood,
                    grams = 150,
                ),
                food = previewFood,
                onBack = {},
                onGramsChange = {},
                onConfirm = {},
            )
        }
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416)
@Composable
private fun FoodSearchPanePreview() {
    AzfTheme {
        Column(Modifier.padding(16.dp)) {
            SearchPane(
                state = FoodSearchUi(
                    mealType = MealType.LUNCH,
                    term = "chick",
                    results = listOf(previewFood),
                ),
                onTermChange = {},
                onSelectFood = {},
            )
        }
    }
}

private val previewFood = FoodDto(
    id = "f1",
    name = "Chicken breast, raw",
    brand = "Generic",
    category = "Poultry",
    per100g = FoodNutrientsDto(
        kcal = 120.0,
        proteinG = 22.5,
        carbsG = 0.0,
        fatG = 2.6,
        fiberG = 0.0,
        sugarG = 0.0,
        sodiumMg = 65.0,
    ),
    commonServings = listOf(
        FoodServingDto("Fillet", 150.0),
        FoodServingDto("Half fillet", 75.0),
    ),
)
