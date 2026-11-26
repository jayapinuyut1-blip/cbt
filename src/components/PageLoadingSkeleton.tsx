import { Loader2 } from "lucide-react";

/**
 * Skeleton animasi halus untuk transisi antar halaman di dalam panel Admin, Guru, dan Siswa.
 */
export default function PageLoadingSkeleton({
  label = "Memuat halaman...",
}: {
  label?: string;
}) {
  return (
    <div
      className="space-y-5 animate-cbt-fade-in"
      role="status"
      aria-label={label}
    >
      {/* Header Skeleton */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <div className="h-7 w-56 rounded-lg bg-slate-200/80 cbt-shimmer" />
          <div className="h-4 w-80 max-w-full rounded-md bg-slate-200/60 cbt-shimmer" />
        </div>
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white border border-slate-200 shadow-2xs text-xs font-medium text-slate-600">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
          <span>{label}</span>
        </div>
      </div>

      {/* Stat Cards Skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-white rounded-xl border border-slate-200/80 p-4 space-y-2.5"
          >
            <div className="h-3.5 w-24 rounded bg-slate-200/70 cbt-shimmer" />
            <div className="h-7 w-16 rounded-md bg-slate-200/90 cbt-shimmer" />
          </div>
        ))}
      </div>

      {/* Content Cards Skeleton */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="h-5 w-44 rounded bg-slate-200/80 cbt-shimmer" />
          <div className="h-8 w-28 rounded-lg bg-slate-200/70 cbt-shimmer" />
        </div>
        <div className="space-y-3">
          {[0, 1, 2, 3].map((row) => (
            <div
              key={row}
              className="h-12 w-full rounded-xl bg-slate-100/90 cbt-shimmer"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
