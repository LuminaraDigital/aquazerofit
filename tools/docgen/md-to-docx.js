/**
 * Generic Markdown -> DOCX renderer for AquaZeroFit reports.
 *
 * Usage: node scripts/md-to-docx.js <input.md> <output.docx> ["Running header text"]
 *
 * Supports: # / ## / ### headings (first H1 becomes the title + TOC anchor),
 * pipe tables, fenced code blocks, bullets, "- [ ]" checklists, numbered lists,
 * and inline **bold** / *italic* / `code`.
 *
 * Generalised from scripts/create-wger-plan-docx.js, which hardcoded the wger
 * plan's title, header and page-number table. Page numbers here are left blank
 * and filled by Word on "Update Field" rather than guessed at build time.
 */
import fs from "node:fs";
import path from "node:path";
import {
  AlignmentType,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImportedXmlComponent,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

const [, , inputPath, outputPath, headerTextArg] = process.argv;
if (!inputPath || !outputPath) {
  throw new Error('Usage: node scripts/md-to-docx.js <input.md> <output.docx> ["header"]');
}

const md = fs.readFileSync(inputPath, "utf-8");

const palette = { dark: "263238", primary: "37474F", light: "78909C", fill: "EEF3F6" };
const font = {
  ascii: "Times New Roman",
  hAnsi: "Times New Roman",
  cs: "Times New Roman",
  eastAsia: "SimSun",
};
const monoFont = { ascii: "Consolas", hAnsi: "Consolas", cs: "Consolas", eastAsia: "SimSun" };

const run = (text, options = {}) => new TextRun({ text, font, size: 22, ...options });
const para = (children, options = {}) =>
  new Paragraph({
    spacing: { after: 140, line: 290 },
    ...options,
    children: Array.isArray(children) ? children : [children],
  });

/** Inline markdown: **bold**, *italic*, `code`. */
function inlineRuns(text) {
  const parts = [];
  const re = /(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`]+`)/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(run(text.slice(last, m.index)));
    const tok = m[0];
    if (tok.startsWith("**")) parts.push(run(tok.slice(2, -2), { bold: true }));
    else if (tok.startsWith("`"))
      parts.push(new TextRun({ text: tok.slice(1, -1), font: monoFont, size: 20 }));
    else parts.push(run(tok.slice(1, -1), { italics: true }));
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(run(text.slice(last)));
  return parts.length ? parts : [run("")];
}

function headingPara(text, level) {
  const size = level === 1 ? 28 : level === 2 ? 25 : 23;
  return new Paragraph({
    heading:
      level === 1
        ? HeadingLevel.HEADING_1
        : level === 2
          ? HeadingLevel.HEADING_2
          : HeadingLevel.HEADING_3,
    spacing: { before: level === 1 ? 300 : 220, after: 120 },
    children: [run(text, { bold: true, size, color: palette.dark })],
  });
}

function tableFromRows(rows) {
  const colCount = Math.max(...rows.map((r) => r.length));
  const widths = Array.from({ length: colCount }, () => Math.floor(9360 / colCount));
  const mkCell = (text, isHeader, i) =>
    new TableCell({
      children: [
        new Paragraph({
          spacing: { after: 60, line: 270 },
          children: inlineRuns(text).map((r) => r),
        }),
      ],
      margins: { top: 90, bottom: 90, left: 110, right: 110 },
      width: { size: widths[i], type: WidthType.DXA },
      ...(isHeader ? { shading: { type: ShadingType.CLEAR, fill: palette.fill } } : {}),
    });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: widths,
    rows: rows.map(
      (r, ri) =>
        new TableRow({
          tableHeader: ri === 0,
          children: Array.from({ length: colCount }, (_, i) => mkCell(r[i] ?? "", ri === 0, i)),
        }),
    ),
  });
}

const xmlEscape = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/**
 * A real Word TOC field. Cached entries carry no page number: Word computes
 * them on "Update Field", which is more honest than build-time guesses.
 */
const toc = (entries) => {
  const cached = entries
    .map(({ title, level }) => {
      const indent = Math.max(0, level - 1) * 360;
      return `<w:p>
        <w:pPr>
          <w:pStyle w:val="TOC${level}"/>
          <w:tabs><w:tab w:val="right" w:leader="dot" w:pos="9000"/></w:tabs>
          <w:ind w:left="${indent}"/>
        </w:pPr>
        <w:r><w:t>${xmlEscape(title)}</w:t></w:r>
      </w:p>`;
    })
    .join("");
  return ImportedXmlComponent.fromXmlString(`<w:sdt xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
    <w:sdtPr><w:alias w:val="Table of Contents"/></w:sdtPr>
    <w:sdtContent>
      <w:p>
        <w:r>
          <w:fldChar w:fldCharType="begin" w:dirty="true"/>
          <w:instrText xml:space="preserve"> TOC \\o &quot;1-2&quot; \\h \\z \\u </w:instrText>
          <w:fldChar w:fldCharType="separate"/>
        </w:r>
      </w:p>
      ${cached}
      <w:p><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>
    </w:sdtContent>
  </w:sdt>`).root[0];
};

// ---------- Parse ----------
const lines = md.split(/\r?\n/);
const children = [];
const tocEntries = [];
let title = path.basename(inputPath, ".md");
let seenTitle = false;
let i = 0;

while (i < lines.length) {
  const line = lines[i];

  // fenced code block
  if (line.trimStart().startsWith("```")) {
    const buf = [];
    i++;
    while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
      buf.push(lines[i]);
      i++;
    }
    i++;
    for (const l of buf) {
      children.push(
        new Paragraph({
          spacing: { after: 0, line: 230 },
          children: [new TextRun({ text: l === "" ? " " : l, font: monoFont, size: 17 })],
        }),
      );
    }
    children.push(para(run(""), { spacing: { after: 120 } }));
    continue;
  }

  // pipe table
  if (/^\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
    const rows = [];
    const parseRow = (l) =>
      l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
    rows.push(parseRow(line));
    i += 2;
    while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) {
      rows.push(parseRow(lines[i]));
      i++;
    }
    children.push(tableFromRows(rows));
    children.push(para(run(""), { spacing: { after: 120 } }));
    continue;
  }

  // headings
  const hm = /^(#{1,3})\s+(.*)$/.exec(line);
  if (hm) {
    const level = hm[1].length;
    const text = hm[2].trim();
    if (!seenTitle && level === 1) {
      seenTitle = true;
      title = text;
      children.push(
        para(run(text, { bold: true, size: 34, color: palette.dark }), {
          heading: HeadingLevel.TITLE,
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
        }),
      );
      children.push(
        para(run("Table of Contents", { bold: true, size: 25, color: palette.dark }), {
          spacing: { before: 240, after: 120 },
        }),
      );
      children.push(
        para(
          run("Right-click the table of contents and choose “Update Field” to fill in page numbers.", {
            italics: true,
            color: palette.light,
            size: 19,
          }),
        ),
      );
      children.push({ __tocPlaceholder: true });
      i++;
      continue;
    }
    if (level <= 2) tocEntries.push({ title: text, level });
    children.push(headingPara(text, level));
    i++;
    continue;
  }

  if (/^---\s*$/.test(line.trim())) {
    i++;
    continue;
  }

  // checklist
  const cm = /^-\s+\[([ xX])\]\s+(.*)$/.exec(line);
  if (cm) {
    children.push(
      para(
        [
          run(cm[1].toLowerCase() === "x" ? "☑ " : "☐ ", { color: palette.primary }),
          ...inlineRuns(cm[2]),
        ],
        { indent: { left: 360 }, spacing: { after: 90 } },
      ),
    );
    i++;
    continue;
  }

  // bullet (any indent depth -> level 0/1)
  const bm = /^(\s*)[-*]\s+(.*)$/.exec(line);
  if (bm) {
    children.push(
      new Paragraph({
        bullet: { level: bm[1].length >= 2 ? 1 : 0 },
        spacing: { after: 90, line: 290 },
        children: inlineRuns(bm[2]),
      }),
    );
    i++;
    continue;
  }

  // numbered list — preserve authored numbering
  const nm = /^(\d+)\.\s+(.*)$/.exec(line);
  if (nm) {
    children.push(
      para([run(`${nm[1]}. `, { bold: true, color: palette.primary }), ...inlineRuns(nm[2])], {
        indent: { left: 360 },
        spacing: { after: 90 },
      }),
    );
    i++;
    continue;
  }

  if (line.trim() === "") {
    i++;
    continue;
  }

  children.push(para(inlineRuns(line.trim())));
  i++;
}

const tocIndex = children.findIndex((c) => c && c.__tocPlaceholder);
if (tocIndex >= 0) children.splice(tocIndex, 1, toc(tocEntries));

const headerText = headerTextArg || title;

const doc = new Document({
  features: { updateFields: true },
  sections: [
    {
      properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
      headers: {
        default: new Header({
          children: [
            para(run(headerText, { bold: true, color: palette.primary, size: 19 }), {
              alignment: AlignmentType.CENTER,
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            para(new TextRun({ children: [PageNumber.CURRENT] }), {
              alignment: AlignmentType.CENTER,
            }),
          ],
        }),
      },
      children,
    },
  ],
});

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, await Packer.toBuffer(doc));
console.log("Wrote", outputPath);
