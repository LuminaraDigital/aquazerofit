package fit.aquazero.app.feature.fightrecord

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.w3c.dom.Element
import java.io.File
import javax.xml.parsers.DocumentBuilderFactory

/**
 * GR-09 (AZF-W3-05 §2.6): the copy rules, checked against the shipped
 * strings rather than trusted to review.
 *
 * Reads `res/values/strings.xml` straight off disk because there is no
 * Robolectric here, and the file is the artefact that ships. Gradle runs unit
 * tests from the module directory, which is what the relative path assumes.
 */
class FightRecordCopyTest {

    private val strings: Map<String, String> by lazy {
        val file = File("src/main/res/values/strings.xml")
        assertTrue("run from the app module: ${file.absolutePath}", file.exists())
        val doc = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(file)
        val singles = doc.getElementsByTagName("string").elements().map { it.getAttribute("name") to it.textContent }
        val plurals = doc.getElementsByTagName("plurals").elements().flatMap { plural ->
            plural.getElementsByTagName("item").elements().map {
                "${plural.getAttribute("name")}:${it.getAttribute("quantity")}" to it.textContent
            }
        }
        (singles + plurals).filter { (name, _) -> name.startsWith(PREFIX) }.toMap()
    }

    /** Guards the scan itself: a wrong path or prefix would pass the next test vacuously. */
    @Test
    fun `the scan sees the fight record strings`() {
        assertTrue(strings.size > 20)
    }

    @Test
    fun `no fight record string uses a banned word`() {
        val offenders = strings.filter { (_, text) -> BANNED.containsMatchIn(text) }
        assertTrue("banned copy: $offenders", offenders.isEmpty())
    }

    @Test
    fun `the share text carries a belt and a season, never a count of days`() {
        val share = strings.getValue("fight_record_share_text")
        assertFalse(share.contains("day", ignoreCase = true))
        // Belt name, season number, URL: nothing else can be formatted in.
        assertEquals(listOf("%1\$s", "%2\$d", "%3\$s"), PLACEHOLDER.findAll(share).map { it.value }.toList())
    }

    private fun org.w3c.dom.NodeList.elements(): List<Element> = (0 until length).map { item(it) as Element }

    private companion object {
        const val PREFIX = "fight_record_"

        val PLACEHOLDER = Regex("%\\d\\$[a-z]")

        /** §2.7, whole words, any case. */
        val BANNED = Regex(
            "\\b(lost|lose|broken|break|reset|streak|hurry|only|last chance|expires)\\b",
            RegexOption.IGNORE_CASE,
        )
    }
}
