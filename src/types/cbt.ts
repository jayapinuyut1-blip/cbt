export type UserRole = "admin" | "guru" | "siswa";
export type QuestionType = "pg" | "isian" | "jodoh" | "essay";
export type ExamKind = "resmi" | "latihan";
export type ExamNavigation = "bebas" | "berurutan";
export type ExamResultVisibility = "tidak" | "nilai" | "nilai_kunci";
export type ExamRemedialRule = "maks_kkm" | "nilai_terbaik" | "nilai_terakhir";
export type AttemptStatus = "mengerjakan" | "menunggu_koreksi" | "selesai";
export type LogEventType = "pindah_tab" | "keluar_layar_penuh" | "reset_login";

export interface AcademicYear {
  id: number;
  nama: string;
  aktif: boolean;
  created_at: string;
}

export interface SchoolClass {
  id: number;
  nama: string;
  tahun_ajaran_id: number | null;
  academic_years?: { id: number; nama: string; aktif: boolean } | null;
}

export interface Subject {
  id: number;
  nama: string;
}

export interface Profile {
  id: string;
  username: string;
  nama: string;
  role: UserRole;
  kelas_id: number | null;
  wajib_ganti_sandi: boolean;
  kata_sandi_awal: string | null;
  active_session_id: string | null;
  is_blocked: boolean;
  aktif: boolean;
  created_at: string;
  classes?: { id: number; nama: string } | null;
}

export interface QuestionOption {
  id: number;
  question_id: number;
  urutan: number;
  teks: string;
  pasangan: string | null;
  benar: boolean;
}

export interface Question {
  id: number;
  subject_id: number;
  guru_id: string | null;
  tipe: QuestionType;
  teks: string;
  gambar: string | null;
  bobot: number;
  created_at: string;
  question_options?: QuestionOption[];
  subjects?: { id: number; nama: string } | null;
}

export interface ExamTypeWeights {
  pg?: number;
  isian?: number;
  jodoh?: number;
  essay?: number;
}

export interface Exam {
  id: number;
  judul: string;
  subject_id: number;
  guru_id: string | null;
  tahun_ajaran_id: number | null;
  durasi: number;
  kkm: number;
  jenis: ExamKind;
  jumlah_soal_acak: number | null;
  acak_soal: boolean;
  acak_opsi: boolean;
  navigasi: ExamNavigation;
  petunjuk: string;
  tampil_hasil: ExamResultVisibility;
  aturan_remedial?: ExamRemedialRule;
  bobot_tipe?: ExamTypeWeights | null;
  token: string;
  created_at: string;
  subjects?: { id: number; nama: string } | null;
}

export interface ExamSchedule {
  id: number;
  exam_id: number;
  kelas_id: number;
  sesi: string;
  mulai: string;
  selesai: string;
  exams?: Exam | null;
  classes?: SchoolClass | null;
}

export interface ExamOverride {
  id: number;
  exam_id: number;
  student_id: string;
  durasi: number | null;
  mulai: string | null;
  selesai: string | null;
  exams?: { id: number; judul: string } | null;
  profiles?: { id: string; nama: string; username: string } | null;
}

export interface SchoolSettings {
  nama_sekolah: string;
  logo: string;
  alamat_sekolah: string;
  tema?: string;
}

export interface StudentAvailableExam {
  exam_id: number;
  judul: string;
  mapel: string;
  durasi: number;
  kkm: number;
  jenis: ExamKind;
  navigasi: ExamNavigation;
  petunjuk: string;
  tampil_hasil: ExamResultVisibility;
  sesi: string;
  mulai_efektif: string;
  selesai_efektif: string;
  jumlah_soal: number;
  attempt_id: number | null;
  attempt_ke?: number | null;
  is_remedial?: boolean | null;
  attempt_status: AttemptStatus | null;
  attempt_mulai: string | null;
  attempt_selesai: string | null;
  nilai_tampil: number | null;
  remedial_tersedia?: boolean;
  remedial_ke?: number;
  aturan_remedial?: ExamRemedialRule;
  sedang_dibuka: boolean;
  server_now: string;
}

export interface SanitizedQuestion {
  id: number;
  tipe: QuestionType;
  teks: string;
  gambar: string | null;
  bobot: number;
  options?: { id: number; teks: string }[];
  left_items?: { id: number; teks: string }[];
  right_items?: string[];
}

export interface AnswerPayload {
  option_id?: number | null;
  text?: string;
  pairs?: Record<string, string>;
}

export interface SavedAnswerState {
  jawaban: AnswerPayload;
  ragu: boolean;
}

export interface ExamSessionPayload {
  attempt_id: number;
  exam: {
    id: number;
    judul: string;
    mapel: string;
    durasi: number;
    jenis: ExamKind;
    navigasi: ExamNavigation;
    petunjuk: string;
  };
  server_now: string;
  deadline: string;
  questions: SanitizedQuestion[];
  answers: Record<string, SavedAnswerState>;
}
