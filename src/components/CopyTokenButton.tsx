"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export default function CopyTokenButton({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback sederhana untuk konteks non-clipboard
      const ta = document.createElement("textarea");
      ta.value = token;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title="Salin token ujian"
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-mono text-xs font-bold border transition cursor-pointer ${
        copied
          ? "bg-emerald-50 border-emerald-300 text-emerald-700"
          : "bg-slate-100 hover:bg-blue-50 border-slate-200 hover:border-blue-300 text-slate-800 hover:text-blue-700"
      }`}
    >
      <span>{token}</span>
      {copied ? (
        <Check className="w-3.5 h-3.5 text-emerald-600" />
      ) : (
        <Copy className="w-3.5 h-3.5 opacity-70" />
      )}
    </button>
  );
}
