"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ExamSchedule, Profile, SchoolSettings } from "@/types/cbt";
import { Printer, ArrowLeft, Loader2 } from "lucide-react";

interface Props {
  schedule: ExamSchedule;
  peserta: Profile[];
  settings: SchoolSettings;
  onBack: () => void;
}

interface LogSummary {
  pindahTab: number;
  keluarFullscreen: number;
  splitScreen: number;
  bukaKunci: number;
  resetLogin: number;
}

function formatLongDateId(iso: string): {
  hari: string;
  tanggalLengkap: string;
  jam: string;
} {
  const dt = new Date(iso);
  const hari = new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    timeZone: "Asia/Makassar",
  }).format(dt);
  const tanggalLengkap = new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Makassar",
  }).format(dt);
  const jam = new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Makassar",
  }).format(dt);
  return { hari, tanggalLengkap, jam };
}

/**
 * Tampilan Pratinjau & Cetak Berita Acara Pelaksanaan Ujian Berbasis Komputer (CBT).
 * Otomatis menarik data kehadiran, peserta tidak hadir, dan catatan log pelanggaran dari database.
 */
export default function BeritaAcaraPrintView({
  schedule,
  peserta,
  settings,
  onBack,
}: Props) {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [hadirIds, setHadirIds] = useState<Set<string>>(new Set());
  const [selesaiIds, setSelesaiIds] = useState<Set<string>>(new Set());
  const [logSummary, setLogSummary] = useState<LogSummary>({
    pindahTab: 0,
    keluarFullscreen: 0,
    splitScreen: 0,
    bukaKunci: 0,
    resetLogin: 0,
  });

  // Isian opsional pengawas sebelum cetak (tidak ikut tercetak sebagai form)
  const [ruangUjian, setRuangUjian] = useState(schedule.classes?.nama || "");
  const [namaPengawas, setNamaPengawas] = useState("");
  const [nipPengawas, setNipPengawas] = useState("");
  const [namaProktor, setNamaProktor] = useState("");
  const [catatan, setCatatan] = useState("");

  useEffect(() => {
    let active = true;
    async function loadAttendanceStats() {
      setLoading(true);
      try {
        const studentIds = peserta.map((p) => p.id);
        if (studentIds.length === 0) {
          if (active) {
            setCatatan(
              "Belum ada siswa terdaftar pada kelas ini."
            );
            setLoading(false);
          }
          return;
        }

        const { data: attempts } = await supabase
          .from("attempts")
          .select("id, student_id, status")
          .eq("exam_id", schedule.exam_id)
          .in("student_id", studentIds);

        const attList = (attempts || []) as Array<{
          id: number;
          student_id: string;
          status: string;
        }>;
        const hSet = new Set<string>();
        const sSet = new Set<string>();
        attList.forEach((a) => {
          hSet.add(a.student_id);
          if (a.status === "selesai" || a.status === "menunggu_koreksi") {
            sSet.add(a.student_id);
          }
        });

        const summary: LogSummary = {
          pindahTab: 0,
          keluarFullscreen: 0,
          splitScreen: 0,
          bukaKunci: 0,
          resetLogin: 0,
        };

        const attIds = attList.map((a) => a.id);
        if (attIds.length > 0) {
          const { data: logs } = await supabase
            .from("attempt_logs")
            .select("jenis")
            .in("attempt_id", attIds);
          (logs || []).forEach((l: { jenis: string }) => {
            if (l.jenis === "pindah_tab") summary.pindahTab += 1;
            else if (l.jenis === "keluar_layar_penuh") summary.keluarFullscreen += 1;
            else if (l.jenis === "split_screen") summary.splitScreen += 1;
            else if (l.jenis === "buka_kunci") summary.bukaKunci += 1;
            else if (l.jenis === "reset_login") summary.resetLogin += 1;
          });
        }

        if (!active) return;
        setHadirIds(hSet);
        setSelesaiIds(sSet);
        setLogSummary(summary);

        const parts: string[] = [];
        if (summary.pindahTab > 0)
          parts.push(`${summary.pindahTab}x catatan pindah tab/jendela`);
        if (summary.splitScreen > 0)
          parts.push(`${summary.splitScreen}x deteksi split-screen`);
        if (summary.keluarFullscreen > 0)
          parts.push(`${summary.keluarFullscreen}x keluar layar penuh`);
        if (summary.bukaKunci > 0)
          parts.push(`${summary.bukaKunci}x buka kunci layar oleh pengawas`);
        if (summary.resetLogin > 0)
          parts.push(`${summary.resetLogin}x reset login perangkat`);

        setCatatan(
          parts.length > 0
            ? `Pelaksanaan ujian berjalan tertib. Catatan sistem: ${parts.join(", ")}.`
            : "Pelaksanaan ujian berjalan dengan aman, lancar, dan tertib tanpa kendala teknis maupun pelanggaran."
        );
      } finally {
        if (active) setLoading(false);
      }
    }

    loadAttendanceStats();
    return () => {
      active = false;
    };
  }, [supabase, schedule.exam_id, peserta]);

  const startInfo = formatLongDateId(schedule.mulai);
  const endInfo = formatLongDateId(schedule.selesai);
  const tidakHadirList = peserta.filter((p) => !hadirIds.has(p.id));
  const hadirCount = hadirIds.size;
  const selesaiCount = selesaiIds.size;

  return (
    <div className="space-y-4">
      {/* Toolbar & Form Isian Pengawas (tidak ikut dicetak) */}
      <div className="no-print bg-white p-4 sm:p-5 rounded-xl border border-slate-200 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-bold text-slate-900">
              Pratinjau Berita Acara Ujian
            </h2>
            <p className="text-xs text-slate-500">
              Data kehadiran & catatan pelanggaran diisi otomatis dari database. Lengkapi nama pengawas/proktor bila perlu lalu cetak atau simpan PDF.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => window.print()}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold cursor-pointer"
            >
              <Printer className="w-4 h-4" /> Cetak / Simpan PDF
            </button>
            <button
              onClick={onBack}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" /> Kembali
            </button>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Ruang / Kelas Ujian
            </label>
            <input
              type="text"
              value={ruangUjian}
              onChange={(e) => setRuangUjian(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Nama Pengawas Ruang (Opsional)
            </label>
            <input
              type="text"
              value={namaPengawas}
              onChange={(e) => setNamaPengawas(e.target.value)}
              placeholder="Kosongkan untuk tulis tangan"
              className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              NIP Pengawas (Opsional)
            </label>
            <input
              type="text"
              value={nipPengawas}
              onChange={(e) => setNipPengawas(e.target.value)}
              placeholder="Opsional"
              className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Nama Proktor / Admin (Opsional)
            </label>
            <input
              type="text"
              value={namaProktor}
              onChange={(e) => setNamaProktor(e.target.value)}
              placeholder="Kosongkan untuk tulis tangan"
              className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-sm"
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Catatan Kejadian Selama Ujian (Bisa diedit sebelum cetak)
            </label>
            <textarea
              rows={2}
              value={catatan}
              onChange={(e) => setCatatan(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-sm"
            />
          </div>
        </div>
      </div>

      {/* Dokumen Cetak Resmi Berita Acara */}
      <div className="bg-white p-6 sm:p-10 rounded-xl border border-slate-200 text-slate-900 max-w-4xl mx-auto">
        {loading ? (
          <div className="py-12 flex items-center justify-center gap-2 text-slate-500 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Memuat data kehadiran & log ujian...
          </div>
        ) : (
          <div className="space-y-5 text-sm leading-relaxed">
            {/* Kop Surat */}
            <div className="flex items-center gap-4 border-b-2 border-slate-900 pb-4">
              {settings.logo && (
                <img
                  src={settings.logo}
                  alt="Logo"
                  className="w-16 h-16 object-contain shrink-0"
                />
              )}
              <div className="flex-1 text-center">
                <div className="text-base sm:text-lg font-bold uppercase tracking-wide">
                  BERITA ACARA PELAKSANAAN UJIAN BERBASIS KOMPUTER (CBT)
                </div>
                <div className="font-bold text-base uppercase">
                  {settings.nama_sekolah}
                </div>
                {settings.alamat_sekolah && (
                  <div className="text-xs text-slate-600">
                    {settings.alamat_sekolah}
                  </div>
                )}
              </div>
            </div>

            {/* Paragraf Pembuka */}
            <p className="text-justify">
              Pada hari ini <strong>{startInfo.hari}</strong> tanggal{" "}
              <strong>{startInfo.tanggalLengkap}</strong>, pukul{" "}
              <strong>
                {startInfo.jam} – {endInfo.jam} WITA
              </strong>
              , bertempat di <strong>{settings.nama_sekolah}</strong>, telah
              dilaksanakan Ujian Berbasis Komputer (CBT) dengan rincian sebagai
              berikut:
            </p>

            {/* Rincian Ujian */}
            <table className="w-full text-sm border-collapse">
              <tbody>
                <tr>
                  <td className="py-1 w-44 text-slate-600">Nama Ujian</td>
                  <td className="py-1 font-semibold">
                    : {schedule.exams?.judul || "-"}
                  </td>
                </tr>
                <tr>
                  <td className="py-1 text-slate-600">Mata Pelajaran</td>
                  <td className="py-1 font-semibold">
                    : {schedule.exams?.subjects?.nama || "-"}
                  </td>
                </tr>
                <tr>
                  <td className="py-1 text-slate-600">Kelas / Ruang</td>
                  <td className="py-1">
                    : {ruangUjian || schedule.classes?.nama || "-"}
                  </td>
                </tr>
                <tr>
                  <td className="py-1 text-slate-600">Sesi / Durasi</td>
                  <td className="py-1">
                    : {schedule.sesi} ({schedule.exams?.durasi || 60} menit) •
                    Token:{" "}
                    <span className="font-mono font-bold">
                      {schedule.exams?.token || "-"}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Ringkasan Kehadiran */}
            <div>
              <div className="font-bold mb-2">
                1. Rekapitulasi Kehadiran Peserta
              </div>
              <table className="w-full text-sm border-collapse border border-slate-800">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="border border-slate-800 px-3 py-2">
                      Terdaftar
                    </th>
                    <th className="border border-slate-800 px-3 py-2">
                      Hadir / Mengerjakan
                    </th>
                    <th className="border border-slate-800 px-3 py-2">
                      Sudah Mengumpulkan
                    </th>
                    <th className="border border-slate-800 px-3 py-2">
                      Tidak Hadir
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="text-center font-bold text-base">
                    <td className="border border-slate-800 px-3 py-2.5">
                      {peserta.length} orang
                    </td>
                    <td className="border border-slate-800 px-3 py-2.5">
                      {hadirCount} orang
                    </td>
                    <td className="border border-slate-800 px-3 py-2.5">
                      {selesaiCount} orang
                    </td>
                    <td className="border border-slate-800 px-3 py-2.5">
                      {tidakHadirList.length} orang
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Daftar Peserta Tidak Hadir */}
            <div>
              <div className="font-bold mb-1.5">
                2. Daftar Peserta Tidak Hadir
              </div>
              {tidakHadirList.length === 0 ? (
                <div className="border border-slate-800 px-3 py-2 text-xs italic text-slate-600">
                  Nihil — seluruh peserta kelas ini mengikuti ujian.
                </div>
              ) : (
                <table className="w-full text-xs border-collapse border border-slate-800">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="border border-slate-800 px-2.5 py-1.5 w-10">
                        No
                      </th>
                      <th className="border border-slate-800 px-2.5 py-1.5 text-left w-32">
                        NIS
                      </th>
                      <th className="border border-slate-800 px-2.5 py-1.5 text-left">
                        Nama Peserta
                      </th>
                      <th className="border border-slate-800 px-2.5 py-1.5 text-left w-36">
                        Keterangan
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {tidakHadirList.map((st, idx) => (
                      <tr key={st.id}>
                        <td className="border border-slate-800 px-2.5 py-1.5 text-center">
                          {idx + 1}
                        </td>
                        <td className="border border-slate-800 px-2.5 py-1.5 font-mono">
                          {st.username}
                        </td>
                        <td className="border border-slate-800 px-2.5 py-1.5">
                          {st.nama}
                        </td>
                        <td className="border border-slate-800 px-2.5 py-1.5 text-slate-500">
                          Belum / Tidak hadir
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Catatan Kejadian */}
            <div>
              <div className="font-bold mb-1.5">
                3. Catatan Selama Pelaksanaan Ujian
              </div>
              <div className="border border-slate-800 p-3 min-h-16 whitespace-pre-wrap text-sm">
                {catatan}
              </div>
              {(logSummary.pindahTab > 0 ||
                logSummary.bukaKunci > 0 ||
                logSummary.resetLogin > 0) && (
                <div className="text-[11px] text-slate-500 mt-1">
                  Ringkasan log sistem: Pindah tab {logSummary.pindahTab}x •
                  Split-screen {logSummary.splitScreen}x • Buka kunci{" "}
                  {logSummary.bukaKunci}x • Reset login {logSummary.resetLogin}x
                </div>
              )}
            </div>

            <p className="text-justify pt-1">
              Demikian berita acara ini dibuat dengan sesungguhnya untuk dapat
              dipergunakan sebagaimana mestinya.
            </p>

            {/* Tanda Tangan Ganda */}
            <div className="pt-4 grid grid-cols-2 gap-8 text-center print-break-inside-avoid">
              <div>
                <div className="h-5" />
                <div>Proktor / Admin CBT,</div>
                <div className="h-20" />
                <div className="font-semibold underline">
                  {namaProktor.trim() || "(.......................................)"}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-700 mb-0.5">
                  Kotamobagu, {startInfo.tanggalLengkap}
                </div>
                <div>Pengawas Ruang,</div>
                <div className="h-20" />
                <div className="font-semibold underline">
                  {namaPengawas.trim() || "(.......................................)"}
                </div>
                {nipPengawas.trim() && (
                  <div className="text-xs mt-0.5">NIP. {nipPengawas.trim()}</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
