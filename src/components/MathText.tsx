import katex from "katex";
import { splitMathSegments } from "@/lib/math-format";

interface MathTextProps {
  text: string | null | undefined;
  className?: string;
}

function renderKatexHtml(expr: string, displayMode: boolean): string | null {
  try {
    return katex.renderToString(expr, {
      displayMode,
      throwOnError: false,
      strict: false,
      trust: false,
    });
  } catch {
    return null;
  }
}

/**
 * Merender teks soal/opsi CBT dengan dukungan rumus matematika KaTeX ($...$ dan $$...$$).
 * Aman untuk teks biasa (tanpa rumus langsung tampil sebagai string murni) dan aman dari XSS (trust: false).
 */
export default function MathText({ text, className }: MathTextProps) {
  if (!text) return null;

  if (!text.includes("$")) {
    return className ? <span className={className}>{text}</span> : <>{text}</>;
  }

  const segments = splitMathSegments(text);

  return (
    <span className={className}>
      {segments.map((seg, idx) => {
        if (seg.type === "text") {
          return <span key={idx}>{seg.content}</span>;
        }

        const isDisplay = seg.type === "display-math";
        const html = renderKatexHtml(seg.content, isDisplay);

        if (!html) {
          return (
            <span key={idx}>
              {isDisplay ? `$$${seg.content}$$` : `$${seg.content}$`}
            </span>
          );
        }

        if (isDisplay) {
          return (
            <span
              key={idx}
              className="cbt-math-display block my-1.5 overflow-x-auto max-w-full py-0.5"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          );
        }

        return (
          <span
            key={idx}
            className="cbt-math-inline"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      })}
    </span>
  );
}
