package fit.aquazero.app.feature.training

import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasScrollToNodeAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import fit.aquazero.app.R
import fit.aquazero.app.core.data.CatalogRepository
import fit.aquazero.app.core.data.PlansRepository
import fit.aquazero.app.core.database.AzfDatabase
import fit.aquazero.app.core.database.createInMemoryDatabase
import fit.aquazero.app.core.designsystem.AzfTheme
import fit.aquazero.app.core.model.Equipment
import fit.aquazero.app.core.model.ExerciseDto
import fit.aquazero.app.core.model.ExerciseExperience
import fit.aquazero.app.core.model.ExerciseMediaDto
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The Workouts tab, rendered for real.
 *
 * Nothing here is a fake screen: the composable is the shipped one, the
 * `WorkoutLibraryViewModel` is the shipped one, both repositories are the
 * shipped ones, and the exercise rows are read back out of a real Room
 * database that a real catalog refresh wrote. Only the two Retrofit interfaces
 * at the network edge are replaced, so no socket is opened.
 *
 * What it catches that the JVM suite cannot: the screen failing to render at
 * all. `WorkoutLibraryViewModelTest` asserts over `uiState`; a state object can
 * be perfect while the composable that reads it throws, draws an empty list,
 * or drops the attribution line the CC-BY-SA licence obliges us to show on
 * every card.
 *
 * The view model is driven to a settled state *before* `setContent`. That is
 * not impatience — while any of the three loading flags is true the screen
 * shows `Skeleton`, whose shimmer is an `infiniteRepeatable`, and Compose's
 * idle synchronisation never returns while one is composed.
 */
@RunWith(AndroidJUnit4::class)
class WorkoutLibraryScreenTest {

    @get:Rule
    val composeRule = createComposeRule()

    private lateinit var db: AzfDatabase

    @After
    fun close() {
        if (::db.isInitialized) db.close()
    }

    @Test
    fun everyCachedExerciseGetsARowAndEveryRowCarriesItsAttribution() {
        val viewModel = libraryViewModel(corpus = listOf(BENCH, TREADMILL))
        val settled = viewModel.awaitLoaded(exerciseCount = 2)
        composeRule.setContent { AzfTheme { WorkoutLibraryScreen(viewModel = viewModel) } }

        scrollTo(hasText(BENCH.name))
        composeRule.onNodeWithText(BENCH.name).assertIsDisplayed()

        scrollTo(hasText(TREADMILL.name))
        composeRule.onNodeWithText(TREADMILL.name).assertIsDisplayed()

        // The credit is part of the card by construction — one per row, not
        // one per screen. A refactor that dropped it would leave the list
        // looking correct and the app in breach of the licence the corpus
        // ships under, so the count is what is asserted.
        val credit = "© ${BENCH.licenceAuthor}, ${BENCH.licence}"
        composeRule.onAllNodes(hasText(credit)).assertCountEquals(2)

        // The header count is the pager denominator, not the visible count.
        scrollTo(hasText(string(R.string.training_library_count, settled.totalMatches)))
        composeRule.onNodeWithText(string(R.string.training_library_count, 2)).assertIsDisplayed()
    }

    @Test
    fun aCategoryChipFiltersTheListDownToItsCategory() {
        val viewModel = libraryViewModel(corpus = listOf(BENCH, TREADMILL))
        viewModel.awaitLoaded(exerciseCount = 2)
        composeRule.setContent { AzfTheme { WorkoutLibraryScreen(viewModel = viewModel) } }

        scrollTo(hasText(string(R.string.category_cardio)))
        composeRule.onNodeWithText(string(R.string.category_cardio)).performClick()

        // Filtering happens in Room + in memory, never over the network, so it
        // has to keep working on a device with no connection.
        viewModel.awaitLoaded(exerciseCount = 1)
        composeRule.waitForIdle()
        scrollTo(hasText(TREADMILL.name))
        composeRule.onNodeWithText(TREADMILL.name).assertIsDisplayed()
        composeRule.onAllNodes(hasText(BENCH.name)).assertCountEquals(0)
    }

    @Test
    fun aSearchWithNoMatchesShowsTheNoResultsStateRatherThanAnEmptyList() {
        val viewModel = libraryViewModel(corpus = listOf(BENCH, TREADMILL))
        viewModel.awaitLoaded(exerciseCount = 2)
        composeRule.setContent { AzfTheme { WorkoutLibraryScreen(viewModel = viewModel) } }

        scrollTo(hasText(string(R.string.training_search_hint)))
        composeRule.onNodeWithText(string(R.string.training_search_hint)).performTextInput("zzzz")

        // A blank area is indistinguishable from a broken screen; the empty
        // state is the only thing that tells the user their filter is the
        // reason nothing is listed.
        viewModel.awaitLoaded(exerciseCount = 0)
        composeRule.waitForIdle()
        val title = string(R.string.training_no_results_title).uppercase()
        scrollTo(hasText(title))
        composeRule.onNodeWithText(title).assertIsDisplayed()
    }

    @Test
    fun tappingARowOpensTheDetailSheet() {
        val viewModel = libraryViewModel(corpus = listOf(BENCH))
        viewModel.awaitLoaded(exerciseCount = 1)
        composeRule.setContent { AzfTheme { WorkoutLibraryScreen(viewModel = viewModel) } }

        scrollTo(hasText(BENCH.name))
        composeRule.onNodeWithText(BENCH.name).performClick()

        // The sheet decodes the cached `docJson` rather than re-fetching, so
        // this also proves the document survived the round trip into Room.
        composeRule.waitUntil(TIMEOUT_MS) {
            composeRule.onAllNodes(hasText(BENCH.name.uppercase())).fetchSemanticsNodes().isNotEmpty()
        }
        composeRule.onNodeWithText(BENCH.description).assertIsDisplayed()
    }

    @Test
    fun anOfflineFirstRunOffersToDownloadTheLibraryInsteadOfLookingBroken() {
        // Nothing cached and no network: the honest state, and the one a user
        // hits on a first launch in a tunnel.
        val viewModel = libraryViewModel(corpus = null)
        viewModel.awaitLoaded(exerciseCount = 0)
        composeRule.setContent { AzfTheme { WorkoutLibraryScreen(viewModel = viewModel) } }

        val title = string(R.string.training_catalog_empty_title).uppercase()
        scrollTo(hasText(title))
        composeRule.onNodeWithText(title).assertIsDisplayed()
    }

    @Test
    fun withNoPlanTheStripOffersToGenerateOne() {
        val viewModel = libraryViewModel(corpus = listOf(BENCH))
        viewModel.awaitLoaded(exerciseCount = 1)
        composeRule.setContent { AzfTheme { WorkoutLibraryScreen(viewModel = viewModel) } }

        // A 404 from `/plans/current` is "no plan yet", not an error — the
        // difference between an invitation and a wall of red.
        val title = string(R.string.training_plan_empty_title).uppercase()
        composeRule.onNodeWithText(title).assertIsDisplayed()
        composeRule.onNodeWithText(string(R.string.training_generate_plan)).assertIsDisplayed()
    }

    // -----------------------------------------------------------------------
    // Harness
    // -----------------------------------------------------------------------

    /**
     * A real view model over real repositories over a real database, with only
     * the Retrofit interfaces faked.
     */
    private fun libraryViewModel(corpus: List<ExerciseDto>?): WorkoutLibraryViewModel {
        db = createInMemoryDatabase()
        val catalog = CatalogRepository(
            catalogDao = db.catalogDao(),
            foodsApi = FakeFoodsApi(),
            exercisesApi = FakeExercisesApi(corpus = corpus),
            recipesApi = FakeRecipesApi(),
        )
        val plans = PlansRepository(
            plansApi = FakePlansApi(plan = null),
            workoutsApi = FakeWorkoutsApi(todayEnvelope = null),
            trainingDao = db.trainingDao(),
        )
        return WorkoutLibraryViewModel(plansRepository = plans, catalogRepository = catalog)
    }

    /**
     * Wait for the view model to reach a fully loaded state.
     *
     * A condition, not a sleep: the refresh coroutines and the Room flows land
     * when they land, and the test proceeds on the state it asked for or fails
     * the timeout.
     */
    private fun WorkoutLibraryViewModel.awaitLoaded(exerciseCount: Int): WorkoutLibraryUiState =
        runBlocking {
            withTimeout(TIMEOUT_MS) {
                uiState.first { state ->
                    !state.loadingPlan &&
                        !state.loadingToday &&
                        !state.loadingLibrary &&
                        state.exercises.size == exerciseCount
                }
            }
        }

    /**
     * Scroll the screen's `LazyColumn` until [matcher] is composed.
     *
     * `onFirst` is the outer list: the only other scrollables are the filter
     * chip rows, which are its descendants and therefore come later in
     * semantics traversal order.
     */
    private fun scrollTo(matcher: SemanticsMatcher) {
        composeRule.onAllNodes(hasScrollToNodeAction()).onFirst().performScrollToNode(matcher)
    }

    private fun string(resId: Int, vararg args: Any): String {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        return if (args.isEmpty()) context.getString(resId) else context.getString(resId, *args)
    }

    private companion object {
        const val TIMEOUT_MS = 10_000L

        val BENCH = ExerciseDto(
            id = "ex_bench",
            name = "Barbell bench press",
            description = "Press the bar from the chest to full extension.",
            category = "strength",
            primaryMuscles = listOf("chest"),
            equipment = listOf(Equipment.BARBELL, Equipment.BENCH),
            difficulty = ExerciseExperience.INTERMEDIATE,
            media = listOf(
                ExerciseMediaDto(kind = "image", url = "/media/exercises/bench.png"),
            ),
            licence = "CC-BY-SA 4.0",
            licenceAuthor = "wger contributors",
        )

        val TREADMILL = ExerciseDto(
            id = "ex_treadmill",
            name = "Treadmill intervals",
            description = "Alternate one minute hard with two minutes easy.",
            category = "cardio",
            primaryMuscles = listOf("quadriceps"),
            equipment = emptyList(),
            difficulty = ExerciseExperience.BEGINNER,
            licence = "CC-BY-SA 4.0",
            licenceAuthor = "wger contributors",
        )
    }
}
