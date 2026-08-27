package fit.aquazero.app.feature.training

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import coil3.compose.SubcomposeAsyncImage
import fit.aquazero.app.R
import fit.aquazero.app.core.database.ExerciseMediaEntity
import fit.aquazero.app.core.designsystem.AzfCard
import fit.aquazero.app.core.designsystem.AzfCardTier
import fit.aquazero.app.core.designsystem.AzfColors
import fit.aquazero.app.core.designsystem.AzfShapes
import fit.aquazero.app.core.designsystem.AzfSpacing
import fit.aquazero.app.core.designsystem.AzfTheme
import fit.aquazero.app.core.designsystem.LocalAzfExtended
import fit.aquazero.app.core.network.dto.Equipment
import fit.aquazero.app.core.network.dto.ExerciseDto

/**
 * Exercise detail bottom sheet — the mobile form of the web's `BottomSheet`.
 *
 * Renders media (with a graceful icon fallback when a URL fails or the media
 * store is unreachable), muscles, equipment, difficulty and — always, never
 * conditionally — the CC-BY-SA attribution block.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ExerciseDetailSheet(
    detail: ExerciseDetail,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        modifier = modifier,
        containerColor = MaterialTheme.colorScheme.surfaceContainerLow,
    ) {
        ExerciseDetailBody(
            detail = detail,
            modifier = Modifier
                .verticalScroll(rememberScrollState())
                .navigationBarsPadding()
                .padding(horizontal = AzfSpacing.ContainerMargin)
                .padding(bottom = AzfSpacing.SectionGap),
        )
    }
}

/** Sheet body, split out so it previews without a sheet host. */
@Composable
fun ExerciseDetailBody(
    detail: ExerciseDetail,
    modifier: Modifier = Modifier,
) {
    val exercise = detail.exercise
    val images = ExerciseAttribution.images(detail.media)
    val credits = ExerciseAttribution.mediaCredits(detail.media)
    val aiGenerated = ExerciseAttribution.isAiGenerated(exercise, detail.media)
    val fallbackEquipment = exercise.equipment.firstOrNull() ?: Equipment.NONE

    Column(modifier = modifier.fillMaxWidth()) {
        Text(
            text = exercise.name.uppercase(),
            style = MaterialTheme.typography.headlineMedium,
            color = MaterialTheme.colorScheme.onSurface,
        )

        when {
            images.isEmpty() -> ExercisePlaceholder(
                equipment = fallbackEquipment,
                modifier = Modifier
                    .padding(top = AzfSpacing.ElementGapMedium)
                    .fillMaxWidth()
                    .aspectRatio(16f / 9f),
            )

            images.size == 1 -> ExerciseMediaImage(
                media = images.first(),
                exerciseName = exercise.name,
                equipment = fallbackEquipment,
                modifier = Modifier
                    .padding(top = AzfSpacing.ElementGapMedium)
                    .fillMaxWidth()
                    .aspectRatio(16f / 9f),
            )

            else -> LazyRow(
                modifier = Modifier.padding(top = AzfSpacing.ElementGapMedium),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                contentPadding = PaddingValues(end = 4.dp),
            ) {
                items(images, key = { it.rowId }) { media ->
                    ExerciseMediaImage(
                        media = media,
                        exerciseName = exercise.name,
                        equipment = fallbackEquipment,
                        modifier = Modifier
                            .width(240.dp)
                            .aspectRatio(16f / 9f),
                    )
                }
            }
        }

        if (aiGenerated) {
            Row(
                modifier = Modifier.padding(top = AzfSpacing.ElementGapSmall),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    imageVector = Icons.Outlined.AutoAwesome,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(14.dp),
                )
                Text(
                    text = stringResource(R.string.attribution_ai_media),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(start = 6.dp),
                )
            }
        }

        if (exercise.description.isNotBlank()) {
            Text(
                text = exercise.description,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.padding(top = AzfSpacing.ElementGapMedium),
            )
        }

        if (exercise.primaryMuscles.isNotEmpty() || exercise.secondaryMuscles.isNotEmpty()) {
            SectionLabel(
                text = stringResource(R.string.training_muscles),
                modifier = Modifier.padding(top = AzfSpacing.ElementGapMedium),
            )
            TagFlow(
                primary = exercise.primaryMuscles,
                secondary = exercise.secondaryMuscles,
            )
        }

        if (exercise.equipment.isNotEmpty()) {
            SectionLabel(
                text = stringResource(R.string.training_equipment),
                modifier = Modifier.padding(top = AzfSpacing.ElementGapMedium),
            )
            Row(
                modifier = Modifier.padding(top = AzfSpacing.ElementGapSmall),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                exercise.equipment.take(MAX_EQUIPMENT_ROW).forEach { eq ->
                    EquipmentTag(equipment = eq)
                }
            }
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = AzfSpacing.ElementGapMedium),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                text = stringResource(
                    R.string.training_difficulty,
                    exercise.difficulty.name.lowercase().replaceFirstChar { it.uppercase() },
                ),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                text = exercise.category.replaceFirstChar { it.uppercase() },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        HorizontalDivider(
            modifier = Modifier.padding(top = AzfSpacing.ElementGapMedium),
            color = MaterialTheme.colorScheme.outlineVariant,
        )
        AttributionBlock(
            exercise = exercise,
            credits = credits,
            modifier = Modifier.padding(top = 12.dp),
        )
    }
}

/**
 * The attribution block. Renders the per-image credits (when the media
 * carries provenance) above the exercise-level credit, which is never
 * omitted while the record carries licence metadata.
 */
@Composable
fun AttributionBlock(
    exercise: ExerciseDto,
    credits: List<ExerciseAttribution.MediaCredit>,
    modifier: Modifier = Modifier,
) {
    val label = stringResource(R.string.attribution_label)
    Column(
        modifier = modifier
            .fillMaxWidth()
            .semantics { contentDescription = label },
    ) {
        credits.forEach { credit ->
            val text = if (credit.licenceUrl != null) {
                stringResource(
                    R.string.attribution_image_via,
                    credit.text,
                    if (credit.source == SOURCE_WGER) WGER_HOST else credit.licenceUrl,
                )
            } else {
                stringResource(R.string.attribution_image, credit.text)
            }
            Text(
                text = text,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(bottom = 2.dp),
            )
        }
        val exerciseCredit = ExerciseAttribution.exerciseCredit(
            licenceAuthor = exercise.licenceAuthor,
            licence = exercise.licence,
        )
        if (exerciseCredit != null) {
            Text(
                text = if (ExerciseAttribution.viaWger(exercise)) {
                    stringResource(
                        R.string.attribution_exercise_data_via,
                        exercise.licenceAuthor,
                        exercise.licence,
                    )
                } else {
                    stringResource(
                        R.string.attribution_exercise_data,
                        exercise.licenceAuthor,
                        exercise.licence,
                    )
                },
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

/** Media image with a silent icon fallback when the URL cannot be loaded. */
@Composable
private fun ExerciseMediaImage(
    media: ExerciseMediaEntity,
    exerciseName: String,
    equipment: Equipment,
    modifier: Modifier = Modifier,
) {
    val description = media.caption
        ?: stringResource(R.string.attribution_demonstration, exerciseName)
    SubcomposeAsyncImage(
        model = ExerciseAttribution.mediaUrl(media.url),
        contentDescription = description,
        contentScale = ContentScale.Crop,
        modifier = modifier.clip(AzfShapes.Card),
        loading = { ExercisePlaceholder(equipment = equipment, modifier = Modifier.fillMaxWidth()) },
        error = { ExercisePlaceholder(equipment = equipment, modifier = Modifier.fillMaxWidth()) },
    )
}

/**
 * Media placeholder. Decorative by definition — the exercise name is already
 * announced next to it, so the glyph is hidden from assistive tech.
 */
@Composable
fun ExercisePlaceholder(
    equipment: Equipment,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .clip(AzfShapes.Card)
            .background(MaterialTheme.colorScheme.surfaceContainerHigh)
            .clearAndSetSemantics { },
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = equipmentIcon(equipment),
            contentDescription = null,
            tint = LocalAzfExtended.current.primaryFixedDim.copy(alpha = 0.6f),
            modifier = Modifier.size(32.dp),
        )
    }
}

@Composable
private fun SectionLabel(text: String, modifier: Modifier = Modifier) {
    Text(
        text = text.uppercase(),
        style = MaterialTheme.typography.labelSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = modifier,
    )
}

@Composable
private fun TagFlow(primary: List<String>, secondary: List<String>) {
    Row(
        modifier = Modifier.padding(top = AzfSpacing.ElementGapSmall),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        primary.take(MAX_TAGS).forEach { muscle -> MuscleTag(text = muscle, primary = true) }
        secondary.take(MAX_TAGS - primary.size.coerceAtMost(MAX_TAGS)).forEach { muscle ->
            MuscleTag(text = muscle, primary = false)
        }
    }
}

@Composable
private fun MuscleTag(text: String, primary: Boolean) {
    val accent = LocalAzfExtended.current.primaryFixedDim
    Text(
        text = text.replaceFirstChar { it.uppercase() },
        style = MaterialTheme.typography.labelMedium,
        color = if (primary) accent else MaterialTheme.colorScheme.onSurfaceVariant,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        modifier = Modifier
            .clip(AzfShapes.Pill)
            .border(
                BorderStroke(
                    1.dp,
                    if (primary) accent.copy(alpha = 0.5f) else MaterialTheme.colorScheme.outlineVariant,
                ),
                AzfShapes.Pill,
            )
            .padding(horizontal = 10.dp, vertical = 4.dp),
    )
}

@Composable
private fun EquipmentTag(equipment: Equipment) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .clip(AzfShapes.Pill)
            .background(MaterialTheme.colorScheme.surfaceContainerHigh)
            .padding(horizontal = 10.dp, vertical = 4.dp),
    ) {
        Icon(
            imageVector = equipmentIcon(equipment),
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(14.dp),
        )
        Text(
            text = stringResource(equipmentLabelRes(equipment)),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(start = 6.dp),
        )
    }
}

private const val MAX_TAGS = 4
private const val MAX_EQUIPMENT_ROW = 3
private const val SOURCE_WGER = "wger"
private const val WGER_HOST = "wger.de"

@Preview(showBackground = true, backgroundColor = 0xFF0E1416)
@Composable
private fun ExerciseDetailBodyPreview() {
    AzfTheme {
        Box(modifier = Modifier.background(AzfColors.Background)) {
            AzfCard(tier = AzfCardTier.Standard, modifier = Modifier.padding(8.dp)) {
                ExerciseDetailBody(
                    detail = ExerciseDetail(
                        exercise = ExerciseDto(
                            id = "ex_bench",
                            name = "Barbell bench press",
                            description = "Controlled eccentric, explosive drive off the chest.",
                            category = "strength",
                            primaryMuscles = listOf("chest"),
                            secondaryMuscles = listOf("triceps", "shoulders"),
                            equipment = listOf(Equipment.BARBELL, Equipment.BENCH),
                            licence = "CC-BY-SA 4.0",
                            licenceAuthor = "wger contributors",
                            wgerUuid = "abc-123",
                        ),
                        media = emptyList(),
                    ),
                )
            }
        }
    }
}
