#!/usr/bin/env node

import { execFile as execFileCb } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);

const ROOT = process.cwd();
const ACK_PATH = path.join(ROOT, "ops", "faq-review.local.json");
const ARTIFACT_DIR = path.join(ROOT, "artifacts", "faq-offer");

const args = new Set(process.argv.slice(2));
const strictMode = args.has("--strict");
const writeAck = args.has("--ack");
const runId = `FAQ-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;

const MODULE_RULES = [
  {
    id: "admin_super",
    title: "Admin Super",
    match: (file) => file.startsWith("src/pages/admin/") || file.startsWith("src/components/admin/"),
    suggestions: [
      "Apa dampak perubahan terbaru di menu admin terhadap workflow operasional harian?",
      "Apa parameter baru yang perlu diatur admin setelah fitur ini dirilis?",
      "Bagaimana indikator sukses dan risiko dari fitur admin terbaru?",
    ],
  },
  {
    id: "admin_org",
    title: "Admin Organisasi",
    match: (file) =>
      file.startsWith("src/pages/org/") ||
      file.startsWith("src/components/org/") ||
      file.startsWith("src/components/admin/organization/"),
    suggestions: [
      "Bagaimana perubahan ini digunakan oleh admin organisasi langkah demi langkah?",
      "Apa data yang wajib disiapkan sebelum memakai fitur organisasi terbaru?",
      "Bagaimana troubleshooting paling umum pada fitur organisasi ini?",
    ],
  },
  {
    id: "employee",
    title: "Pegawai",
    match: (file) => file.startsWith("src/pages/employee/") || file.startsWith("src/components/employee/"),
    suggestions: [
      "Bagaimana cara pegawai menggunakan fitur baru ini dari dashboard mobile?",
      "Apa syarat perangkat/sesi agar fitur pegawai ini berjalan normal?",
      "Apa yang harus dilakukan jika fitur baru pegawai gagal atau loading lama?",
    ],
  },
  {
    id: "dashboard_desktop",
    title: "Dashboard Desktop",
    match: (file) => file.startsWith("src/pages/dashboard/") || file.startsWith("src/components/dashboard/"),
    suggestions: [
      "Apa perbedaan alur dashboard desktop vs dashboard mobile setelah perubahan ini?",
      "Menu/tab mana yang berubah dan bagaimana cara pakainya di desktop?",
      "Bagaimana hubungan data dashboard desktop dengan data absensi utama?",
    ],
  },
  {
    id: "auth_security",
    title: "Auth & Keamanan",
    match: (file) =>
      file.startsWith("src/pages/auth/") ||
      file.startsWith("src/components/auth/") ||
      file.includes("Security") ||
      file.includes("security"),
    suggestions: [
      "Bagaimana alur login/lupa password setelah perubahan keamanan terbaru?",
      "Kapan user akan menerima lock/rate-limit dan berapa durasinya?",
      "Bagaimana membaca Ref ID/trace saat autentikasi gagal?",
    ],
  },
  {
    id: "notifications",
    title: "Notifikasi",
    match: (file) => file.includes("Notification") || file.includes("notifications"),
    suggestions: [
      "Bagaimana memilih target notifikasi (semua, individu, OPD, unit kerja)?",
      "Ke mana notifikasi dikirim (in-app, email, WhatsApp) setelah perubahan ini?",
      "Bagaimana memverifikasi notifikasi masuk ke riwayat dan dashboard target?",
    ],
  },
  {
    id: "reports",
    title: "Laporan",
    match: (file) => file.includes("/reports/") || file.includes("Report"),
    suggestions: [
      "Filter apa saja yang tersedia pada laporan setelah update?",
      "Apakah fitur print/export PDF berubah dan bagaimana langkah pakainya?",
      "Bagaimana membaca indikator penting pada laporan terbaru?",
    ],
  },
  {
    id: "schedule_attendance",
    title: "Jadwal & Absensi",
    match: (file) => file.includes("schedule") || file.includes("Attendance") || file.includes("attendance"),
    suggestions: [
      "Bagaimana perubahan jadwal mempengaruhi status hadir/terlambat/pulang?",
      "Apakah aturan shift/hari kerja berubah setelah update ini?",
      "Apa fallback jika data absensi belum sempat sinkron ke server?",
    ],
  },
  {
    id: "billing_streak",
    title: "Billing & Streak",
    match: (file) =>
      file.includes("billing") ||
      file.includes("streak") ||
      file.includes("payment") ||
      file.includes("subscription"),
    suggestions: [
      "Bagaimana transisi status streak->billing setelah perubahan ini?",
      "Kapan pengingat invoice/grace period dikirim dan ke siapa?",
      "Apa langkah aktivasi ulang setelah pembayaran tervalidasi?",
    ],
  },
  {
    id: "landing_public",
    title: "Landing & Publik",
    match: (file) =>
      file === "src/pages/Index.tsx" ||
      file === "src/pages/About.tsx" ||
      file === "src/pages/FAQ.tsx" ||
      file.startsWith("src/components/homepage/") ||
      file.includes("Homepage"),
    suggestions: [
      "Bagian halaman publik mana yang berubah dan dampaknya ke calon pelanggan?",
      "Bagaimana chat agent menjawab pertanyaan setelah update konten ini?",
      "Apakah CTA, paket, fitur, atau FAQ publik perlu penyesuaian wording?",
    ],
  },
  {
    id: "backend_db",
    title: "Backend/DB",
    match: (file) => file.startsWith("supabase/functions/") || file.startsWith("supabase/migrations/"),
    suggestions: [
      "Perubahan backend ini memengaruhi menu/fitur mana di frontend?",
      "Apakah ada konfigurasi env/secrets baru yang wajib dilengkapi?",
      "Bagaimana rollback/troubleshooting jika migration atau edge function gagal?",
    ],
  },
];

async function runGit(argsList) {
  const result = await execFile("git", argsList, { cwd: ROOT, maxBuffer: 10 * 1024 * 1024 });
  return result.stdout.trim();
}

function parsePorcelain(raw) {
  const files = new Set();
  for (const line of raw.split("\n").map((v) => v.trimEnd()).filter(Boolean)) {
    if (line.length < 4) continue;
    const payload = line.slice(3).trim();
    if (!payload) continue;
    if (payload.includes(" -> ")) {
      const parts = payload.split(" -> ");
      files.add(parts[parts.length - 1].trim());
      continue;
    }
    files.add(payload);
  }
  return [...files].sort((a, b) => a.localeCompare(b));
}

async function getChangedFiles() {
  try {
    const porcelain = await runGit(["status", "--porcelain"]);
    return parsePorcelain(porcelain);
  } catch {
    return [];
  }
}

function isFeatureFile(file) {
  if (!file.startsWith("src/") && !file.startsWith("supabase/")) return false;
  if (file.startsWith("src/components/ui/")) return false;
  return true;
}

function classifyModules(files) {
  const hits = new Map();
  for (const file of files) {
    for (const rule of MODULE_RULES) {
      if (!rule.match(file)) continue;
      if (!hits.has(rule.id)) {
        hits.set(rule.id, {
          id: rule.id,
          title: rule.title,
          files: [],
          suggestions: rule.suggestions,
        });
      }
      hits.get(rule.id).files.push(file);
    }
  }
  return [...hits.values()].map((item) => ({
    ...item,
    files: [...new Set(item.files)].sort((a, b) => a.localeCompare(b)),
  }));
}

function makeFingerprint(files, modules) {
  const hash = createHash("sha256");
  hash.update(files.join("\n"));
  hash.update("\n---\n");
  hash.update(
    modules
      .map((m) => `${m.id}:${m.files.join(",")}`)
      .join("\n"),
  );
  return hash.digest("hex");
}

async function readAck() {
  try {
    const raw = await fs.readFile(ACK_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeAckFile(payload) {
  await fs.mkdir(path.dirname(ACK_PATH), { recursive: true });
  await fs.writeFile(ACK_PATH, JSON.stringify(payload, null, 2), "utf8");
}

function renderMarkdown(summary) {
  const lines = [];
  lines.push(`# FAQ Offer Report`);
  lines.push("");
  lines.push(`- Run ID: ${summary.run_id}`);
  lines.push(`- Generated: ${summary.generated_at}`);
  lines.push(`- Changed files: ${summary.changed_files_count}`);
  lines.push(`- Feature files: ${summary.feature_files_count}`);
  lines.push(`- Fingerprint: ${summary.fingerprint}`);
  lines.push("");
  if (summary.modules.length === 0) {
    lines.push(`Tidak ada perubahan fitur yang terdeteksi. Tidak ada penawaran FAQ baru.`);
    return lines.join("\n");
  }
  lines.push("## Modul Terdampak");
  for (const mod of summary.modules) {
    lines.push(`- ${mod.title} (${mod.files.length} file)`);
  }
  lines.push("");
  lines.push("## Penawaran Update FAQ");
  for (const mod of summary.modules) {
    lines.push(`### ${mod.title}`);
    for (const suggestion of mod.suggestions) {
      lines.push(`- ${suggestion}`);
    }
    lines.push("");
  }
  lines.push("## File Terdampak");
  for (const file of summary.feature_files) {
    lines.push(`- ${file}`);
  }
  return lines.join("\n");
}

async function writeArtifact(summary) {
  await fs.mkdir(ARTIFACT_DIR, { recursive: true });
  await fs.writeFile(path.join(ARTIFACT_DIR, "latest.json"), JSON.stringify(summary, null, 2), "utf8");
  await fs.writeFile(path.join(ARTIFACT_DIR, "latest.md"), renderMarkdown(summary), "utf8");
}

function printSummary(summary, ackInfo) {
  process.stdout.write(`=== FAQ Offer [${summary.run_id}] ===\n`);
  process.stdout.write(`Changed files: ${summary.changed_files_count}\n`);
  process.stdout.write(`Feature files: ${summary.feature_files_count}\n`);
  if (summary.modules.length === 0) {
    process.stdout.write("Tidak ada perubahan fitur. FAQ tidak perlu ditawarkan saat ini.\n");
    return;
  }
  process.stdout.write("Modul terdampak:\n");
  for (const mod of summary.modules) {
    process.stdout.write(`- ${mod.title}: ${mod.files.length} file\n`);
  }
  process.stdout.write("\nPenawaran FAQ:\n");
  for (const mod of summary.modules) {
    process.stdout.write(`\n[${mod.title}]\n`);
    for (const suggestion of mod.suggestions) {
      process.stdout.write(`- ${suggestion}\n`);
    }
  }
  process.stdout.write("\nStatus ack FAQ: ");
  if (!ackInfo) {
    process.stdout.write("BELUM ADA\n");
  } else if (ackInfo.match) {
    process.stdout.write(`OK (${ackInfo.updated_at || "tanpa timestamp"})\n`);
  } else {
    process.stdout.write("PERLU DIPERBARUI\n");
  }
  process.stdout.write("Command:\n");
  process.stdout.write("- npm run faq:offer\n");
  process.stdout.write("- npm run faq:ack    # setelah FAQ benar-benar diperbarui\n");
}

async function main() {
  const changedFiles = await getChangedFiles();
  const featureFiles = changedFiles.filter(isFeatureFile);
  const modules = classifyModules(featureFiles);
  const fingerprint = makeFingerprint(featureFiles, modules);
  const branch = await runGit(["rev-parse", "--abbrev-ref", "HEAD"]).catch(() => "unknown");
  const head = await runGit(["rev-parse", "HEAD"]).catch(() => "unknown");
  const generatedAt = new Date().toISOString();

  const summary = {
    run_id: runId,
    generated_at: generatedAt,
    branch,
    head,
    changed_files_count: changedFiles.length,
    feature_files_count: featureFiles.length,
    changed_files: changedFiles,
    feature_files: featureFiles,
    modules,
    fingerprint,
  };

  const ack = await readAck();
  const ackMatch = Boolean(ack && ack.fingerprint === fingerprint && ack.feature_files_count === featureFiles.length);
  const ackInfo = ack
    ? { match: ackMatch, updated_at: ack.updated_at || "", fingerprint: ack.fingerprint || "" }
    : null;

  await writeArtifact(summary);
  printSummary(summary, ackInfo);

  if (writeAck) {
    await writeAckFile({
      updated_at: generatedAt,
      run_id: runId,
      branch,
      head,
      changed_files_count: changedFiles.length,
      feature_files_count: featureFiles.length,
      modules: modules.map((m) => ({ id: m.id, title: m.title, file_count: m.files.length })),
      fingerprint,
    });
    process.stdout.write(`\nFAQ ack tersimpan: ${path.relative(ROOT, ACK_PATH)}\n`);
  }

  if (strictMode && modules.length > 0 && !ackMatch) {
    process.stdout.write(
      `\nERR-${runId}: Perubahan fitur terdeteksi tetapi FAQ belum di-ack. Jalankan 'npm run faq:offer' lalu 'npm run faq:ack'.\n`,
    );
    process.exitCode = 2;
    return;
  }

  if (strictMode) {
    process.stdout.write(`\nFAQ check: OK\n`);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stdout.write(`ERR-${runId}: ${message}\n`);
  process.exitCode = 1;
});
