package fit.aquazero.app.feature.nutrition

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Remove
import androidx.compose.material.icons.outlined.Restaurant
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.Warning
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import fit.aquazero.app.R
import fit.aquazero.app.core.designsystem.AzfAppHeader
import fit.aquazero.app.core.designsystem.AzfCard
import fit.aquazero.app.core.designsystem.AzfChip
import fit.aquazero.app.core.designsystem.AzfColors
import fit.aquazero.app.core.designsystem.AzfShapes
import fit.aquazero.app.core.designsystem.AzfSpacing
import fit.aquazero.app.core.designsystem.AzfTheme
import fit.aquazero.app.core.designsystem.ErrorState
import fit.aquazero.app.core.designsystem.PrimaryButton
import fit.aquazero.app.core.designsystem.Skeleton
import fit.aquazero.app.core.designsystem.ToastKind
import fit.aquazero.app.core.model.Allergen
import fit.aquazero.app.core.model.FoodNutrientsDto
import fit.aquazero.app.core.model.RecipeDto
import fit.aquazero.app.core.model.RecipeIngredientDto
import fit.aquazero.app.core.ui.NutritionFormat
import fit.aquazero.app.core.ui.rememberToastSink
import kotlin.math.roundToInt

/**
 * One recipe: ingredients, method, per-serving macros and the source it came
 * from.
 *
 * Two things here are obligations rather than decoration. The allergen block
 * is a deterministic set intersection against the profile's declared
 * allergies, with zero tolerance for a false negative (plan §5 invariant 5).
 * And the source line renders whenever the record carries one, because the
 * recipe corpus is licensed content and the attribution travels with it.
 */
@Composable
fun RecipeDetailScreen(
    recipeId: String,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    onLogged: () -> Unit = onBack,
    viewModel: RecipeDetailViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val resources = LocalResources.current
    val toasts = rememberToastSink()

    LaunchedEffect(recipeId) { viewModel.load(recipeId) }

    LaunchedEffect(viewModel) {
        viewModel.events.collect { event ->
            when (event) {
                is RecipeDetailEvent.Message -> toasts.show(
                    resources.getString(event.messageRes),
                    if (event.isError) ToastKind.Error else ToastKind.Success,
                )
                RecipeDetailEvent.Logged -> onLogged()
            }
        }
    }

    Scaffold(
        modifier = modifier.fillMaxSize(),
        topBar = {
            AzfAppHeader(title = stringResource(R.string.screen_recipe), onBack = onBack)
        },
    ) { innerPadding ->
        val recipe = state.recipe
        when {
            state.loading -> Column(
                modifier = Modifier
                    .padding(innerPadding)
                    .padding(AzfSpacing.ContainerMargin),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Skeleton(modifier = Modifier.fillMaxWidth().height(180.dp))
                Skeleton(modifier = Modifier.fillMaxWidth().height(80.dp))
                Skeleton(modifier = Modifier.fillMaxWidth().height(160.dp))
            }
            state.notFound || recipe == null -> Box(
                modifier = Modifier
                    .padding(innerPadding)
                    .padding(AzfSpacing.ContainerMargin),
            ) {
                ErrorState(
                    title = stringResource(R.string.recipe_not_found_title),
                    message = stringResource(
                        if (state.notFound) {
                            R.string.recipe_not_found_body
                        } else {
                            R.string.recipe_error
                        },
                    ),
                    retryLabel = stringResource(R.string.memory_retry),
                    onRetry = { viewModel.load(recipeId) },
                )
            }
            else -> RecipeBody(
                state = state,
                recipe = recipe,
                onServingsChange = viewModel::changeServings,
                onToggleIngredient = viewModel::toggleIngredient,
                onLog = viewModel::logMeal,
                modifier = Modifier.padding(innerPadding),
            )
        }
    }
}

@Composable
private fun RecipeBody(
    state: RecipeDetailUiState,
    recipe: RecipeDto,
    onServingsChange: (Int) -> Unit,
    onToggleIngredient: (Int) -> Unit,
    onLog: () -> Unit,
    modifier: Modifier = Modifier,
) {
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(
            start = AzfSpacing.ContainerMargin,
            end = AzfSpacing.ContainerMargin,
            top = AzfSpacing.ContainerMargin,
            bottom = 40.dp,
        ),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Column {
                Text(
                    text = recipe.name,
                    style = MaterialTheme.typography.headlineMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                if (recipe.description.isNotBlank()) {
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        text = recipe.description,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                if (recipe.tags.isNotEmpty()) {
                    Spacer(modifier = Modifier.height(10.dp))
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        recipe.tags.take(4).forEach { tag ->
                            AzfChip(text = tag, selected = false, onClick = {})
                        }
                    }
                }
            }
        }

        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                MetaItem(
                    icon = Icons.Outlined.Schedule,
                    text = stringResource(R.string.recipe_prep, recipe.prepMinutes),
                )
                MetaItem(
                    icon = Icons.Outlined.Restaurant,
                    text = stringResource(R.string.recipe_cook, recipe.cookMinutes),
                )
                MetaItem(
                    icon = Icons.Outlined.Restaurant,
                    text = stringResource(R.string.recipe_serves, recipe.servings),
                )
            }
        }

        item { MacroGrid(recipe.perServing) }

        if (state.matchedAllergens.isNotEmpty()) {
            item { AllergenWarning(state.matchedAllergens) }
        } else if (recipe.allergens.isNotEmpty()) {
            item { AllergenNote(recipe.allergens) }
        }

        item {
            AzfCard(modifier = Modifier.fillMaxWidth()) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column {
                        Text(
                            text = stringResource(R.string.recipe_servings_heading).uppercase(),
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurface,
                        )
                        Text(
                            text = stringResource(R.string.recipe_servings_body),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        IconButton(
                            onClick = { onServingsChange(-1) },
                            enabled = state.servings > RecipeMath.MIN_SERVINGS,
                        ) {
                            Icon(
                                imageVector = Icons.Outlined.Remove,
                                contentDescription = stringResource(
                                    R.string.recipe_servings_less,
                                ),
                                tint = AzfColors.PrimaryFixedDim,
                            )
                        }
                        Text(
                            text = state.servings.toString(),
                            style = MaterialTheme.typography.headlineMedium,
                            color = MaterialTheme.colorScheme.onSurface,
                            modifier = Modifier.clearAndSetSemantics {},
                        )
                        IconButton(
                            onClick = { onServingsChange(1) },
                            enabled = state.servings < RecipeMath.MAX_SERVINGS,
                        ) {
                            Icon(
                                imageVector = Icons.Outlined.Add,
                                contentDescription = stringResource(
                                    R.string.recipe_servings_more,
                                ),
                                tint = AzfColors.PrimaryFixedDim,
                            )
                        }
                    }
                }
            }
        }

        item {
            Text(
                text = stringResource(R.string.recipe_ingredients_heading).uppercase(),
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(start = 4.dp),
            )
        }
        // Ingredients and method steps sit in the same lazy list, so both get a
        // namespaced key and a contentType. Without them the slot that held
        // ingredient 6 is handed step 1 when a shorter recipe loads, and
        // Compose rebuilds a checkbox row as a card in place.
        itemsIndexed(
            items = recipe.ingredients,
            key = { index, _ -> "ingredient-$index" },
            contentType = { _, _ -> "ingredient" },
        ) { index, ingredient ->
            IngredientRow(
                ingredient = ingredient,
                checked = index in state.checked,
                onToggle = { onToggleIngredient(index) },
            )
        }

        if (recipe.method.isNotEmpty()) {
            item {
                Text(
                    text = stringResource(R.string.recipe_method_heading).uppercase(),
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(start = 4.dp),
                )
            }
            itemsIndexed(
                items = recipe.method,
                key = { index, _ -> "step-$index" },
                contentType = { _, _ -> "step" },
            ) { index, step ->
                AzfCard(modifier = Modifier.fillMaxWidth()) {
                    Text(
                        text = stringResource(R.string.recipe_step, index + 1).uppercase(),
                        style = MaterialTheme.typography.labelSmall,
                        color = AzfColors.PrimaryFixedDim,
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = step,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                }
            }
        }

        if (recipe.source.isNotBlank() || recipe.licence.isNotBlank()) {
            item {
                Text(
                    text = stringResource(
                        R.string.recipe_attribution,
                        recipe.source.ifBlank { "—" },
                        recipe.licence.ifBlank { "—" },
                    ),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = 4.dp),
                )
            }
        }

        item {
            Column {
                PrimaryButton(
                    text = stringResource(
                        R.string.recipe_log_cta,
                        NutritionFormat.fmtInt(state.scaledKcal),
                    ),
                    onClick = onLog,
                    loading = state.logging,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = stringResource(R.string.recipe_log_confirm),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}

@Composable
private fun MetaItem(icon: androidx.compose.ui.graphics.vector.ImageVector, text: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = AzfColors.PrimaryFixedDim,
            modifier = Modifier.size(16.dp),
        )
        Spacer(modifier = Modifier.size(6.dp))
        Text(
            text = text,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun MacroGrid(perServing: FoodNutrientsDto) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        MacroTile(
            label = stringResource(R.string.recipe_calories),
            value = NutritionFormat.fmtInt(perServing.kcal),
            color = AzfColors.PrimaryFixedDim,
            modifier = Modifier.weight(1f),
        )
        MacroTile(
            label = stringResource(R.string.recipe_protein),
            value = stringResource(R.string.recipe_grams, perServing.proteinG.roundToInt()),
            color = AzfColors.SecondaryFixedDim,
            modifier = Modifier.weight(1f),
        )
        MacroTile(
            label = stringResource(R.string.recipe_carbs),
            value = stringResource(R.string.recipe_grams, perServing.carbsG.roundToInt()),
            color = AzfColors.PrimaryFixedDim,
            modifier = Modifier.weight(1f),
        )
        MacroTile(
            label = stringResource(R.string.recipe_fat),
            value = stringResource(R.string.recipe_grams, perServing.fatG.roundToInt()),
            color = AzfColors.Coral,
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun MacroTile(
    label: String,
    value: String,
    color: androidx.compose.ui.graphics.Color,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .background(AzfColors.SurfaceContainerLow, AzfShapes.Inner)
            .padding(vertical = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = label.uppercase(),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(modifier = Modifier.height(4.dp))
        Text(text = value, style = MaterialTheme.typography.titleMedium, color = color)
    }
}

@Composable
private fun IngredientRow(
    ingredient: RecipeIngredientDto,
    checked: Boolean,
    onToggle: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(AzfColors.SurfaceContainerLow, AzfShapes.Inner)
            .toggleable(value = checked, role = Role.Checkbox, onValueChange = { onToggle() })
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Checkbox(
            checked = checked,
            onCheckedChange = null,
            colors = CheckboxDefaults.colors(
                checkedColor = AzfColors.SecondaryContainer,
                checkmarkColor = AzfColors.Background,
                uncheckedColor = MaterialTheme.colorScheme.outline,
            ),
            modifier = Modifier.clearAndSetSemantics {},
        )
        Spacer(modifier = Modifier.size(12.dp))
        Text(
            text = ingredient.name,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.weight(1f),
        )
        if (ingredient.quantity.isNotBlank()) {
            Text(
                text = ingredient.quantity,
                style = MaterialTheme.typography.labelMedium,
                color = AzfColors.PrimaryFixedDim,
            )
        }
    }
}

/** The declared-allergy match. Coral, not red — a warning, not an alarm. */
@Composable
private fun AllergenWarning(matched: List<Allergen>) {
    // Resolved before the lambda: `stringResource` is composable, and a
    // `joinToString` transform is not a composable scope.
    val names = allergenNames(matched)
    AzfCard(modifier = Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.Top) {
            Icon(
                imageVector = Icons.Outlined.Warning,
                contentDescription = null,
                tint = AzfColors.Coral,
                modifier = Modifier.size(20.dp),
            )
            Spacer(modifier = Modifier.size(12.dp))
            Column {
                Text(
                    text = stringResource(R.string.recipe_allergens_heading).uppercase(),
                    style = MaterialTheme.typography.labelMedium,
                    color = AzfColors.Coral,
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = stringResource(R.string.recipe_allergens_yours, names),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }
        }
    }
}

/** Allergens the recipe declares that the reader has not flagged. */
@Composable
private fun AllergenNote(allergens: List<Allergen>) {
    val names = allergenNames(allergens)
    Text(
        text = stringResource(R.string.recipe_allergens_body, names),
        style = MaterialTheme.typography.labelSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(horizontal = 4.dp),
    )
}

/** Comma-separated allergen names, resolved outside any non-composable lambda. */
@Composable
private fun allergenNames(allergens: List<Allergen>): String {
    // `joinToString` is not inline, so its transform is not a composable
    // scope; the configuration-aware Resources is read here instead and the
    // lambda only formats with it.
    val resources = LocalResources.current
    return allergens.joinToString(", ") { resources.getString(allergenName(it)) }
}

private fun allergenName(allergen: Allergen): Int = when (allergen) {
    Allergen.PEANUTS -> R.string.allergen_peanuts
    Allergen.TREE_NUTS -> R.string.allergen_tree_nuts
    Allergen.MILK -> R.string.allergen_milk
    Allergen.EGGS -> R.string.allergen_eggs
    Allergen.FISH -> R.string.allergen_fish
    Allergen.SHELLFISH -> R.string.allergen_shellfish
    Allergen.SOY -> R.string.allergen_soy
    Allergen.WHEAT -> R.string.allergen_wheat
    Allergen.SESAME -> R.string.allergen_sesame
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416, heightDp = 1000)
@Composable
private fun RecipeDetailPreview() {
    AzfTheme {
        RecipeBody(
            state = RecipeDetailUiState(loading = false, servings = 2),
            recipe = RecipeDto(
                id = "r1",
                name = "Mediterranean chicken bowl",
                description = "Grilled chicken, quinoa and a lemon dressing.",
                prepMinutes = 10,
                cookMinutes = 15,
                servings = 2,
                perServing = FoodNutrientsDto(
                    kcal = 520.0,
                    proteinG = 42.0,
                    carbsG = 50.0,
                    fatG = 14.0,
                ),
                ingredients = listOf(
                    RecipeIngredientDto(name = "Chicken breast", quantity = "300 g", grams = 300.0),
                    RecipeIngredientDto(name = "Quinoa", quantity = "160 g", grams = 160.0),
                ),
                method = listOf("Grill the chicken.", "Fluff the quinoa and combine."),
                tags = listOf("High protein", "Quick"),
                source = "AquaZeroFit kitchen",
                licence = "CC-BY-SA-4.0",
            ),
            onServingsChange = {},
            onToggleIngredient = {},
            onLog = {},
        )
    }
}
