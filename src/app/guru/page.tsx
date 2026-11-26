import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { getCurrentUserProfile } from "@/lib/server-auth";
import { FileText, ClipboardList, PenTool, AlertTriangle } from "lucide-react";

export default async function GuruDashboardPage() {
  const supabase = await createServerSupabase();
  const { profile } = await getCurrentUserProfile();

  let allowedSubjects: Array<{ id: number; nama: string }> = [];
  let isAdmin = profile?.role === "admin";

  if (isAdmin) {
    const { data } = await supabase.from("subjects").select("id, nama").order("nama");
    allowedSubjects = data || [];
  } else if (profile) {
    const { data: links } = await supabase
      .from("teacher_subjects")
      .select("subject_id, subjects(id, nama)")
      .eq("guru_id", profile.id);
    allowedSubjects = (links || [])
      .map((l) => l.subjects as unknown as { id: number; nama: string } | null)
      .filter((s): s is { id: number; nama: string } => Boolean(s && s.id))
      .sort((a, b) => a.nama.localeCompare(b.nama));
  }

  const subjectIds = allowedSubjects.map((s) => s.id);

  let qCount = 0;
  let eCount = 0;
  let pendingEssay = 0;

  if (subjectIds.length > 0) {
    const [{ count: qc }, { data: examRows }] = await Promise.all([
      supabase
        .from("questions")
        .select("id", { count: "exact", head: true })
        .in("subject_id", subjectIds),
      supabase.from("exams").select("id").in("subject_id", subjectIds),
    ]);

    qCount = qc || 0;
    const examIds = (examRows || []).map((e) => e.id);
    eCount = examIds.length;

    if (examIds.length > 0) {
      const { count: pc } = await supabase
        .from("attempts")
        .select("id", { count: "exact", head: true })
        .eq("status", "menunggu_koreksi")
        .in("exam_id", examIds);
      pendingEssay = pc || 0;
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Beranda Guru</h1>
        <p className="text-sm text-slate-500">
          Kelola bank soal, susun paket ujian, pratinjau tampilan siswa, dan koreksi jawaban essay untuk mapel yang Anda ampu.
        </p>

        {!isAdmin && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-500">
              Mapel Diampu:
            </span>
            {allowedSubjects.length > 0 ? (
              allowedSubjects.map((s) => (
                <span
                  key={s.id}
                  className="px-2.5 py-0.5 text-xs rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 font-medium"
                >
                  {s.nama}
                </span>
              ))
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                <AlertTriangle className="w-3.5 h-3.5" /> Belum ada mapel yang dipasangkan oleh Admin
              </span>
            )}
          </div>
        )}
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-900">{qCount}</div>
            <div className="text-xs text-slate-500">Total Bank Soal</div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
            <ClipboardList className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-900">{eCount}</div>
            <div className="text-xs text-slate-500">Paket Ujian</div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-amber-200 p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
            <PenTool className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold text-amber-700">
              {pendingEssay}
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
            Beri skor jawaban essay siswa dan lihat rekap nilai ujian mapel Anda.
          </p>
        </Link>
      </div>
    </div>
  );
}
