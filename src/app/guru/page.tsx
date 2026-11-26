import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { FileText, ClipboardList, PenTool } from "lucide-react";

export default async function GuruDashboardPage() {
  const supabase = await createServerSupabase();
  const [{ count: qCount }, { count: eCount }, { count: pendingEssay }] =
    await Promise.all([
      supabase.from("questions").select("id", { count: "exact", head: true }),
      supabase.from("exams").select("id", { count: "exact", head: true }),
      supabase
        .from("attempts")
        .select("id", { count: "exact", head: true })
        .eq("status", "menunggu_koreksi"),
    ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Beranda Guru</h1>
        <p className="text-sm text-slate-500">
          Kelola bank soal, susun paket ujian, pratinjau tampilan siswa, dan koreksi jawaban essay.
        </p>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-900">{qCount || 0}</div>
            <div className="text-xs text-slate-500">Total Bank Soal</div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
            <ClipboardList className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-900">{eCount || 0}</div>
            <div className="text-xs text-slate-500">Paket Ujian</div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-amber-200 p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
            <PenTool className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold text-amber-700">
              {pendingEssay || 0}
            </div>
            <div className="text-xs text-slate-500">Menunggu Koreksi Essay</div>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Link
          href="/guru/bank-soal"
          className="bg-white rounded-xl border border-slate-200 p-5 hover:border-blue-400 transition"
        >
          <div className="font-semibold text-slate-900 mb-1">Bank Soal</div>
          <p className="text-sm text-slate-500">
            Tambah soal PG, Isian, Menjodohkan, dan Essay, atau impor/ekspor cepat via Excel.
          </p>
        </Link>
        <Link
          href="/guru/ujian"
          className="bg-white rounded-xl border border-slate-200 p-5 hover:border-blue-400 transition"
        >
          <div className="font-semibold text-slate-900 mb-1">Kelola Ujian</div>
          <p className="text-sm text-slate-500">
            Buat ujian resmi atau latihan, pilih soal manual/acak, dan pratinjau tampilan siswa.
          </p>
        </Link>
        <Link
          href="/guru/koreksi"
          className="bg-white rounded-xl border border-slate-200 p-5 hover:border-blue-400 transition"
        >
          <div className="font-semibold text-slate-900 mb-1">
            Koreksi Essay & Nilai
          </div>
          <p className="text-sm text-slate-500">
            Beri skor jawaban essay siswa dan lihat rekap nilai ujian Anda.
          </p>
        </Link>
      </div>
    </div>
  );
}
