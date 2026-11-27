/**
 * Utilitas pemrosesan rumus matematika (KaTeX) dan Smart Paste dari Microsoft Word / Google Docs.
 * Dirancang pure-TypeScript (tanpa ketergantungan DOM browser) agar konsisten di client maupun unit test.
 */

export interface MathSegment {
  type: "text" | "inline-math" | "display-math";
  content: string;
}

export interface MathSnippet {
  label: string;
  title: string;
  insert: string;
  /** Posisi seleksi awal relatif terhadap awal `insert` agar guru langsung mengetik nilai */
  selectStart?: number;
  selectEnd?: number;
}

export const MATH_SNIPPETS: MathSnippet[] = [
  { label: "x²", title: "Pangkat kuadrat", insert: "$x^{2}$", selectStart: 4, selectEnd: 5 },
  { label: "aⁿ", title: "Pangkat umum", insert: "$a^{n}$", selectStart: 1, selectEnd: 2 },
  { label: "xₙ", title: "Indeks / Subscript (Kimia/Deret)", insert: "$x_{n}$", selectStart: 4, selectEnd: 5 },
  { label: "a/b", title: "Pecahan", insert: "$\\frac{a}{b}$", selectStart: 7, selectEnd: 8 },
  { label: "√x", title: "Akar kuadrat", insert: "$\\sqrt{x}$", selectStart: 7, selectEnd: 8 },
  { label: "ⁿ√x", title: "Akar pangkat n", insert: "$\\sqrt[3]{x}$", selectStart: 7, selectEnd: 8 },
  { label: "log", title: "Logaritma", insert: "$\\log_{2} 8$", selectStart: 7, selectEnd: 8 },
  { label: "lim", title: "Limit", insert: "$\\lim_{x \\to 0} x$", selectStart: 13, selectEnd: 14 },
  { label: "∑", title: "Notasi Sigma", insert: "$\\sum_{i=1}^{n} x_i$", selectStart: 16, selectEnd: 19 },
  { label: "∫", title: "Integral Tentu", insert: "$\\int_{0}^{1} x^2 \\, dx$", selectStart: 14, selectEnd: 17 },
  {
    label: "Matriks",
    title: "Matriks 2x2 (baris sendiri)",
    insert: "$$\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}$$",
    selectStart: 18,
    selectEnd: 19,
  },
  {
    label: "Sistem",
    title: "Sistem Persamaan (baris sendiri)",
    insert: "$$\\begin{cases} x + y = 5 \\\\ 2x - y = 1 \\end{cases}$$",
    selectStart: 16,
    selectEnd: 25,
  },
];

export const UNICODE_MATH_SYMBOLS: Array<{ char: string; title: string }> = [
  { char: "²", title: "Pangkat 2" },
  { char: "³", title: "Pangkat 3" },
  { char: "⁰", title: "Pangkat 0" },
  { char: "¹", title: "Pangkat 1" },
  { char: "⁴", title: "Pangkat 4" },
  { char: "⁵", title: "Pangkat 5" },
  { char: "⁻", title: "Pangkat minus" },
  { char: "₀", title: "Indeks 0" },
  { char: "₁", title: "Indeks 1" },
  { char: "₂", title: "Indeks 2" },
  { char: "₃", title: "Indeks 3" },
  { char: "°", title: "Derajat" },
  { char: "×", title: "Kali" },
  { char: "÷", title: "Bagi" },
  { char: "±", title: "Plus-minus" },
  { char: "≤", title: "Kurang dari atau sama dengan" },
  { char: "≥", title: "Lebih dari atau sama dengan" },
  { char: "≠", title: "Tidak sama dengan" },
  { char: "≈", title: "Hampir sama dengan" },
  { char: "√", title: "Tanda akar" },
  { char: "π", title: "Pi" },
  { char: "α", title: "Alfa" },
  { char: "β", title: "Beta" },
  { char: "θ", title: "Teta" },
  { char: "Δ", title: "Delta" },
  { char: "Ω", title: "Ohm / Omega" },
  { char: "∞", title: "Tak hingga" },
  { char: "→", title: "Panah reaksi / implikasi" },
  { char: "⇌", title: "Reaksi bolak-balik (Kimia)" },
];

const SUPERSCRIPT_MAP: Record<string, string> = {
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
  "+": "⁺",
  "-": "⁻",
  "−": "⁻",
  "=": "⁼",
  "(": "⁽",
  ")": "⁾",
  n: "ⁿ",
  i: "ⁱ",
};

const SUBSCRIPT_MAP: Record<string, string> = {
  "0": "₀",
  "1": "₁",
  "2": "₂",
  "3": "₃",
  "4": "₄",
  "5": "₅",
  "6": "₆",
  "7": "₇",
  "8": "₈",
  "9": "₉",
  "+": "₊",
  "-": "₋",
  "−": "₋",
  "=": "₌",
  "(": "₍",
  ")": "₎",
};

export function toUnicodeSuperscript(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  let out = "";
  for (const ch of trimmed) {
    const mapped = SUPERSCRIPT_MAP[ch];
    if (!mapped) return null;
    out += mapped;
  }
  return out;
}

export function toUnicodeSubscript(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  let out = "";
  for (const ch of trimmed) {
    const mapped = SUBSCRIPT_MAP[ch];
    if (!mapped) return null;
    out += mapped;
  }
  return out;
}

/**
 * Memecah teks soal menjadi segmen teks biasa, inline math ($...$), dan display math ($$...$$).
 * Aman terhadap tanda dolar biasa (seperti "Harga $5 dan $10" atau "\$100").
 */
export function splitMathSegments(input: string): MathSegment[] {
  if (!input || !input.includes("$")) {
    return input ? [{ type: "text", content: input }] : [];
  }

  const segments: MathSegment[] = [];
  let textBuf = "";
  const len = input.length;
  let i = 0;

  const flushText = () => {
    if (textBuf) {
      segments.push({ type: "text", content: textBuf });
      textBuf = "";
    }
  };

  while (i < len) {
    // Escaped dollar: \$ -> literal $
    if (input[i] === "\\" && i + 1 < len && input[i + 1] === "$") {
      textBuf += "$";
      i += 2;
      continue;
    }

    // Display math: $$...$$
    if (input[i] === "$" && i + 1 < len && input[i + 1] === "$") {
      const closeIdx = findClosingDoubleDollar(input, i + 2);
      if (closeIdx !== -1) {
        const expr = input.slice(i + 2, closeIdx).trim();
        if (expr.length > 0) {
          flushText();
          segments.push({ type: "display-math", content: expr });
          i = closeIdx + 2;
          continue;
        }
      }
      textBuf += "$$";
      i += 2;
      continue;
    }

    // Inline math: $...$
    if (input[i] === "$") {
      // Aturan Pandoc/KaTeX: setelah '$' pembuka tidak boleh langsung spasi/newline
      if (i + 1 < len && !/\s/.test(input[i + 1])) {
        const closeIdx = findClosingSingleDollar(input, i + 1);
        if (closeIdx !== -1) {
          const expr = input.slice(i + 1, closeIdx);
          if (expr.length > 0 && !/\s$/.test(expr)) {
            flushText();
            segments.push({ type: "inline-math", content: expr });
            i = closeIdx + 1;
            continue;
          }
        }
      }
      textBuf += "$";
      i += 1;
      continue;
    }

    textBuf += input[i];
    i += 1;
  }

  flushText();
  return segments;
}

function findClosingDoubleDollar(input: string, from: number): number {
  for (let i = from; i < input.length - 1; i++) {
    if (input[i] === "\\" && input[i + 1] === "$") {
      i += 1;
      continue;
    }
    if (input[i] === "$" && input[i + 1] === "$") {
      return i;
    }
  }
  return -1;
}

function findClosingSingleDollar(input: string, from: number): number {
  for (let i = from; i < input.length; i++) {
    // Jangan biarkan inline math melewati paragraf kosong (\n\n)
    if (input[i] === "\n" && i + 1 < input.length && input[i + 1] === "\n") {
      return -1;
    }
    if (input[i] === "\\" && i + 1 < input.length && input[i + 1] === "$") {
      i += 1;
      continue;
    }
    if (input[i] === "$") {
      // Jangan tutup jika setelah '$' langsung angka (menghindari "$5-$10" dianggap math)
      if (i + 1 < input.length && /[0-9]/.test(input[i + 1])) {
        return -1;
      }
      // Jangan tutup jika sebelum '$' adalah spasi (menghindari "$5 dan $10")
      if (i > from && /\s/.test(input[i - 1])) {
        return -1;
      }
      return i;
    }
  }
  return -1;
}

export function hasMathSyntax(input: string): boolean {
  return splitMathSegments(input).some((seg) => seg.type !== "text");
}

// ============================================================================
// Smart Paste: Konverter Microsoft Word HTML / OMML Equation / MathML -> KaTeX
// ============================================================================

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  times: "×",
  divide: "÷",
  plusmn: "±",
  deg: "°",
  le: "≤",
  ge: "≥",
  ne: "≠",
  asymp: "≈",
  pi: "π",
  alpha: "α",
  beta: "β",
  theta: "θ",
  Delta: "Δ",
  Omega: "Ω",
  radic: "√",
  infin: "∞",
  minus: "-",
  ndash: "-",
  mdash: "-",
  lsquo: "'",
  rsquo: "'",
  ldquo: '"',
  rdquo: '"',
  sup2: "²",
  sup3: "³",
  sup1: "¹",
  rarr: "→",
  larr: "←",
  harr: "↔",
  middot: "·",
};

export function decodeHtmlEntities(str: string): string {
  return str.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z0-9]+);/g, (full, ent) => {
    if (ent.startsWith("#x") || ent.startsWith("#X")) {
      const code = parseInt(ent.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : full;
    }
    if (ent.startsWith("#")) {
      const code = parseInt(ent.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : full;
    }
    return NAMED_ENTITIES[ent] ?? full;
  });
}

function normalizeLatexSymbols(raw: string): string {
  return raw
    .replace(/\u2212/g, "-")
    .replace(/×/g, " \\times ")
    .replace(/÷/g, " \\div ")
    .replace(/≤/g, " \\le ")
    .replace(/≥/g, " \\ge ")
    .replace(/≠/g, " \\ne ")
    .replace(/±/g, " \\pm ")
    .replace(/≈/g, " \\approx ")
    .replace(/∞/g, " \\infty ")
    .replace(/π/g, " \\pi ")
    .replace(/α/g, " \\alpha ")
    .replace(/β/g, " \\beta ")
    .replace(/θ/g, " \\theta ")
    .replace(/Δ/g, " \\Delta ")
    .replace(/→/g, " \\to ")
    .replace(/·/g, " \\cdot ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Mengambil seluruh elemen tag XML/HTML berpasangan secara seimbang (mendukung nesting).
 */
function extractTagBlocks(xml: string, tagName: string): Array<{ full: string; attrs: string; inner: string; start: number; end: number }> {
  const results: Array<{ full: string; attrs: string; inner: string; start: number; end: number }> = [];
  const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const openRe = new RegExp(`<${escaped}(?:\\s[^>]*)?>`, "gi");
  const tokenRe = new RegExp(`<(\\/?)${escaped}(?:\\s([^>]*))?>`, "gi");

  let match: RegExpExecArray | null;
  let searchFrom = 0;

  while (searchFrom < xml.length) {
    openRe.lastIndex = searchFrom;
    match = openRe.exec(xml);
    if (!match) break;

    const start = match.index;
    const openTagEnd = start + match[0].length;
    const attrsMatch = match[0].match(new RegExp(`^<${escaped}\\s([^>]*)>$`, "i"));
    const attrs = attrsMatch ? attrsMatch[1] : "";

    // Self-closing tag
    if (match[0].endsWith("/>")) {
      results.push({ full: match[0], attrs, inner: "", start, end: openTagEnd });
      searchFrom = openTagEnd;
      continue;
    }

    let depth = 1;
    tokenRe.lastIndex = openTagEnd;
    let tok: RegExpExecArray | null;
    let end = -1;
    let innerEnd = -1;

    while ((tok = tokenRe.exec(xml)) !== null) {
      if (tok[1] === "/") {
        depth -= 1;
        if (depth === 0) {
          innerEnd = tok.index;
          end = tok.index + tok[0].length;
          break;
        }
      } else if (!tok[0].endsWith("/>")) {
        depth += 1;
      }
    }

    if (end === -1) {
      searchFrom = openTagEnd;
      continue;
    }

    results.push({
      full: xml.slice(start, end),
      attrs,
      inner: xml.slice(openTagEnd, innerEnd),
      start,
      end,
    });
    searchFrom = end;
  }

  return results;
}

function getDirectChildInner(xml: string, tagName: string): string {
  const blocks = extractTagBlocks(xml, tagName);
  return blocks.length > 0 ? blocks[0].inner : "";
}

/**
 * Mengonversi XML Word Equation (OMML: <m:oMath>) menjadi ekspresi LaTeX.
 */
export function convertOmmlToLatex(ommlInner: string): string {
  // Bersihkan blok properti non-teks yang tidak ikut dirender (kecuali chr untuk nary/d)
  let work = ommlInner;

  // Proses rekursif pada node terluar satu per satu
  const structuralTags = [
    "m:f",
    "m:sSup",
    "m:sSub",
    "m:sSubSup",
    "m:rad",
    "m:nary",
    "m:d",
    "m:m",
    "m:bar",
    "m:e",
  ];

  // Iterasi cari tag struktural paling kiri pada level saat ini
  let out = "";
  let pos = 0;

  while (pos < work.length) {
    let earliest: {
      tag: string;
      block: { full: string; attrs: string; inner: string; start: number; end: number };
    } | null = null;

    const rest = work.slice(pos);
    for (const tag of structuralTags) {
      const blocks = extractTagBlocks(rest, tag);
      if (blocks.length > 0) {
        const blk = blocks[0];
        if (!earliest || blk.start < earliest.block.start) {
          earliest = { tag, block: blk };
        }
      }
    }

    // Juga cek <m:t> untuk teks langsung sebelum tag struktural berikutnya
    const textBlocks = extractTagBlocks(rest, "m:t");
    if (textBlocks.length > 0) {
      const blk = textBlocks[0];
      if (!earliest || blk.start < earliest.block.start) {
        earliest = { tag: "m:t", block: blk };
      }
    }

    if (!earliest) break;

    const { tag, block } = earliest;
    if (tag === "m:t") {
      out += normalizeLatexSymbols(decodeHtmlEntities(block.inner));
    } else if (tag === "m:f") {
      const num = convertOmmlToLatex(getDirectChildInner(block.inner, "m:num"));
      const den = convertOmmlToLatex(getDirectChildInner(block.inner, "m:den"));
      out += `\\frac{${num}}{${den}}`;
    } else if (tag === "m:sSup") {
      const base = convertOmmlToLatex(getDirectChildInner(block.inner, "m:e"));
      const sup = convertOmmlToLatex(getDirectChildInner(block.inner, "m:sup"));
      out += `${wrapBaseIfNeeded(base)}^{${sup}}`;
    } else if (tag === "m:sSub") {
      const base = convertOmmlToLatex(getDirectChildInner(block.inner, "m:e"));
      const sub = convertOmmlToLatex(getDirectChildInner(block.inner, "m:sub"));
      out += `${wrapBaseIfNeeded(base)}_{${sub}}`;
    } else if (tag === "m:sSubSup") {
      const base = convertOmmlToLatex(getDirectChildInner(block.inner, "m:e"));
      const sub = convertOmmlToLatex(getDirectChildInner(block.inner, "m:sub"));
      const sup = convertOmmlToLatex(getDirectChildInner(block.inner, "m:sup"));
      out += `${wrapBaseIfNeeded(base)}_{${sub}}^{${sup}}`;
    } else if (tag === "m:rad") {
      const deg = convertOmmlToLatex(getDirectChildInner(block.inner, "m:deg")).trim();
      const expr = convertOmmlToLatex(getDirectChildInner(block.inner, "m:e"));
      out += deg ? `\\sqrt[${deg}]{${expr}}` : `\\sqrt{${expr}}`;
    } else if (tag === "m:nary") {
      const chrMatch = block.inner.match(/<m:chr\s+[^>]*m:val="([^"]+)"/i);
      const rawChr = chrMatch ? decodeHtmlEntities(chrMatch[1]) : "∫";
      const op =
        rawChr === "∑" ? "\\sum" : rawChr === "∏" ? "\\prod" : "\\int";
      const sub = convertOmmlToLatex(getDirectChildInner(block.inner, "m:sub")).trim();
      const sup = convertOmmlToLatex(getDirectChildInner(block.inner, "m:sup")).trim();
      const expr = convertOmmlToLatex(getDirectChildInner(block.inner, "m:e")).trim();
      out += `${op}${sub ? `_{${sub}}` : ""}${sup ? `^{${sup}}` : ""} ${expr}`;
    } else if (tag === "m:d") {
      const begMatch = block.inner.match(/<m:begChr\s+[^>]*m:val="([^"]+)"/i);
      const endMatch = block.inner.match(/<m:endChr\s+[^>]*m:val="([^"]+)"/i);
      const beg = begMatch ? decodeHtmlEntities(begMatch[1]) : "(";
      const end = endMatch ? decodeHtmlEntities(endMatch[1]) : ")";
      const elements = extractTagBlocks(block.inner, "m:e").map((el) =>
        convertOmmlToLatex(el.inner)
      );
      const leftDelim = beg === "{" ? "\\{" : beg;
      const rightDelim = end === "}" ? "\\}" : end;
      out += `\\left${leftDelim}${elements.join(", ")}\\right${rightDelim}`;
    } else if (tag === "m:m") {
      const rows = extractTagBlocks(block.inner, "m:mr").map((row) =>
        extractTagBlocks(row.inner, "m:e")
          .map((cell) => convertOmmlToLatex(cell.inner))
          .join(" & ")
      );
      out += `\\begin{pmatrix} ${rows.join(" \\\\ ")} \\end{pmatrix}`;
    } else if (tag === "m:bar") {
      const expr = convertOmmlToLatex(getDirectChildInner(block.inner, "m:e"));
      out += `\\overline{${expr}}`;
    } else if (tag === "m:e") {
      out += convertOmmlToLatex(block.inner);
    }

    pos += block.end;
  }

  work = out.replace(/\s+/g, " ").trim();
  return work;
}

/**
 * Mengonversi elemen MathML (<math>...</math>) menjadi ekspresi LaTeX.
 */
export function convertMathMlToLatex(mathMlInner: string): string {
  const tags = [
    "mfrac",
    "msup",
    "msub",
    "msubsup",
    "msqrt",
    "mroot",
    "mtable",
    "mrow",
    "mi",
    "mn",
    "mo",
    "mtext",
  ];

  let out = "";
  let pos = 0;

  while (pos < mathMlInner.length) {
    const rest = mathMlInner.slice(pos);
    let earliest: {
      tag: string;
      block: { full: string; attrs: string; inner: string; start: number; end: number };
    } | null = null;

    for (const tag of tags) {
      const blocks = extractTagBlocks(rest, tag);
      if (blocks.length > 0) {
        const blk = blocks[0];
        if (!earliest || blk.start < earliest.block.start) {
          earliest = { tag, block: blk };
        }
      }
    }

    if (!earliest) break;

    const { tag, block } = earliest;
    if (tag === "mi" || tag === "mn" || tag === "mo" || tag === "mtext") {
      const cleanText = decodeHtmlEntities(block.inner.replace(/<[^>]+>/g, ""));
      out += normalizeLatexSymbols(cleanText);
    } else if (tag === "mrow") {
      out += convertMathMlToLatex(block.inner);
    } else if (tag === "msqrt") {
      out += `\\sqrt{${convertMathMlToLatex(block.inner)}}`;
    } else if (tag === "mfrac" || tag === "msup" || tag === "msub" || tag === "mroot") {
      const children = extractDirectMathMlChildren(block.inner);
      const a = children[0] ? convertMathMlToLatex(children[0]) : "";
      const b = children[1] ? convertMathMlToLatex(children[1]) : "";
      if (tag === "mfrac") out += `\\frac{${a}}{${b}}`;
      else if (tag === "msup") out += `${wrapBaseIfNeeded(a)}^{${b}}`;
      else if (tag === "msub") out += `${wrapBaseIfNeeded(a)}_{${b}}`;
      else out += `\\sqrt[${b}]{${a}}`;
    } else if (tag === "msubsup") {
      const children = extractDirectMathMlChildren(block.inner);
      const base = children[0] ? convertMathMlToLatex(children[0]) : "";
      const sub = children[1] ? convertMathMlToLatex(children[1]) : "";
      const sup = children[2] ? convertMathMlToLatex(children[2]) : "";
      out += `${wrapBaseIfNeeded(base)}_{${sub}}^{${sup}}`;
    } else if (tag === "mtable") {
      const rows = extractTagBlocks(block.inner, "mtr").map((row) =>
        extractTagBlocks(row.inner, "mtd")
          .map((cell) => convertMathMlToLatex(cell.inner))
          .join(" & ")
      );
      out += `\\begin{pmatrix} ${rows.join(" \\\\ ")} \\end{pmatrix}`;
    }

    pos += block.end;
  }

  return out.replace(/\s+/g, " ").trim();
}

function extractDirectMathMlChildren(inner: string): string[] {
  const children: string[] = [];
  const tagRe = /<([a-zA-Z0-9:]+)(?:\s[^>]*)?>/g;
  let pos = 0;
  while (pos < inner.length) {
    tagRe.lastIndex = pos;
    const m = tagRe.exec(inner);
    if (!m) break;
    const tagName = m[1];
    const blocks = extractTagBlocks(inner.slice(m.index), tagName);
    if (blocks.length === 0) break;
    children.push(blocks[0].full);
    pos = m.index + blocks[0].end;
  }
  return children;
}

function wrapBaseIfNeeded(base: string): string {
  const trimmed = base.trim();
  if (!trimmed) return "";
  if (trimmed.length === 1 || /^\\[a-zA-Z]+$/.test(trimmed)) return trimmed;
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  return `{${trimmed}}`;
}

export interface ConvertWordHtmlOptions {
  /**
   * Jika true (misal untuk dropdown Menjodohkan / kunci Isian), pangkat & indeks sederhana
   * dikonversi ke karakter Unicode (x², H₂O) alih-alih sintaks KaTeX ($x^{2}$).
   */
  unicodeOnly?: boolean;
}

/**
 * Mengonversi HTML clipboard dari Microsoft Word / Google Docs menjadi teks bersih + rumus KaTeX.
 * Mengembalikan null jika HTML tidak membawa format khusus (sehingga caller bisa pakai plain text biasa).
 */
export function convertWordHtmlToMathText(
  html: string,
  options: ConvertWordHtmlOptions = {}
): string | null {
  if (!html) return null;

  const hasSpecialFormatting =
    /<sup[\s>]/i.test(html) ||
    /<sub[\s>]/i.test(html) ||
    /vertical-align\s*:\s*(super|sub)/i.test(html) ||
    /<m:oMath/i.test(html) ||
    /<math[\s>]/i.test(html) ||
    /msEquation/i.test(html) ||
    /class=["']?Mso/i.test(html);

  if (!hasSpecialFormatting) return null;

  const placeholders: string[] = [];
  const stash = (value: string) => {
    const idx = placeholders.length;
    placeholders.push(value);
    return `@@MATH_TOKEN_${idx}@@`;
  };

  let work = html;

  // 1. Ambil bagian <body> jika ada
  const bodyMatch = work.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) {
    work = bodyMatch[1];
  }

  // 2. Buang blok style/script/xml yang bukan konten soal
  work = work
    .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<xml[^>]*>[\s\S]*?<\/xml>/gi, "");

  // 3. Ekstrak Word Equation (OMML) dari conditional comment SEBELUM buang komentar HTML
  work = work.replace(
    /<!--\[if\s+gte\s+msEquation[^\]]*\]>([\s\S]*?)<!\[endif\]-->/gi,
    (_, inner: string) => {
      const oMaths = extractTagBlocks(inner, "m:oMath");
      if (oMaths.length === 0) return "";
      const latex = oMaths
        .map((blk) => convertOmmlToLatex(blk.inner))
        .filter(Boolean)
        .join(" ");
      return latex ? stash(`$${latex}$`) : "";
    }
  );

  // Buang fallback Word Equation (<![if !msEquation]>...<![endif]>) agar tidak dobel
  work = work
    .replace(/<!\[if\s+!msEquation\]>[\s\S]*?<!\[endif\]>/gi, "")
    .replace(/<!--\[if\s+!msEquation\]>[\s\S]*?<!\[endif\]-->/gi, "");

  // 4. Ekstrak bare <m:oMath> dan <math> (MathML)
  const bareOMaths = extractTagBlocks(work, "m:oMath");
  for (let i = bareOMaths.length - 1; i >= 0; i--) {
    const blk = bareOMaths[i];
    const latex = convertOmmlToLatex(blk.inner);
    const replacement = latex ? stash(`$${latex}$`) : "";
    work = work.slice(0, blk.start) + replacement + work.slice(blk.end);
  }

  const mathMls = extractTagBlocks(work, "math");
  for (let i = mathMls.length - 1; i >= 0; i--) {
    const blk = mathMls[i];
    const latex = convertMathMlToLatex(blk.inner);
    const replacement = latex ? stash(`$${latex}$`) : "";
    work = work.slice(0, blk.start) + replacement + work.slice(blk.end);
  }

  // 5. Buang sisa komentar HTML (termasuk <!--StartFragment-->)
  work = work.replace(/<!--[\s\S]*?-->/g, "");

  // 6. Normalkan Google Docs / CSS inline vertical-align: super/sub menjadi <sup>/<sub>
  work = work.replace(
    /<span[^>]*style=["'][^"']*vertical-align\s*:\s*super[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi,
    "<sup>$1</sup>"
  );
  work = work.replace(
    /<span[^>]*style=["'][^"']*vertical-align\s*:\s*sub[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi,
    "<sub>$1</sub>"
  );

  // Bersihkan tag HTML bersarang di dalam <sup> dan <sub>
  work = work.replace(/<sup[^>]*>([\s\S]*?)<\/sup>/gi, (_, inner: string) => {
    const clean = inner.replace(/<[^>]+>/g, "").trim();
    return clean ? `@@SUP_OPEN@@${clean}@@SUP_CLOSE@@` : "";
  });
  work = work.replace(/<sub[^>]*>([\s\S]*?)<\/sub>/gi, (_, inner: string) => {
    const clean = inner.replace(/<[^>]+>/g, "").trim();
    return clean ? `@@SUB_OPEN@@${clean}@@SUB_CLOSE@@` : "";
  });

  // 7. Normalkan newline mentah di sumber HTML menjadi spasi (standar HTML),
  //    lalu ubah tag pemisah baris (<br>, </p>, </div>, </li>, </tr>) menjadi newline asli.
  work = work
    .replace(/[\r\n]+/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<\/(td|th)>/gi, " ")
    .replace(/<[^>]+>/g, "");

  // 8. Decode entitas HTML dan bersihkan spasi aneh Word
  work = decodeHtmlEntities(work)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u00A0/g, " ")
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, "");

  // 9. Konversi token SUP/SUB menjadi Unicode atau KaTeX ($...$)
  if (options.unicodeOnly) {
    work = work.replace(/@@SUP_OPEN@@([\s\S]*?)@@SUP_CLOSE@@/g, (_, val: string) => {
      return toUnicodeSuperscript(val) ?? `^${val}`;
    });
    work = work.replace(/@@SUB_OPEN@@([\s\S]*?)@@SUB_CLOSE@@/g, (_, val: string) => {
      return toUnicodeSubscript(val) ?? `_${val}`;
    });
  } else {
    // Gabungkan base token langsung di depan sup/sub: x@@SUP_OPEN@@2@@SUP_CLOSE@@ -> $x^{2}$
    work = work.replace(
      /([A-Za-z0-9)\]]+)?((?:@@(?:SUP|SUB)_OPEN@@[\s\S]*?@@(?:SUP|SUB)_CLOSE@@)+)/g,
      (_, base: string | undefined, scriptChain: string) => {
        const converted = scriptChain
          .replace(/@@SUP_OPEN@@([\s\S]*?)@@SUP_CLOSE@@/g, (_, v: string) => {
            return `^{${normalizeLatexSymbols(v)}}`;
          })
          .replace(/@@SUB_OPEN@@([\s\S]*?)@@SUB_CLOSE@@/g, (_, v: string) => {
            return `_{${normalizeLatexSymbols(v)}}`;
          });
        const safeBase = base ? normalizeLatexSymbols(base) : "";
        return `$${safeBase}${converted}$`;
      }
    );
  }

  // 10. Kembalikan token OMML/MathML
  for (let i = 0; i < placeholders.length; i++) {
    work = work.replace(`@@MATH_TOKEN_${i}@@`, placeholders[i]);
  }

  // 11. Rapikan spasi dan baris kosong berlebih
  work = work
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return work || null;
}

/**
 * Membersihkan teks polos hasil paste (termasuk auto-wrap jika guru menyalin LaTeX mentah
 * dari fitur "Word Equation -> LaTeX" tanpa tanda '$').
 */
export function normalizePastedPlainText(
  text: string,
  options: ConvertWordHtmlOptions = {}
): string {
  const cleaned = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u00A0/g, " ")
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, "")
    .replace(/\u2212/g, "-");

  if (options.unicodeOnly) return cleaned;

  // Jika seluruh tempelan 1 baris adalah perintah LaTeX mentah dari Word (tanpa '$'), bungkus otomatis
  const trimmed = cleaned.trim();
  const looksLikeRawLatex =
    !trimmed.includes("$") &&
    !trimmed.includes("\n") &&
    /\\(frac|sqrt|int|sum|lim|log_|begin\{|overline|vec|cdot|times|div|pm|le|ge|ne)\b/.test(
      trimmed
    );

  if (looksLikeRawLatex) {
    return `$${trimmed}$`;
  }

  return cleaned;
}
