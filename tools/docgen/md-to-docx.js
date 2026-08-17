/**
 * Markdown to DOCX renderer for AquaZeroFit reports.
 *
 * Usage: node tools/docgen/md-to-docx.js <input.md> <output.docx> ["Running header"]
 *
 * Supports: an optional front-matter cover page (brand mark, wordmark, title
 * block and details table), # / ## / ### headings, pipe tables, fenced code
 * blocks, bullets, "- [ ]" checklists, numbered lists, inline **bold** /
 * *italic* / `code`, "> " callout boxes, and figures.
 *
 * Figures use ordinary markdown image syntax, `![Caption](path)`. Put two or
 * three on one line and they are laid out side by side in a borderless table,
 * which is the only way tall phone screenshots fit on a page at a readable
 * size. Captions are numbered automatically, so inserting a figure halfway
 * through a document does not mean renumbering every reference after it.
 * Pixel dimensions are read out of the file itself rather than guessed, so a
 * screenshot re-captured at a different resolution keeps its aspect ratio.
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
// Fenced code blocks are exempt. The rule exists to keep *prose* consistent,
// and a document that quotes source verbatim must quote it verbatim: silently
// rewriting a dash inside a snippet would make the document disagree with the
// repository it is documenting, which is a worse failure than an inconsistent
// dash. Everything outside a fence is still checked.
const offences = [];
let inFence = false;
raw.split(/\r?\n/).forEach((line, i) => {
  if (line.trimStart().startsWith("```")) {
    inFence = !inFence;
    return;
  }
  if (inFence) return;
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

// ---------- figures ----------
/**
 * Intrinsic pixel size, read from the file header. PNG carries it in the IHDR
 * chunk at a fixed offset; JPEG hides it in whichever SOF marker the encoder
 * happened to use, so the marker chain has to be walked.
 */
function imageSize(buf) {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), type: "png" };
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let o = 2;
    while (o + 9 < buf.length) {
      if (buf[o] !== 0xff) {
        o++;
        continue;
      }
      const marker = buf[o + 1];
      // SOF0..SOF15, skipping the four that are not frame headers.
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc, 0xd8].includes(marker)) {
        return { height: buf.readUInt16BE(o + 5), width: buf.readUInt16BE(o + 7), type: "jpg" };
      }
      o += 2 + buf.readUInt16BE(o + 2);
    }
  }
  throw new Error("Unsupported image: expected PNG or JPEG");
}

function resolveAsset(rel) {
  const candidates = [
    path.resolve(path.dirname(inputPath), rel),
    path.resolve(path.dirname(inputPath), "..", "..", rel),
    path.resolve(rel),
  ];
  const hit = candidates.find((p) => fs.existsSync(p));
  if (!hit) throw new Error(`Image not found: ${rel}`);
  return hit;
}

let figureCount = 0;

/**
 * One row of figures. Widths are in inches and are chosen by how many share
 * the row, because a 780x1688 phone capture at full text width would be over a
 * foot tall. A trailing `{w=2.4}` on the path overrides the default.
 */
function figureRow(items) {
  // 3 x 2.0in plus cell margins comes to 6.375in, just inside the 6.5in table.
  // Anything narrower and the UI text inside a phone capture stops being legible,
  // which defeats the point of printing the screenshot at all.
  const defaultWidth = items.length >= 3 ? 2.0 : items.length === 2 ? 2.45 : 2.6;
  const cells = items.map(({ caption, file, widthIn }) => {
    const abs = resolveAsset(file);
    const data = fs.readFileSync(abs);
    const { width: pw, height: ph, type } = imageSize(data);
    const w = widthIn || defaultWidth;
    const h = (w * ph) / pw;
    figureCount += 1;
    const label = `Figure ${figureCount}.`;
    return new TableCell({
      width: { size: Math.floor(9360 / items.length), type: WidthType.DXA },
      margins: { top: 60, bottom: 60, left: 90, right: 90 },
      borders: {
        top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 70 },
          children: [
            new ImageRun({
              data,
              type,
              transformation: { width: Math.round(w * 96), height: Math.round(h * 96) },
            }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 0, line: 250 },
          children: [
            run(`${label} `, { bold: true, size: 17, color: palette.brand }),
            run(caption, { size: 17, color: palette.muted }),
          ],
        }),
      ],
    });
  });
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: cells.map(() => Math.floor(9360 / items.length)),
    borders: {
      top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    },
    // A figure split across a page break leaves a caption orphaned under
    // nothing, so the row is kept whole even at the cost of a short page.
    rows: [new TableRow({ cantSplit: true, children: cells })],
  });
}

/** A tinted note box with a brand-coloured left rule. */
function calloutBox(label, bodyLines) {
  const children = [];
  if (label) {
    children.push(
      new Paragraph({
        spacing: { after: 60, line: 275 },
        children: [run(label.toUpperCase(), { bold: true, size: 18, color: palette.brand, characterSpacing: 40 })],
      }),
    );
  }
  bodyLines.forEach((l, idx) => {
    children.push(
      new Paragraph({
        spacing: { after: idx === bodyLines.length - 1 ? 0 : 80, line: 285 },
        children: inlineRuns(l),
      }),
    );
  });
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [9360],
    rows: [
      new TableRow({
        // Otherwise a break can land between the "NOTE" label and its body.
        cantSplit: true,
        children: [
          new TableCell({
            width: { size: 9360, type: WidthType.DXA },
            margins: { top: 140, bottom: 140, left: 200, right: 180 },
            shading: { type: ShadingType.CLEAR, fill: palette.fill, color: "auto" },
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.SINGLE, size: 18, color: palette.brand },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            },
            children,
          }),
        ],
      }),
    ],
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

  // A line made up only of image tokens becomes one figure row.
  const imageToken = /!\[([^\]]*)\]\(([^)\s]+)\)(?:\{w=([\d.]+)\})?/g;
  if (line.trim().startsWith("![") && line.trim().replace(imageToken, "").trim() === "") {
    const items = [];
    let im;
    imageToken.lastIndex = 0;
    while ((im = imageToken.exec(line)) !== null) {
      items.push({ caption: im[1], file: im[2], widthIn: im[3] ? Number(im[3]) : null });
    }
    children.push(figureRow(items));
    children.push(para(run(""), { spacing: { after: 160 } }));
    i++;
    continue;
  }

  // "> [!Note] ..." or a plain "> " run becomes a callout box.
  if (/^>\s?/.test(line)) {
    const buf = [];
    while (i < lines.length && /^>\s?/.test(lines[i])) {
      buf.push(lines[i].replace(/^>\s?/, ""));
      i++;
    }
    let label = null;
    const lm = /^\[!([^\]]+)\]\s*(.*)$/.exec(buf[0] ?? "");
    if (lm) {
      label = lm[1];
      buf[0] = lm[2];
    }
    children.push(calloutBox(label, buf.filter((l) => l.trim() !== "")));
    children.push(para(run(""), { spacing: { after: 160 } }));
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
