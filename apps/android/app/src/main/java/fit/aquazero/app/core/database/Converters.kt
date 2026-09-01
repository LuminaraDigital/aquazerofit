package fit.aquazero.app.core.database

import androidx.room3.ColumnTypeConverter
import fit.aquazero.app.core.model.AzfJson
import fit.aquazero.app.core.model.MealLogItemDto
import kotlinx.serialization.builtins.ListSerializer

/**
 * Room type converters. Structured payloads (meal items) are
 * stored as JSON text using the same tolerant [AzfJson] as the wire, so a
 * cached document round-trips byte-compatibly with the API contract.
 */
class Converters {

    @ColumnTypeConverter
    fun mealItemsToJson(value: List<MealLogItemDto>?): String? =
        value?.let { AzfJson.encodeToString(ListSerializer(MealLogItemDto.serializer()), it) }

    @ColumnTypeConverter
    fun jsonToMealItems(value: String?): List<MealLogItemDto>? = value?.let {
        runCatching {
            AzfJson.decodeFromString(ListSerializer(MealLogItemDto.serializer()), it)
        }.getOrNull()
    }
}
