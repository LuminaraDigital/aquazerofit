package fit.aquazero.app.feature.coach

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import fit.aquazero.app.R
import fit.aquazero.app.core.common.MealTrust
import fit.aquazero.app.core.designsystem.AzfCard
import fit.aquazero.app.core.designsystem.AzfChip
import fit.aquazero.app.core.designsystem.AzfShapes
import fit.aquazero.app.core.designsystem.AzfTheme
import fit.aquazero.app.core.designsystem.ConfidenceBandChip
import fit.aquazero.app.core.designsystem.DataSmall
import fit.aquazero.app.core.designsystem.FatCautionBanner
import fit.aquazero.app.core.designsystem.GramsStepper
import fit.aquazero.app.core.designsystem.LocalAzfExtended
import fit.aquazero.app.core.designsystem.PrimaryButton
import fit.aquazero.app.core.designsystem.SecondaryButton
import fit.aquazero.app.core.model.Allergen
import fit.aquazero.app.core.model.ChatMealDraftDto
import fit.aquazero.app.core.model.ChatMealDraftStatus
import fit.aquazero.app.core.model.ChatMealItemDto
import fit.aquazero.app.core.model.ChatMealItemStatus
import fit.aquazero.app.core.model.ChatMealMatchDto
import fit.aquazero.app.core.model.GramsBasis
import fit.aquazero.app.core.model.MealType
import kotlin.math.roundToInt

/** A user-applied cooking-fat line (never auto-injected by the server). */
private data class CookingFatLine(
    val key: String,
    val preset: MealTrust.CookingFatPreset,
    val grams: Int,
)

private fun projectPresetKcal(preset: MealTrust.CookingFatPreset, grams: Int): Int {
    if (preset.grams <= 0.0) return 0
    return (preset.kcal * grams / preset.grams).roundToInt()
}

/** What the card hands back when the user commits. */
data class MealDraftConfirmation(
    val mealType: MealType,
    val selections: List<DraftSelection>,
    val acknowledgeAllergens: Boolean,
)

/**
 * The second confirmation gate.
 *
 * Photo analysis has one; this is the other, and they are independent by
 * design — a coach that could log from a sentence would be a coach that logs
 * things people did not eat. Every line here is opt-in, ambiguous lines open
 * with no food chosen, and an allergen on the profile needs its own tap before
 * "Log meal" will fire. The rules themselves live in [MealDraftModel] so they
 * can be tested; this file is their surface.
 */
@Composable
fun MealDraftCard(
    draft: ChatMealDraftDto,
    pending: Boolean,
    onConfirm: (MealDraftConfirmation) -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    onLogManually: (() -> Unit)? = null,
) {
    if (draft.status == ChatMealDraftStatus.EMPTY) {
        EmptyDraftCard(onDismiss = onDismiss, onLogManually = onLogManually, modifier = modifier)
        return
    }

    var mealType by remember(draft.id) { mutableStateOf(draft.mealType) }
    var choices by remember(draft.id) {
        mutableStateOf(MealDraftModel.initialChoices(draft))
    }
    // Never pre-ticked, and reset whenever the selection changes underneath it.
    var acknowledged by remember(draft.id) { mutableStateOf(false) }
    var fatAdditives by remember(draft.id) { mutableStateOf(emptyList<CookingFatLine>()) }

    val selections = MealDraftModel.selections(draft, choices)
    val conflicts = MealDraftModel.conflicts(draft, choices)
    val draftKcal = MealDraftModel.totalKcal(draft, choices)
    val additiveKcal = fatAdditives.sumOf { projectPresetKcal(it.preset, it.grams) }
    val totalKcal = draftKcal + additiveKcal
    val includedNames = draft.items.mapNotNull { item ->
        val choice = choices[item.id] ?: return@mapNotNull null
        if (!choice.included) return@mapNotNull null
        MealDraftModel.matchOf(item, choice.foodId)?.name ?: item.phrase
    } + fatAdditives.map { it.preset.label }
    val draftFatG = draft.items.sumOf { item ->
        val choice = choices[item.id] ?: return@sumOf 0.0
        if (!choice.included) return@sumOf 0.0
        val match = MealDraftModel.matchOf(item, choice.foodId) ?: return@sumOf 0.0
        val grams = MealDraftModel.gramsOf(item, choice) ?: match.grams.toInt()
        if (match.grams <= 0.0) 0.0 else match.fatG * grams / match.grams
    }
    val additiveFatG = fatAdditives.sumOf { line ->
        if (line.preset.grams <= 0.0) 0.0 else line.preset.fatG * line.grams / line.preset.grams
    }
    val showFatCaution = MealTrust.shouldShowFatCaution(
        includedNames,
        totalKcal.toDouble(),
        draftFatG + additiveFatG,
    )
    val canConfirm = MealDraftModel.canConfirm(draft, choices, acknowledged) && !pending
    val awaitingChoice = MealDraftModel.awaitingChoice(draft, choices)

    fun update(itemId: String, transform: (ItemChoice) -> ItemChoice) {
        val existing = choices[itemId] ?: ItemChoice()
        choices = choices + (itemId to transform(existing))
        // A changed basket is an un-acknowledged basket.
        acknowledged = false
    }

    AzfCard(modifier = modifier.fillMaxWidth()) {
        Text(
            text = stringResource(R.string.draft_title).uppercase(),
            style = MaterialTheme.typography.labelSmall,
            color = LocalAzfExtended.current.primaryFixedDim,
        )
        Text(
            text = stringResource(R.string.draft_source, draft.sourceText),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 4.dp),
        )

        Spacer(Modifier.height(12.dp))

        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            MealType.entries.forEach { type ->
                AzfChip(
                    text = mealTypeLabel(type),
                    selected = mealType == type,
                    onClick = { mealType = type },
                )
            }
        }

        Spacer(Modifier.height(14.dp))

        if (showFatCaution) {
            FatCautionBanner()
            Spacer(Modifier.height(10.dp))
            Text(
                text = stringResource(R.string.trust_add_cooking_fat),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.padding(top = 6.dp),
            ) {
                MealTrust.cookingFatPresets.forEach { preset ->
                    AzfChip(
                        text = preset.label,
                        selected = false,
                        onClick = {
                            fatAdditives = fatAdditives + CookingFatLine(
                                key = "fat-${preset.id}-${System.currentTimeMillis()}",
                                preset = preset,
                                grams = preset.grams.roundToInt(),
                            )
                            acknowledged = false
                        },
                    )
                }
            }
            Spacer(Modifier.height(12.dp))
        }

        draft.items.forEach { item ->
            DraftItemRow(
                item = item,
                choice = choices[item.id] ?: ItemChoice(),
                onToggle = { included -> update(item.id) { it.copy(included = included) } },
                onPickFood = { foodId ->
                    update(item.id) { current ->
                        val picked = MealDraftModel.matchOf(item, foodId)
                        current.copy(
                            foodId = foodId,
                            grams = picked?.grams?.toInt(),
                            included = true,
                        )
                    }
                },
                onGramsChange = { grams -> update(item.id) { it.copy(grams = grams) } },
                onLogManually = onLogManually,
                modifier = Modifier.padding(bottom = 10.dp),
            )
        }

        fatAdditives.forEach { line ->
            CookingFatRow(
                line = line,
                onGramsChange = { grams ->
                    fatAdditives = fatAdditives.map {
                        if (it.key == line.key) it.copy(grams = grams) else it
                    }
                    acknowledged = false
                },
                onRemove = {
                    fatAdditives = fatAdditives.filter { it.key != line.key }
                    acknowledged = false
                },
                modifier = Modifier.padding(bottom = 10.dp),
            )
        }

        if (draft.notes.isNotEmpty()) {
            draft.notes.forEach { note ->
                Text(
                    text = note,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 2.dp),
                )
            }
            Spacer(Modifier.height(8.dp))
        }

        if (conflicts.isNotEmpty()) {
            AllergenAcknowledgement(
                conflicts = conflicts,
                acknowledged = acknowledged,
                onAcknowledgedChange = { acknowledged = it },
                modifier = Modifier.padding(top = 4.dp),
            )
            Spacer(Modifier.height(12.dp))
        }

        if (awaitingChoice) {
            Text(
                text = stringResource(R.string.draft_pick_food_first),
                style = MaterialTheme.typography.labelMedium,
                color = LocalAzfExtended.current.secondaryFixedDim,
                modifier = Modifier.padding(bottom = 8.dp),
            )
        }

        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = stringResource(R.string.draft_total),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.width(8.dp))
            Text(
                text = stringResource(
                    R.string.draft_kcal,
                    if (fatAdditives.isEmpty()) totalKcal else draftKcal,
                ),
                style = DataSmall,
                color = MaterialTheme.colorScheme.onSurface,
            )
        }
        if (fatAdditives.isNotEmpty()) {
            Text(
                text = stringResource(R.string.trust_fat_total_hint, totalKcal),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 4.dp),
            )
        }

        Spacer(Modifier.height(12.dp))

        PrimaryButton(
            text = stringResource(R.string.draft_confirm),
            onClick = {
                onConfirm(MealDraftConfirmation(mealType, selections, acknowledged))
            },
            enabled = canConfirm,
            loading = pending,
        )
        Spacer(Modifier.height(8.dp))
        SecondaryButton(
            text = stringResource(R.string.draft_dismiss),
            onClick = onDismiss,
            enabled = !pending,
        )
    }
}

@Composable
private fun DraftItemRow(
    item: ChatMealItemDto,
    choice: ItemChoice,
    onToggle: (Boolean) -> Unit,
    onPickFood: (String) -> Unit,
    onGramsChange: (Int) -> Unit,
    onLogManually: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    if (item.status == ChatMealItemStatus.UNMATCHED) {
        Column(
            modifier = modifier
                .fillMaxWidth()
                .clip(AzfShapes.Inner)
                .background(MaterialTheme.colorScheme.surfaceContainerLow)
                .border(
                    BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f)),
                    AzfShapes.Inner,
                )
                .padding(12.dp),
        ) {
            Text(
                text = stringResource(R.string.draft_unmatched, item.phrase),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (onLogManually != null) {
                Text(
                    text = stringResource(R.string.draft_log_manually),
                    style = MaterialTheme.typography.labelLarge,
                    color = LocalAzfExtended.current.primaryFixedDim,
                    modifier = Modifier
                        .padding(top = 6.dp)
                        .clickable(onClick = onLogManually),
                )
            }
        }
        return
    }

    val match = MealDraftModel.matchOf(item, choice.foodId)
    val includeLabel = stringResource(R.string.draft_include_cd, item.phrase)

    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(AzfShapes.Inner)
            .background(MaterialTheme.colorScheme.surfaceContainerLow)
            .border(
                BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f)),
                AzfShapes.Inner,
            )
            .padding(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Checkbox(
                checked = choice.included,
                onCheckedChange = onToggle,
                colors = CheckboxDefaults.colors(
                    checkedColor = LocalAzfExtended.current.primaryFixedDim,
                ),
                modifier = Modifier.semantics { contentDescription = includeLabel },
            )
            Text(
                text = item.phrase,
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.padding(start = 4.dp),
            )
        }

        if (item.status == ChatMealItemStatus.AMBIGUOUS) {
            FoodPicker(
                item = item,
                selectedFoodId = choice.foodId,
                onPick = onPickFood,
                modifier = Modifier.padding(top = 8.dp),
            )
        }

        if (match != null) {
            if (item.status == ChatMealItemStatus.RESOLVED) {
                Row(
                    modifier = Modifier.padding(top = 6.dp, start = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = match.name,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.weight(1f),
                    )
                    if (match.score > 0) {
                        ConfidenceBandChip(score = match.score)
                    }
                }
            } else if (match.score > 0) {
                ConfidenceBandChip(
                    score = match.score,
                    modifier = Modifier.padding(top = 6.dp, start = 4.dp),
                )
            }
            val grams = MealDraftModel.gramsOf(item, choice) ?: match.grams.toInt()
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                GramsStepper(
                    grams = grams,
                    onGramsChange = onGramsChange,
                    min = MealDraftModel.MIN_GRAMS,
                    max = MealDraftModel.MAX_GRAMS,
                )
                Spacer(Modifier.weight(1f))
                Text(
                    text = stringResource(
                        R.string.draft_kcal,
                        MealDraftModel.projectKcal(match, grams),
                    ),
                    style = DataSmall,
                    color = LocalAzfExtended.current.primaryFixedDim,
                )
            }
            Text(
                text = portionCaption(match),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 4.dp, start = 4.dp),
            )
            if (match.allergenConflicts.isNotEmpty()) {
                // `map` is inline, so the composable lookup is legal here;
                // `joinToString`'s transform is not, hence the two steps.
                val names = match.allergenConflicts.map { allergenLabel(it) }
                Text(
                    text = stringResource(
                        R.string.draft_contains,
                        names.joinToString(", "),
                    ),
                    style = MaterialTheme.typography.labelMedium,
                    // Coral, never red: this is information, not an alarm.
                    color = LocalAzfExtended.current.coral,
                    modifier = Modifier.padding(top = 4.dp, start = 4.dp),
                )
            }
        }
    }
}

/**
 * Ambiguous lines pick from a menu that opens on "Choose a food…". There is no
 * pre-selected option, and the menu is the only way a food gets attached to
 * this line.
 */
@Composable
private fun FoodPicker(
    item: ChatMealItemDto,
    selectedFoodId: String?,
    onPick: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    var open by remember { mutableStateOf(false) }
    val selected = MealDraftModel.matchOf(item, selectedFoodId)
    Column(modifier = modifier.fillMaxWidth()) {
        Text(
            text = stringResource(R.string.draft_choose_food),
            style = MaterialTheme.typography.labelSmall,
            color = LocalAzfExtended.current.secondaryFixedDim,
        )
        Box {
            Text(
                text = selected?.name ?: stringResource(R.string.draft_choose_placeholder),
                style = MaterialTheme.typography.bodyMedium,
                color = if (selected == null) {
                    MaterialTheme.colorScheme.onSurfaceVariant
                } else {
                    MaterialTheme.colorScheme.onSurface
                },
                modifier = Modifier
                    .padding(top = 4.dp)
                    .fillMaxWidth()
                    .clip(AzfShapes.Inner)
                    .background(MaterialTheme.colorScheme.surfaceContainerHigh)
                    .clickable { open = true }
                    .padding(horizontal = 12.dp, vertical = 14.dp),
            )
            DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
                item.matches.forEach { candidate ->
                    DropdownMenuItem(
                        text = {
                            Text("${candidate.name} · ${candidate.grams.toInt()} g · ${candidate.kcal.toInt()} kcal")
                        },
                        onClick = {
                            open = false
                            onPick(candidate.foodId)
                        },
                    )
                }
            }
        }
    }
}

/** Editable cooking-fat row the user appended from a preset chip. */
@Composable
private fun CookingFatRow(
    line: CookingFatLine,
    onGramsChange: (Int) -> Unit,
    onRemove: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(AzfShapes.Inner)
            .background(MaterialTheme.colorScheme.surfaceContainerLow)
            .border(
                BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f)),
                AzfShapes.Inner,
            )
            .padding(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = line.preset.label,
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.weight(1f),
            )
            Text(
                text = stringResource(R.string.trust_cooking_fat_remove),
                style = MaterialTheme.typography.labelLarge,
                color = LocalAzfExtended.current.primaryFixedDim,
                modifier = Modifier.clickable(onClick = onRemove),
            )
        }
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            GramsStepper(
                grams = line.grams,
                onGramsChange = onGramsChange,
                min = MealDraftModel.MIN_GRAMS,
                max = MealDraftModel.MAX_GRAMS,
            )
            Spacer(Modifier.weight(1f))
            Text(
                text = stringResource(R.string.draft_kcal, projectPresetKcal(line.preset, line.grams)),
                style = DataSmall,
                color = LocalAzfExtended.current.primaryFixedDim,
            )
        }
    }
}

/** Never pre-ticked, and cleared whenever the basket changes. */
@Composable
private fun AllergenAcknowledgement(
    conflicts: List<AllergenConflict>,
    acknowledged: Boolean,
    onAcknowledgedChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    val coral = LocalAzfExtended.current.coral
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(AzfShapes.Inner)
            .background(coral.copy(alpha = 0.10f))
            .border(BorderStroke(1.dp, coral.copy(alpha = 0.5f)), AzfShapes.Inner)
            .padding(12.dp),
    ) {
        Text(
            text = stringResource(R.string.draft_allergen_title),
            style = MaterialTheme.typography.titleSmall,
            color = coral,
        )
        val summary = conflicts
            .map { conflict ->
                val names = conflict.allergens.map { allergenLabel(it) }
                "${conflict.foodName} (${names.joinToString(", ")})"
            }
            .joinToString("; ")
        Text(
            text = stringResource(R.string.draft_allergen_body, summary),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.padding(top = 4.dp),
        )
        Row(
            modifier = Modifier.padding(top = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Checkbox(
                checked = acknowledged,
                onCheckedChange = onAcknowledgedChange,
                colors = CheckboxDefaults.colors(checkedColor = coral),
            )
            Text(
                text = stringResource(R.string.draft_allergen_ack),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface,
            )
        }
    }
}

/** The model read nothing out of the sentence — say so and offer the manual path. */
@Composable
private fun EmptyDraftCard(
    onDismiss: () -> Unit,
    onLogManually: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    AzfCard(modifier = modifier.fillMaxWidth()) {
        Text(
            text = stringResource(R.string.draft_empty_body),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface,
        )
        Spacer(Modifier.height(12.dp))
        if (onLogManually != null) {
            SecondaryButton(
                text = stringResource(R.string.draft_log_manually),
                onClick = onLogManually,
            )
            Spacer(Modifier.height(8.dp))
        }
        SecondaryButton(text = stringResource(R.string.draft_dismiss), onClick = onDismiss)
    }
}

@Composable
private fun portionCaption(match: ChatMealMatchDto): String = when (match.portionBasis()) {
    PortionBasis.AsStated -> stringResource(R.string.draft_portion_as_said)
    PortionBasis.NamedServing ->
        stringResource(R.string.draft_portion_serving, match.servingLabel.orEmpty())
    PortionBasis.Assumed -> stringResource(R.string.draft_portion_assumed)
}

@Composable
internal fun mealTypeLabel(type: MealType): String = when (type) {
    MealType.BREAKFAST -> stringResource(R.string.meal_breakfast)
    MealType.LUNCH -> stringResource(R.string.meal_lunch)
    MealType.DINNER -> stringResource(R.string.meal_dinner)
    MealType.SNACK -> stringResource(R.string.meal_snack)
}

@Composable
internal fun allergenLabel(allergen: Allergen): String = when (allergen) {
    Allergen.PEANUTS -> stringResource(R.string.allergen_peanuts)
    Allergen.TREE_NUTS -> stringResource(R.string.allergen_tree_nuts)
    Allergen.MILK -> stringResource(R.string.allergen_milk)
    Allergen.EGGS -> stringResource(R.string.allergen_eggs)
    Allergen.FISH -> stringResource(R.string.allergen_fish)
    Allergen.SHELLFISH -> stringResource(R.string.allergen_shellfish)
    Allergen.SOY -> stringResource(R.string.allergen_soy)
    Allergen.WHEAT -> stringResource(R.string.allergen_wheat)
    Allergen.SESAME -> stringResource(R.string.allergen_sesame)
}

// ---------------------------------------------------------------------------
// Previews
// ---------------------------------------------------------------------------

// A preview fixture: length here is the size of the sample payload, not
// complexity. Splitting it up would only scatter one literal object.
@Suppress("LongMethod")
private fun previewDraft(): ChatMealDraftDto = ChatMealDraftDto(
    id = "draft1",
    userId = "u1",
    sourceText = "two eggs on toast and a flat white",
    mealType = MealType.BREAKFAST,
    localDate = "2026-08-27",
    items = listOf(
        ChatMealItemDto(
            id = "i1",
            phrase = "two eggs",
            spokenName = "eggs",
            quantity = 2.0,
            unit = "each",
            status = ChatMealItemStatus.RESOLVED,
            suggestedFoodId = "f-egg",
            matches = listOf(
                ChatMealMatchDto(
                    foodId = "f-egg",
                    name = "Egg, whole, boiled",
                    grams = 100.0,
                    gramsBasis = GramsBasis.NAMED_SERVING,
                    servingLabel = "2 eggs",
                    kcal = 155.0,
                    proteinG = 13.0,
                    carbsG = 1.1,
                    fatG = 11.0,
                    allergenConflicts = listOf(Allergen.EGGS),
                ),
            ),
        ),
        ChatMealItemDto(
            id = "i2",
            phrase = "toast",
            spokenName = "toast",
            quantity = 1.0,
            unit = "slice",
            status = ChatMealItemStatus.AMBIGUOUS,
            matches = listOf(
                ChatMealMatchDto(
                    foodId = "f-white",
                    name = "White bread, toasted",
                    grams = 35.0,
                    kcal = 96.0,
                ),
                ChatMealMatchDto(
                    foodId = "f-rye",
                    name = "Rye bread, toasted",
                    grams = 35.0,
                    kcal = 88.0,
                ),
            ),
        ),
        ChatMealItemDto(
            id = "i3",
            phrase = "flat white",
            spokenName = "flat white",
            quantity = 1.0,
            unit = "cup",
            status = ChatMealItemStatus.UNMATCHED,
        ),
    ),
    notes = listOf("Portion for the toast was assumed at one slice."),
)

@Preview(showBackground = true, backgroundColor = 0xFF0E1416, widthDp = 400, heightDp = 900)
@Composable
private fun MealDraftCardPreview() {
    AzfTheme {
        MealDraftCard(
            draft = previewDraft(),
            pending = false,
            onConfirm = {},
            onDismiss = {},
            onLogManually = {},
            modifier = Modifier.padding(16.dp),
        )
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416, widthDp = 400)
@Composable
private fun MealDraftCardEmptyPreview() {
    AzfTheme {
        MealDraftCard(
            draft = previewDraft().copy(status = ChatMealDraftStatus.EMPTY, items = emptyList()),
            pending = false,
            onConfirm = {},
            onDismiss = {},
            onLogManually = {},
            modifier = Modifier.padding(16.dp),
        )
    }
}
