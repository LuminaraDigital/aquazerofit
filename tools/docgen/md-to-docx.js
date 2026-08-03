/**
 * Markdown to DOCX renderer for AquaZeroFit reports.
 *
 * Usage: node tools/docgen/md-to-docx.js <input.md> <output.docx> ["Running header"]
 *
 * Supports: an optional front-matter cover page (brand mark, wordmark, title
 * block and details table), # / ## / ### headings, pipe tables, fenced code
 * blocks, bullets, "- [ ]" checklists, numbered lists, and inline **bold** /
 * *italic* / `code`.
 *
 * House rule enforced here: no em dashes or en dashes. Word autocorrect and
 * pasted text reintroduce them constantly, and they are banned in this document
 * set, so the renderer refuses to build rather than let one reach a submitted
 * file. Page numbers are filled by Word on "Update Field" rather than guessed
 * at build time.
 */
import fs from "node:fs";
import path from "node:path";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  ImportedXmlComponent,
  PageBreak,
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
  throw new Error('Usage: node tools/docgen/md-to-docx.js <input.md> <output.docx> ["header"]');
}

let raw = fs.readFileSync(inputPath, "utf-8");

// ---------- banned character guard ----------
// Fail loudly with line numbers rather than silently shipping a bad file.
const BANNED = [
  { ch: "—", name: "em dash" },
  { ch: "–", name: "en dash" },
];
const offences = [];
raw.split(/\r?\n/).forEach((line, i) => {
  for (const b of BANNED) {
    if (line.includes(b.ch)) {
      offences.push(`  line ${i + 1}: ${b.name}  in:  ${line.trim().slice(0, 88)}`);
    }
  }
});
if (offences.length > 0) {
  console.error(`\nRefusing to render ${path.basename(inputPath)}: banned dash characters found.\n`);
  console.error(offences.join("\n"));
  console.error(`\n${offences.length} occurrence(s). Use a comma, colon, parenthesis, or the word "to".\n`);
  process.exit(1);
}

// ---------- brand ----------
const palette = {
  ink: "0B1F2A",
  brand: "0E7C97",
  brandDeep: "10344A",
  muted: "5B6B75",
  rule: "C9D6DD",
  fill: "EEF4F7",
};

const font = { ascii: "Calibri", hAnsi: "Calibri", cs: "Calibri", eastAsia: "SimSun" };
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
  const size = level === 1 ? 30 : level === 2 ? 25 : 23;
  return new Paragraph({
    heading:
      level === 1 ? HeadingLevel.HEADING_1 : level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
    spacing: { before: level === 1 ? 340 : 240, after: 130 },
    ...(level === 1
      ? { border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: palette.rule, space: 6 } } }
      : {}),
    children: [run(text, { bold: true, size, color: level === 1 ? palette.brandDeep : palette.ink })],
  });
}

function tableFromRows(rows) {
  const colCount = Math.max(...rows.map((r) => r.length));
  const total = 9360;
  const base = Math.floor(total / colCount);
  const widths = Array.from({ length: colCount }, (_, i) =>
    i === colCount - 1 ? total - base * (colCount - 1) : base,
  );
  const mkCell = (text, isHeader, i) =>
    new TableCell({
      children: [
        new Paragraph({
          spacing: { after: 50, line: 265 },
          children: isHeader ? [run(text, { bold: true, color: palette.brandDeep })] : inlineRuns(text),
        }),
      ],
      margins: { top: 90, bottom: 90, left: 110, right: 110 },
      width: { size: widths[i], type: WidthType.DXA },
      ...(isHeader ? { shading: { type: ShadingType.CLEAR, fill: palette.fill, color: "auto" } } : {}),
    });
  return new Table({
    width: { size: total, type: WidthType.DXA },
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

/** A real Word TOC field. Word fills page numbers on "Update Field". */
const toc = (entries) => {
  const cached = entries
    .map(({ title, level }) => {
      const indent = Math.max(0, level - 1) * 360;
      return `<w:p><w:pPr><w:pStyle w:val="TOC${level}"/><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="9000"/></w:tabs><w:ind w:left="${indent}"/></w:pPr><w:r><w:t>${xmlEscape(title)}</w:t></w:r></w:p>`;
    })
    .join("");
  return ImportedXmlComponent.fromXmlString(`<w:sdt xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
    <w:sdtPr><w:alias w:val="Table of Contents"/></w:sdtPr>
    <w:sdtContent>
      <w:p><w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/><w:instrText xml:space="preserve"> TOC \\o &quot;1-2&quot; \\h \\z \\u </w:instrText><w:fldChar w:fldCharType="separate"/></w:r></w:p>
      ${cached}
      <w:p><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>
    </w:sdtContent>
  </w:sdt>`).root[0];
};

// ---------- front matter ----------
const meta = {};
const fm = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(raw);
if (fm) {
  raw = raw.slice(fm[0].length);
  let currentKey = null;
  for (const line of fm[1].split(/\r?\n/)) {
    const nested = /^\s{2,}(.+?):\s*(.*)$/.exec(line);
    const top = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(line);
    if (nested && currentKey === "details") {
      meta.details = meta.details || [];
      meta.details.push([nested[1].trim(), nested[2].trim()]);
    } else if (top) {
      currentKey = top[1].trim();
      meta[currentKey] = top[2].trim() === "" && currentKey === "details" ? [] : top[2].trim();
    }
  }
}

/** Cover page: brand mark, wordmark, tagline, title block, details, page break. */
function buildCover(m) {
  const out = [];
  out.push(new Paragraph({ spacing: { after: 460 }, children: [run("")] }));

  if (m.logo) {
    const candidates = [
      path.resolve(path.dirname(inputPath), "..", "..", m.logo),
      path.resolve(m.logo),
    ];
    const file = candidates.find((p) => fs.existsSync(p));
    if (file) {
      out.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 150 },
          children: [
            new ImageRun({
              data: fs.readFileSync(file),
              type: "png",
              // Source is 359x376. Held at ~1.4in so print stays above 250 dpi.
              transformation: { width: 129, height: 135 },
            }),
          ],
        }),
      );
    }
  }

  if (m.brand) {
    out.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 50 },
        children: [run(m.brand, { size: 56, bold: true, color: palette.brandDeep })],
      }),
    );
  }
  if (m.tagline) {
    out.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
        children: [
          new TextRun({
            text: m.tagline.toUpperCase(),
            font,
            size: 19,
            color: palette.muted,
            characterSpacing: 100,
          }),
        ],
      }),
    );
  }

  out.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 280 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: palette.brand, space: 4 } },
      children: [run("")],
    }),
  );

  if (m.unit) {
    out.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 130 },
        children: [
          new TextRun({
            text: m.unit.toUpperCase(),
            font,
            size: 20,
            bold: true,
            color: palette.brand,
            characterSpacing: 60,
          }),
        ],
      }),
    );
  }
  if (m.title) {
    out.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 110 },
        children: [run(m.title, { size: 48, bold: true, color: palette.ink })],
      }),
    );
  }
  if (m.subtitle) {
    out.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 440 },
        children: [run(m.subtitle, { size: 24, color: palette.muted, italics: true })],
      }),
    );
  }

  if (Array.isArray(m.details) && m.details.length) {
    const widths = [2900, 6460];
    out.push(
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: widths,
        rows: m.details.map(
          ([k, v]) =>
            new TableRow({
              children: [
                new TableCell({
                  width: { size: widths[0], type: WidthType.DXA },
                  margins: { top: 100, bottom: 100, left: 120, right: 120 },
                  shading: { type: ShadingType.CLEAR, fill: palette.fill, color: "auto" },
                  children: [para(run(k, { bold: true, color: palette.brandDeep }), { spacing: { after: 0 } })],
                }),
                new TableCell({
                  width: { size: widths[1], type: WidthType.DXA },
                  margins: { top: 100, bottom: 100, left: 120, right: 120 },
                  children: [para(inlineRuns(v), { spacing: { after: 0 } })],
                }),
              ],
            }),
        ),
      }),
    );
  }

  out.push(new Paragraph({ children: [new PageBreak()] }));
  return out;
}

// ---------- parse body ----------
const lines = raw.split(/\r?\n/);
const children = [];
const tocEntries = [];
let title = meta.title || path.basename(inputPath, ".md");
let seenTitle = false;
let i = 0;
const hasCover = Boolean(meta.logo || meta.brand || meta.cover === "true");

if (hasCover) {
  children.push(...buildCover(meta));
  seenTitle = true;
  children.push(
    para(run("Contents", { bold: true, size: 26, color: palette.brandDeep }), { spacing: { after: 90 } }),
  );
  children.push(
    para(
      run('Right-click the table of contents and choose "Update Field" to fill in page numbers.', {
        italics: true,
        color: palette.muted,
        size: 19,
      }),
    ),
  );
  children.push({ __tocPlaceholder: true });
}

while (i < lines.length) {
  const line = lines[i];

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
          spacing: { after: 0, line: 225 },
          shading: { type: ShadingType.CLEAR, fill: "F6F8FA", color: "auto" },
          children: [new TextRun({ text: l === "" ? " " : l, font: monoFont, size: 17 })],
        }),
      );
    }
    children.push(para(run(""), { spacing: { after: 120 } }));
    continue;
  }

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
    children.push(para(run(""), { spacing: { after: 140 } }));
    continue;
  }

  const hm = /^(#{1,3})\s+(.*)$/.exec(line);
  if (hm) {
    const level = hm[1].length;
    const text = hm[2].trim();
    if (!seenTitle && level === 1) {
      seenTitle = true;
      title = text;
      children.push(
        para(run(text, { bold: true, size: 40, color: palette.ink }), {
          heading: HeadingLevel.TITLE,
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
        }),
      );
      children.push(
        para(run("Contents", { bold: true, size: 26, color: palette.brandDeep }), {
          spacing: { before: 240, after: 100 },
        }),
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

  const cm = /^-\s+\[([ xX])\]\s+(.*)$/.exec(line);
  if (cm) {
    children.push(
      para([run(cm[1].toLowerCase() === "x" ? "☑  " : "☐  ", { color: palette.brand }), ...inlineRuns(cm[2])], {
        indent: { left: 360 },
        spacing: { after: 90 },
      }),
    );
    i++;
    continue;
  }

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

  const nm = /^(\d+)\.\s+(.*)$/.exec(line);
  if (nm) {
    children.push(
      para([run(`${nm[1]}.  `, { bold: true, color: palette.brand }), ...inlineRuns(nm[2])], {
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

const headerText = headerTextArg || [meta.brand, meta.title].filter(Boolean).join("   |   ") || title;

const doc = new Document({
  features: { updateFields: true },
  sections: [
    {
      properties: { page: { margin: { top: 1300, bottom: 1300, left: 1300, right: 1300 } } },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 60 },
              border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: palette.rule, space: 4 } },
              children: [run(headerText, { bold: true, color: palette.muted, size: 18 })],
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  children: ["Page ", PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES],
                  font,
                  size: 18,
                  color: palette.muted,
                }),
              ],
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
