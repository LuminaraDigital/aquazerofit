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
 * Intelligent parser that extracts actionable triggers from coach conversational responses.
 */
object ChatActionExtractor {

    fun extractActions(text: String, messageId: String): List<ChatAction> {
        val actions = mutableListOf<ChatAction>()

        // 1. Check for water hydration recommendations
        val waterMatch = WATER_REGEX.find(text)
        if (waterMatch != null) {
            val amount = waterMatch.groupValues[1].toIntOrNull() ?: 250
            actions.add(ChatAction.LogWater(id = "water-$messageId-$amount", amountMl = amount))
        }

        // 2. Check for explicit food / snack recommendations
        val snackMatch = SNACK_REGEX.find(text)
        if (snackMatch != null) {
            val foodQuery = snackMatch.groupValues[1].trim()
            if (foodQuery.isNotEmpty() && !foodQuery.equals("water", ignoreCase = true) && foodQuery.length in 4..35) {
                actions.add(ChatAction.LogMealDraft(id = "meal-$messageId-${foodQuery.hashCode()}", query = foodQuery))
            }
        }

        return actions.distinctBy { it.id }.take(2)
    }
}

/**
 * Compiled once, not once per message.
 *
 * `extractActions` runs on every assistant turn, and `Regex(...)` compiles its
 * pattern on construction — so building these inside the function paid for a
 * fresh compile of both patterns on each turn. The snack pattern is joined
 * from three parts because it exceeds the line limit as a single literal; the
 * seams sit between the verb group, the food capture, and the protein tail.
 */
private val WATER_REGEX = Regex(
    "(?i)(?:drink|log|have|grab)\\s*" +
        "(?:a\\s*glass\\s*of\\s*water|(\\d{2,4})\\s*ml\\s*(?:of\\s*)?water)",
)

private val SNACK_REGEX = Regex(
    "(?i)(?:suggest|try|have|eat|snack on|grab)\\s+(?:some\\s+)?" +
        "([A-Za-z0-9\\s]{4,30}?)" +
        "(?:\\s*(?:for|with|to get|around)\\s+(\\d{2,3})\\s*g?\\s*(?:of\\s*)?protein|\\.|,|!)",
)
