import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getCurrentUserProfile } from "@/lib/server-auth";

const BACKUP_TABLES = [
  "settings",
  "academic_years",
  "classes",
  "subjects",
  "profiles",
  "questions",
  "question_options",
  "exams",
  "exam_questions",
  "exam_schedules",
  "exam_overrides",
  "attempts",
  "answers",
  "attempt_logs",
] as const;

function sqlEscape(val: unknown): string {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
  if (typeof val === "number") return Number.isFinite(val) ? String(val) : "NULL";
  if (typeof val === "object") {
    const jsonStr = JSON.stringify(val).replace(/'/g, "''");
    return `'${jsonStr}'::jsonb`;
  }
  const str = String(val).replace(/'/g, "''");
  return `'${str}'`;
}

export async function GET() {
  const { profile } = await getCurrentUserProfile();
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Akses khusus Admin." }, { status: 403 });
  }

  try {
    const admin = createAdminSupabase();
    const timestamp = new Date().toISOString();
    const lines: string[] = [
      `-- ==============================================================`,
      `-- Backup Database CBT Sekolah`,
      `-- Dibuat pada: ${timestamp}`,
      `-- ==============================================================`,
      `BEGIN;`,
      ``,
    ];

    for (const table of BACKUP_TABLES) {
      const { data, error } = await admin.from(table).select("*");
      if (error) {
        lines.push(`-- Gagal membaca tabel ${table}: ${error.message}`);
        continue;
      }
      lines.push(`-- Tabel: public.${table} (${data?.length || 0} baris)`);
      if (!data || data.length === 0) {
        lines.push(``);
        continue;
      }

      for (const row of data) {
        const cols = Object.keys(row);
        const colList = cols.map((c) => `"${c}"`).join(", ");
        const valList = cols.map((c) => sqlEscape(row[c])).join(", ");
        const usesIdentity = cols.includes("id") && table !== "profiles";
        const overrideClause = usesIdentity ? " OVERRIDING SYSTEM VALUE" : "";
        lines.push(
          `INSERT INTO public."${table}" (${colList})${overrideClause} VALUES (${valList}) ON CONFLICT DO NOTHING;`
        );
      }
      lines.push(``);
    }

    lines.push(`COMMIT;`);

    const filename = `backup-cbt-${timestamp.slice(0, 10)}.sql`;
    return new NextResponse(lines.join("\n"), {
      status: 200,
      headers: {
        "Content-Type": "application/sql; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error("Backup error:", err);
    return NextResponse.json(
      { error: "Gagal membuat berkas backup." },
      { status: 500 }
    );
  }
}
