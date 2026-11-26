export type RemedialRule = "maks_kkm" | "nilai_terbaik" | "nilai_terakhir";

export interface RawStudentAttempt {
  id: number;
  student_id: string;
  attempt_ke?: number | null;
  is_remedial?: boolean | null;
  status: string;
  nilai: number | null;
  nilai_sementara: number | null;
  mulai: string;
  selesai: string | null;
  profiles: {
    id?: string;
    username: string;
    nama: string;
    kelas_id?: number | null;
    classes: { nama: string } | null;
  } | null;
}

export interface AggregatedStudentGrade {
  student_id: string;
  username: string;
  nama: string;
  kelas_id: number | null;
  kelas_nama: string;
  latest_attempt_id: number;
  latest_attempt_ke: number;
  latest_status: string;
  nilai_utama: number | null;
  nilai_remedial: number | null;
  nilai_akhir: number | null;
  mulai: string;
  selesai: string | null;
  keterangan:
    | "Tuntas"
    | "Tuntas Remedial"
    | "Belum Tuntas"
    | "Menunggu Koreksi"
    | "Mengerjakan";
  needs_remedial: boolean;
}

export function remedialRuleLabel(rule: RemedialRule | string | undefined): string {
  switch (rule) {
    case "nilai_terbaik":
      return "Nilai Terbaik (MAX)";
    case "nilai_terakhir":
      return "Nilai Remedial Terakhir";
    case "maks_kkm":
    default:
      return "Maksimal KKM (Cap KKM)";
  }
}

export function aggregateGradesByStudent(
  attempts: RawStudentAttempt[],
  kkm: number,
  rule: RemedialRule = "maks_kkm"
): AggregatedStudentGrade[] {
  const byStudent = new Map<string, RawStudentAttempt[]>();
  for (const a of attempts) {
    const sid = a.student_id || a.profiles?.id || String(a.id);
    if (!byStudent.has(sid)) byStudent.set(sid, []);
    byStudent.get(sid)!.push(a);
  }

  const results: AggregatedStudentGrade[] = [];

  for (const [student_id, list] of byStudent.entries()) {
    const sorted = [...list].sort(
      (a, b) => (a.attempt_ke || 1) - (b.attempt_ke || 1)
    );
    const primary = sorted[0];
    const latest = sorted[sorted.length - 1];
    const remedials = sorted.filter((x) => (x.attempt_ke || 1) > 1);
    const finishedRemedials = remedials.filter(
      (x) => x.status === "selesai" && x.nilai !== null
    );

    const nilaiUtama =
      primary.status === "selesai"
        ? primary.nilai
        : primary.status === "menunggu_koreksi"
        ? primary.nilai_sementara
        : null;

    const latestRem =
      finishedRemedials.length > 0
        ? finishedRemedials[finishedRemedials.length - 1]
        : null;
    const nilaiRemedial = latestRem ? latestRem.nilai : null;

    let nilaiAkhir: number | null = nilaiUtama;
    if (nilaiRemedial !== null) {
      if (rule === "maks_kkm") {
        if (nilaiRemedial >= kkm) {
          nilaiAkhir = Math.max(nilaiUtama ?? 0, kkm);
        } else {
          nilaiAkhir = Math.max(nilaiUtama ?? 0, nilaiRemedial);
        }
      } else if (rule === "nilai_terbaik") {
        nilaiAkhir = Math.max(nilaiUtama ?? 0, nilaiRemedial);
      } else {
        nilaiAkhir = nilaiRemedial;
      }
    }

    let keterangan: AggregatedStudentGrade["keterangan"] = "Mengerjakan";
    if (latest.status === "mengerjakan") {
      keterangan = "Mengerjakan";
    } else if (latest.status === "menunggu_koreksi") {
      keterangan = "Menunggu Koreksi";
    } else if (nilaiUtama !== null && nilaiUtama >= kkm) {
      keterangan = "Tuntas";
    } else if (nilaiRemedial !== null && nilaiAkhir !== null && nilaiAkhir >= kkm) {
      keterangan = "Tuntas Remedial";
    } else {
      keterangan = "Belum Tuntas";
    }

    const needs_remedial =
      latest.status === "selesai" && nilaiAkhir !== null && nilaiAkhir < kkm;

    results.push({
      student_id,
      username: primary.profiles?.username || "-",
      nama: primary.profiles?.nama || "-",
      kelas_id: primary.profiles?.kelas_id ?? null,
      kelas_nama: primary.profiles?.classes?.nama || "-",
      latest_attempt_id: latest.id,
      latest_attempt_ke: latest.attempt_ke || 1,
      latest_status: latest.status,
      nilai_utama: nilaiUtama,
      nilai_remedial: nilaiRemedial,
      nilai_akhir: nilaiAkhir,
      mulai: primary.mulai,
      selesai: latest.selesai,
      keterangan,
      needs_remedial,
    });
  }

  return results.sort((a, b) => a.nama.localeCompare(b.nama));
}
