package fit.aquazero.app.core.data

import fit.aquazero.app.core.database.CatalogDao
import fit.aquazero.app.core.database.ExerciseCatalogDao
import fit.aquazero.app.core.database.ExerciseEntity
import fit.aquazero.app.core.database.ExerciseMediaEntity
import fit.aquazero.app.core.database.ExerciseThumbnail
import fit.aquazero.app.core.database.FoodEntity
import fit.aquazero.app.core.database.RecipeEntity
import fit.aquazero.app.core.model.ApiResult
import fit.aquazero.app.core.model.AzfJson
import fit.aquazero.app.core.model.ExerciseDto
import fit.aquazero.app.core.model.FoodDto
import fit.aquazero.app.core.model.RecipeDto
import fit.aquazero.app.core.model.getOrNull
import fit.aquazero.app.core.model.map
import fit.aquazero.app.core.network.api.ExercisesApi
import fit.aquazero.app.core.network.api.FoodsApi
import fit.aquazero.app.core.network.api.RecipesApi
import fit.aquazero.app.core.network.safeCall
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Catalog access (plan §4.1): foods search stays server-side with a
 * recent/frequent offline cache; exercises bulk-cache through the paged
 * envelope (ALWAYS with limit/offset — the bare route is a legacy array);
 * recipes cache wholesale.
 */
@Singleton
class CatalogRepository @Inject constructor(
    private val catalogDao: CatalogDao,
    private val exerciseCatalogDao: ExerciseCatalogDao,
    private val foodsApi: FoodsApi,
    private val exercisesApi: ExercisesApi,
    private val recipesApi: RecipesApi,
) {

    // ----- foods -----

    /** Recently used foods for the offline search sheet. */
    fun recentFoods(limit: Int = 30): Flow<List<FoodEntity>> = catalogDao.recentFoods(limit)

    /**
     * Server-side food search; hits Room's recent/frequent cache when the
     * network fails. Successful results are folded into the cache.
     */
    suspend fun searchFoods(query: String, limit: Int = 25): List<FoodDto> {
        val result = safeCall { foodsApi.search(search = query, limit = limit) }
        return when (result) {
            is ApiResult.Success -> {
                val items = result.data.items
                catalogDao.upsertFoods(items.map { it.toEntity() })
                items
            }
            is ApiResult.Failure ->
                catalogDao.searchCachedFoods(query, limit).mapNotNull { it.decode() }
        }
    }

    /** Record a food as used (feeds the recent/frequent cache policy). */
    suspend fun touchFood(foodId: String) =
        catalogDao.touchFood(foodId, System.currentTimeMillis())

    /** Barcode lookup — online-only (OFF mirror + live fallback). */
    suspend fun lookupBarcode(code: String) = safeCall { foodsApi.barcode(code) }

    // ----- exercises -----

    /** Local page of the exercise library (offline browsing). */
    fun exercisesPage(
        query: String = "",
        category: String? = null,
        muscle: String? = null,
        equipment: String? = null,
        limit: Int = 50,
        offset: Int = 0,
    ): Flow<List<ExerciseEntity>> =
        exerciseCatalogDao.exercisesPage(query, category, muscle, equipment, limit, offset)

    /** Total rows matching the same filters, for the list's "load more" cue. */
    fun exercisesMatching(
        query: String = "",
        category: String? = null,
        muscle: String? = null,
        equipment: String? = null,
    ): Flow<Int> = exerciseCatalogDao.exercisesMatching(query, category, muscle, equipment)

    /** Cached exercise + media for the detail sheet. */
    suspend fun exerciseWithMedia(id: String): Pair<ExerciseEntity, List<ExerciseMediaEntity>>? {
        val exercise = exerciseCatalogDao.exerciseById(id) ?: return null
        return exercise to exerciseCatalogDao.mediaFor(id)
    }

    /**
     * Thumbnails for the exercises currently on screen, keyed by exercise id.
     *
     * Still id-scoped rather than folded into [exercisesPage] as a join, but
     * for a different reason now that the page query returns only what is on
     * screen: one exercise can carry several media rows, so joining would
     * multiply the page out into duplicate exercise rows that the caller would
     * have to collapse again. A second keyed read is the simpler shape.
     */
    suspend fun exerciseThumbnails(ids: List<String>): Map<String, ExerciseThumbnail> =
        if (ids.isEmpty()) {
            emptyMap()
        } else {
            exerciseCatalogDao.thumbnailsFor(ids).associateBy { it.exerciseId }
        }

    /**
     * Bulk-refresh the whole exercise catalog through the paged envelope
     * (a few pages cover the corpus; plan §4.1). Returns pages fetched.
     */
    suspend fun refreshExercises(pageSize: Int = 200): ApiResult<Int> {
        // One stamp for the whole pass, taken before the first request. Every
        // row this refresh touches carries it, so "older than this" is exactly
        // "the server did not send it this time" — see pruneExercisesStaleBefore.
        // Reading the clock per row instead would make the boundary a moving
        // target and prune rows the same pass had just written.
        val generation = System.currentTimeMillis()
        var offset = 0
        var pages = 0
        while (true) {
            val page = safeCall { exercisesApi.exercises(limit = pageSize, offset = offset) }
            when (page) {
                is ApiResult.Failure -> return if (pages > 0) ApiResult.Success(pages) else page
                is ApiResult.Success -> {
                    val items = page.data.items
                    exerciseCatalogDao.replaceExercises(
                        exercises = items.map { it.toEntity(generation) },
                        media = items.flatMap { dto -> dto.media.map { it.toEntity(dto.id) } },
                    )
                    pages++
                    offset += pageSize
                    if (offset >= page.data.total || items.isEmpty()) {
                        // Only after a pass that ran to completion. A refresh
                        // that gave up part-way (the Failure branch above
                        // returns early) has seen only a prefix of the corpus,
                        // and pruning on it would delete every exercise the
                        // pages it never fetched would have refreshed.
                        exerciseCatalogDao.pruneExercisesStaleBefore(generation)
                        return ApiResult.Success(pages)
                    }
                }
            }
        }
    }

    // ----- recipes -----

    /** Cached recipes for offline browsing. */
    fun recipes(): Flow<List<RecipeEntity>> = catalogDao.recipes()

    /** Wholesale recipe refresh (small corpus). */
    suspend fun refreshRecipes(): ApiResult<Int> =
        safeCall { recipesApi.recipes(limit = 100) }.map { response ->
            response.items
        }.also { result ->
            result.getOrNull()?.let { items ->
                catalogDao.upsertRecipes(items.map { it.toEntity() })
            }
        }.map { it.size }

    /** Recipe detail: cache first, network fallback. */
    suspend fun recipe(id: String): RecipeDto? {
        catalogDao.recipeById(id)?.decodeRecipe()?.let { return it }
        return safeCall { recipesApi.recipe(id) }.getOrNull()?.recipe
    }

    // ----- mapping -----

    private fun FoodDto.toEntity(): FoodEntity = FoodEntity(
        id = id,
        name = name,
        brand = brand,
        category = category,
        barcode = barcode,
        kcalPer100g = per100g.kcal,
        docJson = AzfJson.encodeToString(FoodDto.serializer(), this),
        cachedAt = System.currentTimeMillis(),
    )

    private fun FoodEntity.decode(): FoodDto? =
        runCatching { AzfJson.decodeFromString(FoodDto.serializer(), docJson) }.getOrNull()

    /**
     * [generation] is the refresh pass's stamp, not "now": it is what makes the
     * retired-row prune able to tell this pass's rows from the previous one's.
     */
    private fun ExerciseDto.toEntity(generation: Long): ExerciseEntity = ExerciseEntity(
        id = id,
        name = name,
        category = category,
        difficulty = difficultyName(),
        primaryMusclesCsv = primaryMuscles.joinToString(","),
        equipmentCsv = equipment.joinToString(",") { it.name },
        licence = licence,
        licenceAuthor = licenceAuthor,
        docJson = AzfJson.encodeToString(ExerciseDto.serializer(), this),
        cachedAt = generation,
    )

    private fun ExerciseDto.difficultyName(): String = when (difficulty) {
        fit.aquazero.app.core.model.ExerciseExperience.BEGINNER -> "beginner"
        fit.aquazero.app.core.model.ExerciseExperience.INTERMEDIATE -> "intermediate"
        fit.aquazero.app.core.model.ExerciseExperience.ADVANCED -> "advanced"
    }

    private fun fit.aquazero.app.core.model.ExerciseMediaDto.toEntity(
        exerciseId: String,
    ): ExerciseMediaEntity = ExerciseMediaEntity(
        exerciseId = exerciseId,
        kind = kind,
        url = url,
        caption = caption,
        source = source,
        licence = licence,
        licenceAuthor = licenceAuthor,
        licenceUrl = licenceUrl,
        attributionText = attributionText,
        isAiGenerated = isAiGenerated ?: false,
    )

    private fun RecipeEntity.decodeRecipe(): RecipeDto? =
        runCatching { AzfJson.decodeFromString(RecipeDto.serializer(), docJson) }.getOrNull()

    private fun RecipeDto.toEntity(): RecipeEntity = RecipeEntity(
        id = id,
        name = name,
        tagsCsv = tags.joinToString(","),
        docJson = AzfJson.encodeToString(RecipeDto.serializer(), this),
        cachedAt = System.currentTimeMillis(),
    )
}
