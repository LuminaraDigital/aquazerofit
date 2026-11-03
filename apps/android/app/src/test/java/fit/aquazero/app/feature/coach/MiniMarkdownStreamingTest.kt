package fit.aquazero.app.feature.coach

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The streaming-specific half of the markdown contract.
 *
 * `MiniMarkdownText` memoises each block's [annotate] on the block itself, and
 * `humaniseTool` now uses a file-level `Regex` instead of compiling one per
 * call. Neither is allowed to change a single character of what the coach
 * renders, so these tests pin the properties both optimisations stand on:
 *
 * 1. Parsing is deterministic and blocks compare by value, or `remember(block)`
 *    would never hit and the memoisation would be a no-op.
 * 2. Blocks that closed earlier in a turn come back **equal** as later tokens
 *    arrive, which is precisely the work the memo skips.
 * 3. The hoisted regex produces byte-identical output to the inline one.
 */
class MiniMarkdownStreamingTest {

    /** A reply with every construct the grammar has, plus text after the list. */
    private val reply = """
        Good morning — you have banked **1,480 kcal** today.

        Two easy wins before dinner:
        - a **palm-sized** serve of protein
        - 500 ml of water alongside it

        None of this is a target you have to hit.
    """.trimIndent()

    /** Every prefix of [reply], the way tokens actually arrive. */
    private fun prefixes(text: String): List<String> = (1..text.length).map { text.take(it) }

    @Test
    fun `parsing the same text twice yields equal blocks`() {
        val first = MiniMarkdown.parse(reply)
        val second = MiniMarkdown.parse(reply)

        assertEquals(first, second)
        first.zip(second).forEach { (a, b) ->
            assertEquals(a, b)
            assertEquals(a.hashCode(), b.hashCode())
        }
    }

    @Test
    fun `spans compare by value so a block key is stable`() {
        assertEquals(MdSpan("protein", true), MdSpan("protein", true))
        assertEquals(
            MdBlock.Paragraph(listOf(MdSpan("a", false))),
            MdBlock.Paragraph(listOf(MdSpan("a", false))),
        )
        assertEquals(
            MdBlock.Bullets(listOf(listOf(MdSpan("a", false)))),
            MdBlock.Bullets(listOf(listOf(MdSpan("a", false)))),
        )
    }

    @Test
    fun `closed blocks stay equal as later tokens arrive`() {
        var previous = emptyList<MdBlock>()
        var comparisons = 0

        prefixes(reply).forEach { prefix ->
            val blocks = MiniMarkdown.parse(prefix)
            // Only the final block of a prefix is still open; everything before
            // it is finished and must survive the next token untouched.
            val settled = minOf(previous.size, blocks.size) - 1
            for (index in 0 until settled) {
                assertEquals(
                    "block $index changed after appending to \"$prefix\"",
                    previous[index],
                    blocks[index],
                )
                comparisons++
            }
            previous = blocks
        }

        // Guards against the loop above passing because it never ran.
        assertTrue("expected settled blocks to compare", comparisons > 50)
    }

    @Test
    fun `streaming to the end lands exactly on a single parse of the whole reply`() {
        assertEquals(MiniMarkdown.parse(reply), MiniMarkdown.parse(prefixes(reply).last()))
    }

    @Test
    fun `the finished reply renders the text it was given`() {
        val blocks = MiniMarkdown.parse(reply)
        assertEquals(4, blocks.size)

        assertEquals(
            listOf(
                MdSpan("Good morning — you have banked ", false),
                MdSpan("1,480 kcal", true),
                MdSpan(" today.", false),
            ),
            (blocks[0] as MdBlock.Paragraph).spans,
        )
        assertEquals("Two easy wins before dinner:", (blocks[1] as MdBlock.Paragraph).plainText())

        val bullets = blocks[2] as MdBlock.Bullets
        assertEquals(2, bullets.items.size)
        assertEquals("a palm-sized serve of protein", bullets.items[0].joinToString("") { it.text })
        assertEquals("500 ml of water alongside it", bullets.items[1].joinToString("") { it.text })
        assertTrue(bullets.items[0].any { it.bold && it.text == "palm-sized" })

        assertEquals(
            "None of this is a target you have to hit.",
            (blocks[3] as MdBlock.Paragraph).plainText(),
        )
    }

    private fun MdBlock.Paragraph.plainText(): String = spans.joinToString("") { it.text }

    // ------------------------------------------------------------------
    // The hoisted regex
    // ------------------------------------------------------------------

    /** Exactly what `humaniseTool` did before the `Regex` moved to a file `val`. */
    private fun humaniseToolInline(tool: String): String {
        val words = tool
            .removePrefix("get")
            .replace(Regex("([a-z])([A-Z])"), "$1 $2")
            .lowercase()
            .trim()
        return words.replaceFirstChar { it.uppercase() }
    }

    private val toolNames = listOf(
        "getTodayNutrition",
        "getTodayWorkout",
        "getCurrentPlan",
        "getProgressSummary",
        "somethingNew",
        "getBMIReading",
        "getWeek1Summary",
        "already spaced",
        "lowercase",
        "UPPERCASE",
        "get",
        "",
        "getA",
        "getÜberSummary",
    )

    @Test
    fun `the hoisted regex humanises identically to the inline one`() {
        toolNames.forEach { tool ->
            assertEquals("humaniseTool(\"$tool\")", humaniseToolInline(tool), humaniseTool(tool))
        }
    }

    @Test
    fun `a shared regex instance gives the same answer every call`() {
        toolNames.forEach { tool ->
            val expected = humaniseTool(tool)
            repeat(200) { assertEquals(expected, humaniseTool(tool)) }
        }
    }
}
