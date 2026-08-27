package fit.aquazero.app.feature.coach

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The grammar is bold and bullets. These tests are as much a boundary as a
 * behaviour check: anything that starts passing here for headings, links or
 * images means the renderer grew a construct model output can aim at.
 */
class MiniMarkdownTest {

    @Test
    fun `plain text is one paragraph`() {
        val blocks = MiniMarkdown.parse("Two eggs and toast.")
        assertEquals(1, blocks.size)
        val paragraph = blocks.single() as MdBlock.Paragraph
        assertEquals(listOf(MdSpan("Two eggs and toast.", false)), paragraph.spans)
    }

    @Test
    fun `bold runs are split out and the markers are consumed`() {
        val spans = MiniMarkdown.inline("You banked **1,480 kcal** today.")
        assertEquals(
            listOf(
                MdSpan("You banked ", false),
                MdSpan("1,480 kcal", true),
                MdSpan(" today.", false),
            ),
            spans,
        )
    }

    @Test
    fun `an unclosed marker stays literal rather than being swallowed`() {
        val spans = MiniMarkdown.inline("A **dangling marker")
        assertEquals(listOf(MdSpan("A **dangling marker", false)), spans)
    }

    @Test
    fun `bold matching is non-greedy across two runs`() {
        val spans = MiniMarkdown.inline("**one** and **two**")
        assertEquals(
            listOf(
                MdSpan("one", true),
                MdSpan(" and ", false),
                MdSpan("two", true),
            ),
            spans,
        )
    }

    @Test
    fun `dash asterisk and bullet all open a list`() {
        listOf("- item", "* item", "• item").forEach { line ->
            val blocks = MiniMarkdown.parse(line)
            val bullets = blocks.single() as MdBlock.Bullets
            assertEquals(listOf(listOf(MdSpan("item", false))), bullets.items)
        }
    }

    @Test
    fun `adjacent bullets collapse into one list`() {
        val blocks = MiniMarkdown.parse("- one\n- two\n- three")
        val bullets = blocks.single() as MdBlock.Bullets
        assertEquals(3, bullets.items.size)
    }

    @Test
    fun `consecutive lines join into one paragraph with single spaces`() {
        val blocks = MiniMarkdown.parse("first line\n   second line  ")
        val paragraph = blocks.single() as MdBlock.Paragraph
        assertEquals("first line second line", paragraph.spans.joinToString("") { it.text })
    }

    @Test
    fun `a blank line closes the open block`() {
        val blocks = MiniMarkdown.parse("intro\n\n- a\n- b\n\noutro")
        assertEquals(3, blocks.size)
        assertTrue(blocks[0] is MdBlock.Paragraph)
        assertTrue(blocks[1] is MdBlock.Bullets)
        assertTrue(blocks[2] is MdBlock.Paragraph)
    }

    @Test
    fun `a paragraph after a list does not merge into it`() {
        val blocks = MiniMarkdown.parse("- a\nnot a bullet")
        assertEquals(2, blocks.size)
        assertTrue(blocks[0] is MdBlock.Bullets)
        assertTrue(blocks[1] is MdBlock.Paragraph)
    }

    @Test
    fun `bold works inside a bullet`() {
        val blocks = MiniMarkdown.parse("- eat **more protein**")
        val bullets = blocks.single() as MdBlock.Bullets
        assertEquals(
            listOf(MdSpan("eat ", false), MdSpan("more protein", true)),
            bullets.items.single(),
        )
    }

    @Test
    fun `headings links and images are never parsed as markup`() {
        val source = "# Heading\n[link](https://example.com)\n![img](x.png)\n`code`"
        val blocks = MiniMarkdown.parse(source)
        // All four lines collapse into one paragraph of literal characters.
        assertEquals(1, blocks.size)
        val text = (blocks.single() as MdBlock.Paragraph).spans.joinToString("") { it.text }
        assertTrue(text.contains("# Heading"))
        assertTrue(text.contains("[link](https://example.com)"))
        assertTrue(text.contains("![img](x.png)"))
        assertTrue(text.contains("`code`"))
    }

    @Test
    fun `empty input produces no blocks`() {
        assertTrue(MiniMarkdown.parse("").isEmpty())
        assertTrue(MiniMarkdown.parse("\n\n  \n").isEmpty())
    }

    @Test
    fun `tool identifiers humanise rather than leaking camel case`() {
        assertEquals("Today nutrition", humaniseTool("getTodayNutrition"))
        assertEquals("Current plan", humaniseTool("getCurrentPlan"))
        assertEquals("Something new", humaniseTool("somethingNew"))
    }
}
