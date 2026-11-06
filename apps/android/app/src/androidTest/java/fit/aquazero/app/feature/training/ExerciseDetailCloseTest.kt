package fit.aquazero.app.feature.training

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import fit.aquazero.app.R
import fit.aquazero.app.core.designsystem.AzfTheme
import fit.aquazero.app.core.model.Equipment
import fit.aquazero.app.core.model.ExerciseDto
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/** Every sheet closes the same way: an X at top-end labelled "Close". */
@RunWith(AndroidJUnit4::class)
class ExerciseDetailCloseTest {

    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun closeButtonIsLabelledAndDismisses() {
        var closed = false
        val detail = ExerciseDetail(
            exercise = ExerciseDto(
                id = "ex_bench",
                name = "Barbell bench press",
                description = "",
                category = "strength",
                primaryMuscles = listOf("chest"),
                equipment = listOf(Equipment.BARBELL),
                licence = "CC-BY-SA 4.0",
                licenceAuthor = "wger contributors",
            ),
            media = emptyList(),
        )
        composeRule.setContent {
            AzfTheme { ExerciseDetailBody(detail = detail, onClose = { closed = true }) }
        }

        val label = InstrumentationRegistry.getInstrumentation().targetContext
            .getString(R.string.action_close)
        composeRule.onNodeWithContentDescription(label).performClick()

        assertTrue(closed)
    }
}
