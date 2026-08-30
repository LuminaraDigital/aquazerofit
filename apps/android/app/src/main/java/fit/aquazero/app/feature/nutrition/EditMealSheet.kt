package fit.aquazero.app.feature.nutrition

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import fit.aquazero.app.R
import fit.aquazero.app.core.designsystem.AzfShapes
import fit.aquazero.app.core.designsystem.AzfSpacing
import fit.aquazero.app.core.designsystem.AzfTheme
import fit.aquazero.app.core.designsystem.DataSmall
import fit.aquazero.app.core.designsystem.GramsStepper
import fit.aquazero.app.core.designsystem.PrimaryButton
import fit.aquazero.app.core.model.MealLogItemDto
import fit.aquazero.app.core.model.MealType
import fit.aquazero.app.feature.dashboard.NutritionFormat
import java.util.IdentityHashMap

/**
 * Edit one logged meal: rescale or remove its items, then save.
 *
 * Each row keeps the ORIGINAL logged item beside the shown one so rescaling
 * stays anchored to the right food even after a sibling row is removed — the
 * same bug the web client fixed by pairing `{original, current}`. Saving
 * enqueues a follow-up `PUT` op; the original create's idempotency key is
 * never reused with a different body.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun EditMealSheet(
    state: EditMealUi,
    onDismiss: () -> Unit,
    onGramsChange: (Int, Int) -> Unit,
    onRemoveRow: (Int) -> Unit,
    onSave: () -> Unit,
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
                    R.string.edit_meal_title,
                    stringResource(NutritionFormat.mealLabelRes(state.mealType)),
                ).uppercase(),
                style = MaterialTheme.typography.headlineSmall,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Spacer(Modifier.height(AzfSpacing.ElementGapMedium))

            val rowKeys = rememberRowKeys(state)
            LazyColumn(modifier = Modifier.heightIn(max = 420.dp)) {
                itemsIndexed(
                    items = state.rows,
                    key = { _, row -> rowKeys.keyFor(row) },
                    contentType = { _, _ -> "edit-row" },
                ) { index, row ->
                    EditRow(
                        row = row,
                        canRemove = state.rows.size > 1,
                        onGramsChange = { grams -> onGramsChange(index, grams) },
                        onRemove = { onRemoveRow(index) },
                    )
                    Spacer(Modifier.height(12.dp))
                }
            }

            PrimaryButton(
                text = stringResource(
                    if (state.saving) R.string.edit_saving else R.string.edit_save,
                ),
                onClick = onSave,
                enabled = state.rows.isNotEmpty() && !state.saving,
                loading = state.saving,
            )
        }
    }
}

/**
 * Stable per-row identities for the lazy list.
 *
 * [EditRowUi] carries no id, and everything on it moves: `current` is rebuilt
 * on every stepper tap, and the index stops meaning anything the moment a row
 * is removed. These rows *are* removable, so an index key does not merely cost
 * a recomposition — it re-associates the slot's remembered state with a
 * different food.
 *
 * What is stable is the ORIGINAL logged item. The view model copies rows and
 * filters the list, but never replaces `original`, so its object identity
 * survives every edit for the sheet's lifetime. Each one is numbered the first
 * time it is seen, by identity rather than equality — two helpings of the same
 * food are equal to each other and must still get separate keys.
 */
private class RowKeys {
    private val assigned = IdentityHashMap<MealLogItemDto, String>()

    fun keyFor(row: EditRowUi): String =
        assigned.getOrPut(row.original) { "edit-row-${assigned.size}" }
}

/** [RowKeys] for one meal; a different meal starts a fresh numbering. */
@Composable
private fun rememberRowKeys(state: EditMealUi): RowKeys =
    remember(state.localId) { RowKeys() }

@Composable
private fun EditRow(
    row: EditRowUi,
    canRemove: Boolean,
    onGramsChange: (Int) -> Unit,
    onRemove: () -> Unit,
) {
    val item = row.current
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(AzfShapes.Inner)
            .background(MaterialTheme.colorScheme.surfaceContainerLow)
            .padding(12.dp),
    ) {
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = item.name,
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            Text(
                text = stringResource(R.string.kcal_value, NutritionFormat.fmtInt(item.kcal)),
                style = DataSmall,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.padding(start = 12.dp),
            )
        }
        Text(
            text = stringResource(
                R.string.macro_line,
                NutritionFormat.fmt1(item.proteinG),
                NutritionFormat.fmt1(item.carbsG),
                NutritionFormat.fmt1(item.fatG),
            ),
            style = DataSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 4.dp),
        )
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            GramsStepper(
                grams = item.grams.toInt(),
                onGramsChange = onGramsChange,
                modifier = Modifier.weight(1f),
            )
            if (canRemove) {
                IconButton(onClick = onRemove, modifier = Modifier.size(AzfSpacing.TouchTarget)) {
                    Icon(
                        imageVector = Icons.Outlined.Delete,
                        contentDescription = stringResource(
                            R.string.edit_remove_item,
                            item.name,
                        ),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416)
@Composable
private fun EditRowPreview() {
    val original = MealLogItemDto(
        name = "Porridge oats",
        grams = 80.0,
        kcal = 300.0,
        proteinG = 10.4,
        carbsG = 52.0,
        fatG = 5.6,
    )
    AzfTheme {
        Column(Modifier.padding(16.dp)) {
            EditRow(
                row = EditRowUi(
                    original = original,
                    current = NutritionFormat.rescaleItem(original, 120),
                ),
                canRemove = true,
                onGramsChange = {},
                onRemove = {},
            )
        }
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416)
@Composable
private fun EditMealRowsPreview() {
    val original = MealLogItemDto(
        name = "Greek yoghurt",
        grams = 170.0,
        kcal = 160.0,
        proteinG = 17.0,
        carbsG = 6.0,
        fatG = 8.0,
    )
    AzfTheme {
        Column(Modifier.padding(16.dp)) {
            Text(
                text = stringResource(
                    R.string.edit_meal_title,
                    stringResource(NutritionFormat.mealLabelRes(MealType.BREAKFAST)),
                ).uppercase(),
                style = MaterialTheme.typography.headlineSmall,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Spacer(Modifier.height(12.dp))
            EditRow(
                row = EditRowUi(original = original, current = original),
                canRemove = false,
                onGramsChange = {},
                onRemove = {},
            )
        }
    }
}
