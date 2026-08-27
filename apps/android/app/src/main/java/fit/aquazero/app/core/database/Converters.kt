package fit.aquazero.app.core.database

import androidx.room3.ColumnTypeConverter
import fit.aquazero.app.core.network.AzfJson
import fit.aquazero.app.core.network.dto.MealLogItemDto
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.serializer

/**
 * Room type converters. Structured payloads (meal items, string lists) are
 * stored as JSON text using the same tolerant [AzfJson] as the wire, so a
 * cached document round-trips byte-compatibly with the API contract.
 */
class Converters {

    @ColumnTypeConverter
    fun stringListToJson(value: List<String>?): String? =
        value?.let { AzfJson.encodeToString(ListSerializer(String.serializer()), it) }

    @ColumnTypeConverter
    fun jsonToStringList(value: String?): List<String>? = value?.let {
        runCatching {
            AzfJson.decodeFromString(ListSerializer(String.serializer()), it)
        }.getOrNull()
    }

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
