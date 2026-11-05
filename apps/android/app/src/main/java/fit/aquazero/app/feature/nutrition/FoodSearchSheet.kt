package fit.aquazero.app.feature.nutrition

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import fit.aquazero.app.R
import fit.aquazero.app.core.designsystem.AzfChip
import fit.aquazero.app.core.designsystem.AzfSectionHeading
import fit.aquazero.app.core.designsystem.AzfShapes
import fit.aquazero.app.core.designsystem.AzfSpacing
import fit.aquazero.app.core.designsystem.AzfStatRow
import fit.aquazero.app.core.designsystem.AzfTextField
import fit.aquazero.app.core.designsystem.AzfTheme
import fit.aquazero.app.core.designsystem.DataSmall
import fit.aquazero.app.core.designsystem.EmptyState
import fit.aquazero.app.core.designsystem.GramsStepper
import fit.aquazero.app.core.designsystem.LocalAzfExtended
import fit.aquazero.app.core.designsystem.PrimaryButton
import fit.aquazero.app.core.designsystem.Skeleton
import fit.aquazero.app.core.model.FoodDto
import fit.aquazero.app.core.model.FoodNutrientsDto
import fit.aquazero.app.core.model.FoodServingDto
import fit.aquazero.app.core.model.MealType
import fit.aquazero.app.core.ui.NutritionFormat

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
            Row(verticalAlignment = Alignment.CenterVertically) {
                AzfSectionHeading(
                    text = stringResource(
                        R.string.food_sheet_title_meal,
                        stringResource(NutritionFormat.mealLabelRes(state.mealType)),
                    ),
                    modifier = Modifier.weight(1f),
                )
                IconButton(onClick = onDismiss) {
                    Icon(
                        imageVector = Icons.Outlined.Close,
                        contentDescription = stringResource(R.string.nutrition_sheet_close),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            Spacer(Modifier.height(AzfSpacing.ElementGapSmall))

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
                        .height(56.dp),
                )
            }
        }

        state.searchActive && state.results.isEmpty() && state.recents.isEmpty() -> EmptyState(
            title = stringResource(R.string.food_search_none_title),
            message = stringResource(R.string.food_search_none_body),
        )

        else -> LazyColumn(
            modifier = Modifier.heightIn(max = 380.dp),
        ) {
            if (showRecents) {
                item(key = "recents-header") {
                    Column {
                        AzfSectionHeading(text = stringResource(R.string.food_recent_title))
                        if (state.searchActive) {
                            Text(
                                text = stringResource(R.string.food_offline_note),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(top = 4.dp),
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
                itemsIndexed(state.recents, key = { _, food -> "recent-${food.id}" }) { index, food ->
                    if (index > 0) HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                    FoodRow(food = food, onClick = { onSelectFood(food) })
                }
            } else {
                itemsIndexed(state.results, key = { _, food -> food.id }) { index, food ->
                    if (index > 0) HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
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
            .clickable(role = Role.Button, onClick = onBack)
            // 18dp chevron + 12dp padding is a 30dp target for the one
            // control that gets a user out of the portion pane.
            .minimumInteractiveComponentSize()
            .padding(vertical = 8.dp, horizontal = 4.dp),
    ) {
        Icon(
            imageVector = Icons.AutoMirrored.Outlined.ArrowBack,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.height(18.dp),
        )
        Text(
            text = stringResource(R.string.food_back_to_search),
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.primary,
            modifier = Modifier.padding(start = 8.dp),
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
        modifier = Modifier.padding(top = 4.dp),
    )

    AllergenNotice(food)

    if (food.commonServings.isNotEmpty()) {
        Spacer(Modifier.height(AzfSpacing.ElementGapMedium))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            food.commonServings.take(MAX_SERVING_CHIPS).forEach { serving ->
                AzfChip(
                    text = stringResource(
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
        AzfSectionHeading(text = stringResource(R.string.food_portion), modifier = Modifier.weight(1f))
        GramsStepper(grams = state.grams, onGramsChange = onGramsChange)
    }

    if (preview != null) {
        Spacer(Modifier.height(AzfSpacing.ElementGapMedium))
        AzfStatRow(
            label = stringResource(R.string.food_preview_calories),
            value = NutritionFormat.fmtInt(preview.kcal),
            unit = stringResource(R.string.nutrition_unit_kcal),
        )
        Text(
            text = stringResource(
                R.string.macro_line,
                NutritionFormat.fmt1(preview.proteinG),
                NutritionFormat.fmt1(preview.carbsG),
                NutritionFormat.fmt1(preview.fatG),
            ),
            style = DataSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 8.dp),
        )
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
    val labels = remember(food) { NutritionMath.allergenLabels(food) }
    if (labels.isEmpty()) return
    // The label list is fixed per food and the joined string is fixed per
    // (food, configuration), so both are remembered — this composable runs
    // once per search result, and the old form allocated an intermediate list
    // and a StringBuilder on every pass. `stringResource` cannot move into the
    // `remember` (it is a composable read), so the configuration-aware
    // Resources is read here and the lambda only formats with it.
    val resources = LocalResources.current
    val names = remember(labels, resources) {
        labels.joinToString(", ") { resources.getString(it) }
    }
    Row(
        modifier = Modifier
            .padding(top = 8.dp)
            .fillMaxWidth()
            .clip(AzfShapes.Inner)
            .background(LocalAzfExtended.current.warning.copy(alpha = 0.12f))
            .border(
                BorderStroke(1.dp, LocalAzfExtended.current.warning.copy(alpha = 0.4f)),
                AzfShapes.Inner,
            )
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = Icons.Outlined.WarningAmber,
            contentDescription = null,
            tint = LocalAzfExtended.current.warning,
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
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(role = Role.Button, onClick = onClick)
            .heightIn(min = AzfSpacing.TouchTarget)
            .padding(vertical = AzfSpacing.ElementGapSmall),
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
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(start = 12.dp),
        )
    }
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
