import { Loader2 } from "lucide-react";

export default function RootLoading() {
  return (
    <div
      className="min-h-[100dvh] flex flex-col items-center justify-center p-6 cbt-canvas animate-cbt-fade-in"
      role="status"
      aria-label="Memuat aplikasi"
    >
      <div className="bg-white/95 border border-slate-200 rounded-2xl shadow-sm px-6 py-5 flex items-center gap-3.5">
        <div className="w-10 h-10 rounded-xl cbt-avatar text-white flex items-center justify-center shrink-0">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
        <div>
          <div className="text-sm font-bold text-slate-900">
            Memuat halaman...
          </div>
          <div className="text-xs text-slate-500">
            Mohon tunggu sebentar
          </div>
        </div>
      </div>
    </div>
  );
}
