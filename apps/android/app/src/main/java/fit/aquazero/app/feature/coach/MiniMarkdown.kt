package fit.aquazero.app.feature.coach

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import fit.aquazero.app.core.designsystem.AzfTheme
import fit.aquazero.app.core.designsystem.LocalAzfExtended

/**
 * The deliberately tiny markdown renderer used for assistant turns.
 *
 * **Bold and bullet lists. Nothing else.** This is not a stopgap for a real
 * markdown library — it is the whole feature, and the web client made the same
 * call for the same reason: model output is untrusted text rendered inside the
 * app's own chrome, so the renderer's grammar is also its threat surface. Two
 * constructs cannot carry a link, an image, an iframe, a table that breaks
 * layout, or a heading that impersonates the app's own headings. Anything the
 * model emits outside the grammar renders as the literal characters it typed,
 * which is the correct, boring outcome.
 *
 * The parse is pure and lives apart from the composable so it can be tested
 * on the JVM.
 */

/** One run of text within a block; [bold] is the only inline mark. */
data class MdSpan(val text: String, val bold: Boolean)

/** A parsed block. */
sealed interface MdBlock {
    /** Consecutive non-bullet lines, joined with a single space. */
    data class Paragraph(val spans: List<MdSpan>) : MdBlock

    /** A run of adjacent bullet lines. */
    data class Bullets(val items: List<List<MdSpan>>) : MdBlock
}

object MiniMarkdown {

    /** `**bold**`, non-greedy, at least one character — same shape as the web's. */
    private val BOLD = Regex("""\*\*(.+?)\*\*""")

    /** `- `, `* ` or `• ` at the head of a trimmed line. */
    private val BULLET = Regex("""^[-*•]\s+(.*)$""")

    /**
     * Split [text] into bold/plain runs. Unmatched asterisks stay literal
     * rather than being swallowed: a visible `**` is a legible glitch, a
     * silently eaten one hides that the model produced something odd.
     */
    fun inline(text: String): List<MdSpan> {
        if (text.isEmpty()) return emptyList()
        val spans = mutableListOf<MdSpan>()
        var cursor = 0
        for (match in BOLD.findAll(text)) {
            if (match.range.first > cursor) {
                spans += MdSpan(text.substring(cursor, match.range.first), bold = false)
            }
            spans += MdSpan(match.groupValues[1], bold = true)
            cursor = match.range.last + 1
        }
        if (cursor < text.length) spans += MdSpan(text.substring(cursor), bold = false)
        return spans
    }

    /**
     * Fold [text] into blocks. A blank line closes whatever is open; a bullet
     * closes an open paragraph and vice versa, so the two never interleave.
     */
    fun parse(text: String): List<MdBlock> {
        val blocks = mutableListOf<MdBlock>()
        val list = mutableListOf<String>()
        val para = mutableListOf<String>()

        fun flushList() {
            if (list.isEmpty()) return
            blocks += MdBlock.Bullets(list.map { inline(it) })
            list.clear()
        }

        fun flushPara() {
            if (para.isEmpty()) return
            blocks += MdBlock.Paragraph(inline(para.joinToString(" ")))
            para.clear()
        }

        for (raw in text.split(Regex("\r?\n"))) {
            val line = raw.trim()
            val bullet = BULLET.find(line)
            when {
                bullet != null -> {
                    flushPara()
                    list += bullet.groupValues[1]
                }
                line.isEmpty() -> {
                    flushPara()
                    flushList()
                }
                else -> {
                    flushList()
                    para += line
                }
            }
        }
        flushPara()
        flushList()
        return blocks
    }
}

/** Render [spans] as one [AnnotatedString]; bold is the only style applied. */
fun annotate(spans: List<MdSpan>): AnnotatedString = buildAnnotatedString {
    for (span in spans) {
        if (span.bold) {
            withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append(span.text) }
        } else {
            append(span.text)
        }
    }
}

/**
 * Draw parsed markdown. Bullets get a real glyph column so wrapped lines
 * indent under the text rather than under the dot.
 */
@Composable
fun MiniMarkdownText(
    text: String,
    modifier: Modifier = Modifier,
    style: TextStyle = MaterialTheme.typography.bodyMedium,
    color: Color = MaterialTheme.colorScheme.onSurface,
) {
    val blocks = remember(text) { MiniMarkdown.parse(text) }
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        blocks.forEach { block -> MdBlockContent(block, style, color) }
    }
}

@Composable
private fun ColumnScope.MdBlockContent(block: MdBlock, style: TextStyle, color: Color) {
    when (block) {
        is MdBlock.Paragraph -> Text(
            text = annotate(block.spans),
            style = style,
            color = color,
        )

        is MdBlock.Bullets -> Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            block.items.forEach { item ->
                Row {
                    Text(
                        text = "•",
                        style = style,
                        color = LocalAzfExtended.current.primaryFixedDim,
                        modifier = Modifier.padding(end = 8.dp),
                    )
                    Text(text = annotate(item), style = style, color = color)
                }
            }
        }
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF0E1416)
@Composable
private fun MiniMarkdownPreview() {
    AzfTheme {
        MiniMarkdownText(
            text = """
                You have banked **1,480 kcal** so far today.

                Two easy wins before dinner:
                - a **palm-sized** serve of protein
                - 500 ml of water

                Nothing here is a target you have to hit.
            """.trimIndent(),
            style = LocalTextStyle.current.merge(MaterialTheme.typography.bodyMedium),
            modifier = Modifier.padding(16.dp),
        )
    }
}
