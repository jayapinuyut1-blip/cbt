import { describe, expect, it } from "vitest";
import {
  convertMathMlToLatex,
  convertOmmlToLatex,
  convertWordHtmlToMathText,
  hasMathSyntax,
  normalizePastedPlainText,
  splitMathSegments,
  toUnicodeSubscript,
  toUnicodeSuperscript,
} from "./math-format";

describe("splitMathSegments", () => {
  it("memisahkan teks biasa, inline math, dan display math dengan benar", () => {
    const segs = splitMathSegments(
      "Hitung $x^{2} + 3x$ dan $$\\frac{a}{b}$$ selesai."
    );
    expect(segs).toEqual([
      { type: "text", content: "Hitung " },
      { type: "inline-math", content: "x^{2} + 3x" },
      { type: "text", content: " dan " },
      { type: "display-math", content: "\\frac{a}{b}" },
      { type: "text", content: " selesai." },
    ]);
  });

  it("tidak merusak harga dolar biasa atau escaped dollar", () => {
    const segs = splitMathSegments("Harga $5 dan $10 serta \\$20.");
    expect(segs).toEqual([
      { type: "text", content: "Harga $5 dan $10 serta $20." },
    ]);
    expect(hasMathSyntax("Harga $5 dan $10")).toBe(false);
    expect(hasMathSyntax("Nilai $x^2$ adalah 4")).toBe(true);
  });

  it("aman saat tanda $ tidak ditutup", () => {
    const segs = splitMathSegments("Tanda $ tunggal tetap aman");
    expect(segs).toEqual([{ type: "text", content: "Tanda $ tunggal tetap aman" }]);
  });
});

describe("Unicode superscript & subscript helpers", () => {
  it("mengonversi pangkat dan indeks angka ke Unicode", () => {
    expect(toUnicodeSuperscript("2")).toBe("²");
    expect(toUnicodeSuperscript("-3")).toBe("⁻³");
    expect(toUnicodeSubscript("2")).toBe("₂");
    expect(toUnicodeSuperscript("x+1")).toBeNull();
  });
});

describe("convertWordHtmlToMathText", () => {
  it("mengonversi <sup> dan <sub> dari Microsoft Word menjadi rumus KaTeX", () => {
    const wordHtml =
      "<html><body><p class=MsoNormal>Hitung x<sup><span>2</span></sup> + 10<sup>-3</sup> dan H<sub>2</sub>O.</p></body></html>";
    const result = convertWordHtmlToMathText(wordHtml);
    expect(result).toBe("Hitung $x^{2}$ + $10^{-3}$ dan $H_{2}$O.");
  });

  it("mengonversi pangkat berantai dan vertical-align dari Google Docs", () => {
    const gdocsHtml =
      '<span>Nilai x<span style="vertical-align:sub">1</span><span style="vertical-align:super">2</span></span>';
    expect(convertWordHtmlToMathText(gdocsHtml)).toBe("Nilai $x_{1}^{2}$");
  });

  it("mendukung mode unicodeOnly untuk dropdown Menjodohkan / kunci Isian", () => {
    const wordHtml = "<p>x<sup>2</sup> dan H<sub>2</sub>O</p>";
    expect(convertWordHtmlToMathText(wordHtml, { unicodeOnly: true })).toBe(
      "x² dan H₂O"
    );
  });

  it("mengonversi Microsoft Word Equation (OMML) pecahan dan akar tanpa duplikasi fallback", () => {
    const wordEquationHtml = `
      <p class=MsoNormal>Hasil dari
      <!--[if gte msEquation 12]><m:oMath>
        <m:f>
          <m:num><m:sSup><m:e><m:r><m:t>x</m:t></m:r></m:e><m:sup><m:r><m:t>2</m:t></m:r></m:sup></m:sSup><m:r><m:t>+1</m:t></m:r></m:num>
          <m:den><m:rad><m:e><m:r><m:t>x+2</m:t></m:r></m:e></m:rad></m:den>
        </m:f>
      </m:oMath><![endif]--><![if !msEquation]>FALLBACK_GAMBAR_RUSAK<![endif]>
      adalah...</p>
    `;
    const result = convertWordHtmlToMathText(wordEquationHtml);
    expect(result).toBe("Hasil dari $\\frac{x^{2}+1}{\\sqrt{x+2}}$ adalah...");
  });

  it("mengonversi MathML pecahan dan pangkat menjadi KaTeX", () => {
    const mathml =
      "<math><mfrac><mrow><msup><mi>x</mi><mn>2</mn></msup><mo>+</mo><mn>1</mn></mrow><mn>2</mn></mfrac></math>";
    expect(convertMathMlToLatex(mathml)).toBe("\\frac{x^{2}+1}{2}");
    expect(convertWordHtmlToMathText(`<p>Nilai ${mathml}</p>`)).toBe(
      "Nilai $\\frac{x^{2}+1}{2}$"
    );
  });

  it("mengonversi OMML integral dan matriks", () => {
    const ommlMatrix =
      "<m:m><m:mr><m:e><m:r><m:t>1</m:t></m:r></m:e><m:e><m:r><m:t>2</m:t></m:r></m:e></m:mr><m:mr><m:e><m:r><m:t>3</m:t></m:r></m:e><m:e><m:r><m:t>4</m:t></m:r></m:e></m:mr></m:m>";
    expect(convertOmmlToLatex(ommlMatrix)).toBe(
      "\\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}"
    );
  });
});

describe("normalizePastedPlainText", () => {
  it("membungkus otomatis LaTeX mentah hasil copy Word Equation -> LaTeX", () => {
    expect(normalizePastedPlainText("\\frac{x^2 + 1}{2}")).toBe(
      "$\\frac{x^2 + 1}{2}$"
    );
  });

  it("tidak membungkus ulang teks yang sudah memiliki tanda $ atau teks biasa", () => {
    expect(normalizePastedPlainText("Nilai $\\frac{1}{2}$")).toBe(
      "Nilai $\\frac{1}{2}$"
    );
    expect(normalizePastedPlainText("Ibu kota Indonesia adalah Jakarta")).toBe(
      "Ibu kota Indonesia adalah Jakarta"
    );
  });
});
