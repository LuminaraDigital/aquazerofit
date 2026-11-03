package fit.aquazero.app.feature.coach

/**
 * Interactive 1-tap actionable operations embedded within coach chat turns.
 */
sealed interface ChatAction {
    val id: String
    val label: String
    val iconName: String

    data class LogWater(
        override val id: String,
        val amountMl: Int,
        override val label: String = "+ Log ${amountMl}ml Water",
        override val iconName: String = "water",
    ) : ChatAction

    data class LogMealDraft(
        override val id: String,
        val query: String,
        override val label: String = "+ Log \"$query\"",
        override val iconName: String = "meal",
    ) : ChatAction

    data class QuickLogFood(
        override val id: String,
        val name: String,
        val kcal: Int,
        val proteinGrams: Int,
        override val label: String = "+ Log $name ($kcal kcal)",
        override val iconName: String = "nutrition",
    ) : ChatAction
}

/**
 * Chips under a coach reply.
 *
 * Food chips are not inferred from prose. A reply of "I don't have your data
 * for today yet" was parsed as a meal named "your data for today yet", and
 * tapping it spent a credit on a draft the user never asked to log. Meal
 * logging stays on the composer button. Water stays, and only when the reply
 * names a glass or a millilitre amount.
 */
object ChatActionExtractor {

    fun extractActions(text: String, messageId: String): List<ChatAction> {
        val waterMatch = WATER_REGEX.find(text) ?: return emptyList()
        val amount = waterMatch.groupValues[1].toIntOrNull() ?: 250
        return listOf(ChatAction.LogWater(id = "water-$messageId-$amount", amountMl = amount))
    }
}

/**
 * Compiled once, not once per message. `Regex(...)` compiles on construction,
 * and `extractActions` runs on every assistant turn.
 */
private val WATER_REGEX = Regex(
    "(?i)(?:drink|log|have|grab)\\s*" +
        "(?:a\\s*glass\\s*of\\s*water|(\\d{2,4})\\s*ml\\s*(?:of\\s*)?water)",
)
