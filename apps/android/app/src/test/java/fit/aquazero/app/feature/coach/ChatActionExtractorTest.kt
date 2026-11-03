package fit.aquazero.app.feature.coach

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ChatActionExtractorTest {

    @Test
    fun `a no-data reply does not become a food to log`() {
        val actions = ChatActionExtractor.extractActions(
            "I don't have your data for today yet.",
            "m1",
        )
        assertTrue(actions.isEmpty())
    }

    @Test
    fun `prose that names a food is not turned into a log chip`() {
        val actions = ChatActionExtractor.extractActions(
            "Try some Greek yoghurt for 30g protein.",
            "m2",
        )
        assertTrue(actions.none { it is ChatAction.LogMealDraft })
        assertTrue(actions.isEmpty())
    }

    @Test
    fun `an explicit water amount still offers a water chip`() {
        val actions = ChatActionExtractor.extractActions(
            "Grab 250 ml of water before dinner.",
            "m3",
        )
        val water = actions.single() as ChatAction.LogWater
        assertEquals(250, water.amountMl)
    }
}
