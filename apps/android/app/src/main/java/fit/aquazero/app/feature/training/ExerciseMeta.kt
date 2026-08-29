package fit.aquazero.app.feature.training

import androidx.annotation.StringRes
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.DirectionsRun
import androidx.compose.material.icons.filled.FitnessCenter
import androidx.compose.material.icons.outlined.Accessibility
import androidx.compose.material.icons.outlined.Cable
import androidx.compose.material.icons.outlined.FitnessCenter
import androidx.compose.material.icons.outlined.Hexagon
import androidx.compose.material.icons.outlined.SelfImprovement
import androidx.compose.material.icons.outlined.SportsGymnastics
import androidx.compose.material.icons.outlined.SportsMartialArts
import androidx.compose.material.icons.outlined.Straighten
import androidx.compose.material.icons.outlined.TableRows
import androidx.compose.ui.graphics.vector.ImageVector
import fit.aquazero.app.R
import fit.aquazero.app.core.model.Equipment

/** Filter chip vocabularies, mirroring the web library's fixed lists. */
object ExerciseFilters {

    /** Category keys sent to the API (`""` = no filter) with their labels. */
    val categories: List<Pair<String, Int>> = listOf(
        "" to R.string.category_all,
        "strength" to R.string.category_strength,
        "cardio" to R.string.category_cardio,
        "core" to R.string.category_core,
        "mobility" to R.string.category_mobility,
    )

    /** Plan-engine muscle vocabulary; wger imports map onto the same strings. */
    val muscles: List<Pair<String, Int>> = listOf(
        "" to R.string.muscle_all,
        "chest" to R.string.muscle_chest,
        "back" to R.string.muscle_back,
        "shoulders" to R.string.muscle_shoulders,
        "biceps" to R.string.muscle_biceps,
        "triceps" to R.string.muscle_triceps,
        "core" to R.string.muscle_core,
        "glutes" to R.string.muscle_glutes,
        "quadriceps" to R.string.muscle_quadriceps,
        "hamstrings" to R.string.muscle_hamstrings,
        "calves" to R.string.muscle_calves,
    )

    /** Equipment values offered as filters (`none`/bodyweight stays first). */
    val equipment: List<Equipment> = Equipment.entries.toList()
}

/** Human label for an equipment value. */
@StringRes
fun equipmentLabelRes(equipment: Equipment): Int = when (equipment) {
    Equipment.NONE -> R.string.equipment_none
    Equipment.DUMBBELLS -> R.string.equipment_dumbbells
    Equipment.RESISTANCE_BANDS -> R.string.equipment_resistance_bands
    Equipment.KETTLEBELL -> R.string.equipment_kettlebell
    Equipment.PULL_UP_BAR -> R.string.equipment_pull_up_bar
    Equipment.BENCH -> R.string.equipment_bench
    Equipment.YOGA_MAT -> R.string.equipment_yoga_mat
    Equipment.JUMP_ROPE -> R.string.equipment_jump_rope
    Equipment.BARBELL -> R.string.equipment_barbell
    Equipment.EZ_BAR -> R.string.equipment_ez_bar
    Equipment.CABLE_MACHINE -> R.string.equipment_cable_machine
    Equipment.SMITH_MACHINE -> R.string.equipment_smith_machine
    Equipment.SWISS_BALL -> R.string.equipment_swiss_ball
    Equipment.INCLINE_BENCH -> R.string.equipment_incline_bench
}

/** Icon stand-in for an equipment value (also the media placeholder glyph). */
fun equipmentIcon(equipment: Equipment): ImageVector = when (equipment) {
    Equipment.NONE -> Icons.Outlined.SelfImprovement
    Equipment.DUMBBELLS -> Icons.Outlined.FitnessCenter
    Equipment.RESISTANCE_BANDS -> Icons.Outlined.SportsMartialArts
    Equipment.KETTLEBELL -> Icons.Filled.FitnessCenter
    Equipment.PULL_UP_BAR -> Icons.Outlined.SportsGymnastics
    Equipment.BENCH -> Icons.Outlined.TableRows
    Equipment.YOGA_MAT -> Icons.Outlined.Accessibility
    Equipment.JUMP_ROPE -> Icons.AutoMirrored.Outlined.DirectionsRun
    Equipment.BARBELL -> Icons.Outlined.Straighten
    Equipment.EZ_BAR -> Icons.Outlined.Straighten
    Equipment.CABLE_MACHINE -> Icons.Outlined.Cable
    Equipment.SMITH_MACHINE -> Icons.Outlined.Hexagon
    Equipment.SWISS_BALL -> Icons.Outlined.Hexagon
    Equipment.INCLINE_BENCH -> Icons.Outlined.TableRows
}

/** Parse the CSV columns the catalog cache stores for cheap list filtering. */
fun csvValues(csv: String): List<String> =
    csv.split(',').map { it.trim() }.filter { it.isNotEmpty() }

/** Equipment enum values decoded from the cached `equipmentCsv` column. */
fun equipmentFromCsv(csv: String): List<Equipment> =
    csvValues(csv).mapNotNull { name -> Equipment.entries.firstOrNull { it.name == name } }
