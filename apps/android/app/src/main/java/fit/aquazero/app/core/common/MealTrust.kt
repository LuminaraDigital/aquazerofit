package fit.aquazero.app.core.common

/** Match confidence band for confirm-first meal UI. */
enum class MatchConfidenceBand {
    HIGH,
    MODERATE,
    LOW,
}

object MealTrust {

    const val FAT_CAUTION_NOTE =
        "Photo and AI estimates often miss cooking oil and sauces. Add fat if needed and confirm portions."

    fun confidenceBandFromScore(score: Int): MatchConfidenceBand = when {
        score >= 80 -> MatchConfidenceBand.HIGH
        score >= 55 -> MatchConfidenceBand.MODERATE
        else -> MatchConfidenceBand.LOW
    }

    fun confidenceBandLabel(band: MatchConfidenceBand): String = when (band) {
        MatchConfidenceBand.HIGH -> "High match"
        MatchConfidenceBand.MODERATE -> "Moderate match"
        MatchConfidenceBand.LOW -> "Low match"
    }

    fun shouldShowFatCaution(itemNames: List<String>, kcal: Double, fatG: Double): Boolean {
        val joined = itemNames.joinToString(" ").lowercase()
        val cue = Regex(
            """\b(fried|deep.?fried|crispy|sauce|gravy|dressing|mayo|butter|oil|cheese|""" +
                """cream|bacon|sausage|curry|stir.?fry|tempura|saut[eé])\b""",
        ).containsMatchIn(joined)
        val fatShare = if (kcal > 0) fatG * 9 / kcal else 0.0
        return cue || fatShare >= 0.45
    }

    data class CookingFatPreset(
        val id: String,
        val label: String,
        val grams: Double,
        val kcal: Double,
        val fatG: Double,
    )

    val cookingFatPresets: List<CookingFatPreset> = listOf(
        CookingFatPreset("tsp-oil", "1 tsp oil", 5.0, 45.0, 5.0),
        CookingFatPreset("tbsp-oil", "1 tbsp oil", 14.0, 126.0, 14.0),
        CookingFatPreset("tbsp-sauce", "1 tbsp sauce", 15.0, 30.0, 2.0),
    )

    fun portionCorrectionWorthRemembering(defaultGrams: Int, confirmedGrams: Int): Boolean {
        if (defaultGrams <= 0 || confirmedGrams <= 0) return false
        val ratio = confirmedGrams.toDouble() / defaultGrams
        return ratio < 0.8 || ratio > 1.2
    }
}
