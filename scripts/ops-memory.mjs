#!/usr/bin/env node

import { execFile as execFileCb } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);

const ROOT = process.cwd();
const MEMORY_DIR = path.join(ROOT, "ops", "memory");
const CURRENT_STATE_FILE = path.join(MEMORY_DIR, "current-state.local.md");
const DECISIONS_FILE = path.join(MEMORY_DIR, "decisions.local.md");
const OPEN_ISSUES_FILE = path.join(MEMORY_DIR, "open-issues.local.md");
const NEXT_ACTIONS_FILE = path.join(MEMORY_DIR, "next-actions.local.md");
const TASK_LOG_FILE = path.join(MEMORY_DIR, "task-log.local.jsonl");

const args = process.argv.slice(2);
const flags = new Set(args);
const isInitOnly = flags.has("--init");
const runTaskUpdate = flags.has("--task") || !isInitOnly;

const readArgValue = (key) => {
  const index = args.indexOf(key);
  if (index === -1) return "";
  const value = args[index + 1];
  if (!value || value.startsWith("--")) return "";
  return value.trim();
};

const splitList = (value) =>
  value
    .split(/[\n;,|]/g)
    .map((item) => item.trim())
    .filter(Boolean);

const toIso = () => new Date().toISOString();
const toRunId = () => `MEM-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;

const templates = {
  currentState: `# Current State

Sumber kebenaran cepat untuk status proyek lintas sesi.

- Last update: -
- Branch: -
- Run ID: -

## Fokus Saat Ini
- Isi fokus prioritas terbaru di sini (manual jika perlu).

## Auto Snapshot
<!-- AUTO_SNAPSHOT_START -->
Belum ada snapshot.
<!-- AUTO_SNAPSHOT_END -->

## Recent Tasks
<!-- AUTO_RECENT_START -->
- Belum ada task.
<!-- AUTO_RECENT_END -->
`,
  decisions: `# Decisions

Catat keputusan penting agar konsisten lintas sesi.

## Log Keputusan
- Belum ada keputusan.
`,
  openIssues: `# Open Issues

Catat blocker/risiko aktif yang belum selesai.

## Daftar Isu
- Belum ada isu terbuka.
`,
  nextActions: `# Next Actions

Daftar aksi berikutnya yang bisa dieksekusi cepat.

## Queue
- Belum ada aksi berikutnya.
`,
};

const placeholderLine = {
  decisions: "- Belum ada keputusan.",
  openIssues: "- Belum ada isu terbuka.",
  nextActions: "- Belum ada aksi berikutnya.",
};

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function ensureMemoryFiles() {
  await fs.mkdir(MEMORY_DIR, { recursive: true });

  const createIfMissing = async (filePath, content) => {
    if (await fileExists(filePath)) return false;
    await fs.writeFile(filePath, content, "utf8");
    return true;
  };

  const created = await Promise.all([
    createIfMissing(CURRENT_STATE_FILE, templates.currentState),
    createIfMissing(DECISIONS_FILE, templates.decisions),
    createIfMissing(OPEN_ISSUES_FILE, templates.openIssues),
    createIfMissing(NEXT_ACTIONS_FILE, templates.nextActions),
    createIfMissing(TASK_LOG_FILE, ""),
  ]);

  return {
    currentStateCreated: created[0],
    decisionsCreated: created[1],
    openIssuesCreated: created[2],
    nextActionsCreated: created[3],
    taskLogCreated: created[4],
  };
}

function replaceBetween(content, startMarker, endMarker, replacement) {
  const startIndex = content.indexOf(startMarker);
  const endIndex = content.indexOf(endMarker);
  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    return `${content.trimEnd()}\n\n${startMarker}\n${replacement}\n${endMarker}\n`;
  }
  const head = content.slice(0, startIndex + startMarker.length);
  const tail = content.slice(endIndex);
  return `${head}\n${replacement}\n${tail}`;
}

async function runGit(argsList) {
  try {
    const { stdout } = await execFile("git", argsList, { cwd: ROOT, maxBuffer: 4 * 1024 * 1024 });
    return String(stdout || "").replace(/\s+$/g, "");
  } catch {
    return "";
  }
}

function parsePorcelain(raw) {
  if (!raw.trim()) return [];
  const files = new Set();
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trimEnd();
    if (!trimmed || trimmed.length < 4) continue;
    const payload = trimmed.slice(3).trim();
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

function normalizeRecentTasks(existingBlock, newLine) {
  const lines = existingBlock
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "));
  const merged = [newLine, ...lines.filter((line) => line !== "- Belum ada task." && line !== newLine)];
  return merged.slice(0, 12).join("\n");
}

function applyMetaLine(content, key, value) {
  const pattern = new RegExp(`^- ${key}:.*$`, "m");
  const target = `- ${key}: ${value}`;
  if (pattern.test(content)) {
    return content.replace(pattern, target);
  }
  return `${content.trimEnd()}\n${target}\n`;
}

async function updateCurrentState(snapshotLines, recentTaskLine, meta) {
  let content = await fs.readFile(CURRENT_STATE_FILE, "utf8");
  content = applyMetaLine(content, "Last update", meta.timestamp);
  content = applyMetaLine(content, "Branch", meta.branch || "-");
  content = applyMetaLine(content, "Run ID", meta.runId);

  content = replaceBetween(
    content,
    "<!-- AUTO_SNAPSHOT_START -->",
    "<!-- AUTO_SNAPSHOT_END -->",
    snapshotLines.join("\n"),
  );

  const recentStart = "<!-- AUTO_RECENT_START -->";
  const recentEnd = "<!-- AUTO_RECENT_END -->";
  const startIndex = content.indexOf(recentStart);
  const endIndex = content.indexOf(recentEnd);
  const currentRecentBlock =
    startIndex !== -1 && endIndex !== -1 && endIndex > startIndex
      ? content.slice(startIndex + recentStart.length, endIndex).trim()
      : "- Belum ada task.";
  const updatedRecent = normalizeRecentTasks(currentRecentBlock, recentTaskLine);
  content = replaceBetween(content, recentStart, recentEnd, updatedRecent);

  await fs.writeFile(CURRENT_STATE_FILE, content, "utf8");
}

async function appendSectionEntry(filePath, heading, lines, placeholderToRemove) {
  if (lines.length === 0) return;
  let content = await fs.readFile(filePath, "utf8");
  if (placeholderToRemove && content.includes(placeholderToRemove)) {
    content = content.replace(`${placeholderToRemove}\n`, "");
    content = content.replace(placeholderToRemove, "");
  }

  const block = [`## ${heading}`, ...lines.map((line) => `- ${line}`), ""].join("\n");
  content = `${content.trimEnd()}\n\n${block}`;
  await fs.writeFile(filePath, content, "utf8");
}

async function appendTaskLog(record) {
  await fs.appendFile(TASK_LOG_FILE, `${JSON.stringify(record)}\n`, "utf8");
}

async function run() {
  const created = await ensureMemoryFiles();
  const createdCount = Object.values(created).filter(Boolean).length;
  console.log(`[OK] MEMORY_INIT files_ready=${5 - createdCount} created=${createdCount}`);

  if (!runTaskUpdate) {
    console.log("Mode init-only selesai.");
    return;
  }

  const title = readArgValue("--title") || "Task Snapshot";
  const summary = readArgValue("--summary") || "Snapshot otomatis setelah eksekusi task.";
  const changesArg = readArgValue("--changes");
  const validationArg = readArgValue("--validation");
  const risksArg = readArgValue("--risks");
  const nextArg = readArgValue("--next");
  const decisionsArg = readArgValue("--decision");
  const issuesArg = readArgValue("--issue");

  const timestamp = toIso();
  const runId = toRunId();
  const branch = (await runGit(["branch", "--show-current"])) || "-";
  const porcelain = await runGit(["status", "--porcelain", "--untracked-files=all"]);
  const changedFiles = parsePorcelain(porcelain);
  const defaultChanges =
    changedFiles.length > 0
      ? changedFiles.slice(0, 12).map((file) => `Changed file: ${file}`)
      : ["Tidak ada perubahan file terdeteksi."];

  const changes = splitList(changesArg);
  const validations = splitList(validationArg);
  const risks = splitList(risksArg);
  const nextActions = splitList(nextArg);
  const decisions = splitList(decisionsArg);
  const issues = splitList(issuesArg);

  const snapshotLines = [
    `Run: ${runId}`,
    `Waktu: ${timestamp}`,
    `Judul: ${title}`,
    `Ringkasan: ${summary}`,
    `Jumlah file berubah: ${changedFiles.length}`,
    ...(changes.length > 0 ? changes.map((line) => `Perubahan: ${line}`) : defaultChanges),
    ...(validations.length > 0
      ? validations.map((line) => `Validasi: ${line}`)
      : ["Validasi: Belum dicatat pada run ini."]),
    ...(risks.length > 0 ? risks.map((line) => `Risiko: ${line}`) : ["Risiko: Belum ada risiko baru yang dicatat."]),
  ];

  const recentTaskLine = `- ${timestamp.slice(0, 16).replace("T", " ")} | ${runId} | ${title}`;
  await updateCurrentState(snapshotLines, recentTaskLine, { timestamp, runId, branch });

  const heading = `${timestamp.slice(0, 16).replace("T", " ")} | ${runId} | ${title}`;
  await appendSectionEntry(
    DECISIONS_FILE,
    heading,
    decisions.length > 0 ? decisions : [],
    placeholderLine.decisions,
  );
  await appendSectionEntry(
    OPEN_ISSUES_FILE,
    heading,
    issues.length > 0 ? issues : [],
    placeholderLine.openIssues,
  );
  await appendSectionEntry(
    NEXT_ACTIONS_FILE,
    heading,
    nextActions.length > 0 ? nextActions : ["Review snapshot lalu tentukan langkah berikutnya."],
    placeholderLine.nextActions,
  );

  await appendTaskLog({
    run_id: runId,
    timestamp,
    title,
    summary,
    branch,
    changed_files_count: changedFiles.length,
    changed_files: changedFiles,
    changes: changes.length > 0 ? changes : defaultChanges,
    validations,
    risks,
    next_actions: nextActions,
    decisions,
    issues,
  });

  console.log(`[OK] MEMORY_TASK run_id=${runId} changed_files=${changedFiles.length}`);
  console.log(`- current-state: ops/memory/current-state.local.md`);
  console.log(`- decisions: ops/memory/decisions.local.md`);
  console.log(`- open-issues: ops/memory/open-issues.local.md`);
  console.log(`- next-actions: ops/memory/next-actions.local.md`);
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[FAIL] MEMORY Ref: MEM-LOCAL-500 ${message}`);
  process.exit(1);
});
