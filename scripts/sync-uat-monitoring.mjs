#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import { getMissingScriptEnvKeys, pickScriptEnv, readScriptEnvMap } from "./lib/supabase-env.mjs";

const CLI_ARGS = process.argv.slice(2);
const DEFAULT_FILE = "docs/checklist-uji-aplikasi.md";
const DEFAULT_DOMAIN = "absensi";
const SUPPORTED_DOMAINS = new Set(["absensi", "hr", "payroll"]);
const SYNC_SOURCE = "docs_checklist_sync";

function readArgValue(flag) {
  const exactMatch = CLI_ARGS.find((arg) => arg.startsWith(`${flag}=`));
  if (exactMatch) {
    return exactMatch.slice(flag.length + 1).trim();
  }

  const flagIndex = CLI_ARGS.indexOf(flag);
  if (flagIndex >= 0) {
    return String(CLI_ARGS[flagIndex + 1] || "").trim();
  }

  return "";
}

function parseChecklistLogEntries(markdown) {
  const lines = markdown.split(/\r?\n/);
  const entries = [];
  let inLogTable = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line === "## Log Update yang Sudah Diuji") {
      inLogTable = true;
      continue;
    }

    if (!inLogTable) {
      continue;
    }

    if (line.startsWith("## ") && line !== "## Log Update yang Sudah Diuji") {
      break;
    }

    if (!line.startsWith("|") || line.includes("---") || line.includes("Tanggal | Update")) {
      continue;
    }

    const columns = line
      .split("|")
      .map((column) => column.trim())
      .filter(Boolean);

    if (columns.length < 5) {
      continue;
    }

    entries.push({
      tanggal: columns[0],
      update: columns[1],
      areaDiuji: columns[2],
      ringkasanHasil: columns[3],
      referensi: columns.slice(4).join(" | "),
    });
  }

  return entries;
}

function inferReleaseVersion(...values) {
  for (const value of values) {
    const match = String(value || "").match(/\bv\d+\.\d+\.\d+\b/i);
    if (match) {
      return match[0];
    }
  }
  return null;
}

function inferWorkflowStatus(ringkasanHasil, referensi) {
  const summary = String(ringkasanHasil || "").toLowerCase();
  const reference = String(referensi || "").toLowerCase();

  if (summary.includes("closed") || summary.includes("ditutup")) {
    return "closed";
  }

  if (
    summary.includes("siap") ||
    reference.includes("sign-off") ||
    reference.includes("go-no-go") ||
    reference.includes("sign off")
  ) {
    return "sign_off";
  }

  return "diuji";
}

function inferExecutionStatus(ringkasanHasil) {
  const summary = String(ringkasanHasil || "").toLowerCase();
  if (
    summary.includes("gagal") ||
    summary.includes("belum siap") ||
    summary.includes("perlu tindak lanjut") ||
    summary.includes("tidak lulus")
  ) {
    return "perlu_tindak_lanjut";
  }

  return "lolos";
}

function toSignature(entry) {
  return [
    entry.domain,
    entry.tanggal,
    entry.update_name.trim().toLowerCase(),
    entry.referensi.trim().toLowerCase(),
  ].join("::");
}

function summarizeMutation(before, after) {
  return JSON.stringify(before) !== JSON.stringify(after);
}

async function main() {
  const domainArg = readArgValue("--domain") || DEFAULT_DOMAIN;
  const domain = domainArg.trim().toLowerCase();
  if (!SUPPORTED_DOMAINS.has(domain)) {
    throw new Error(`Domain tidak didukung: ${domainArg}`);
  }

  const sourceFile = path.resolve(process.cwd(), readArgValue("--file") || DEFAULT_FILE);
  const dryRun = CLI_ARGS.includes("--dry-run");

  const markdown = await fs.readFile(sourceFile, "utf8");
  const logEntries = parseChecklistLogEntries(markdown);
  if (logEntries.length === 0) {
    throw new Error(`Tidak ada baris log UAT yang ditemukan di ${sourceFile}`);
  }

  const env = await readScriptEnvMap();
  const missingEnvKeys = await getMissingScriptEnvKeys({
    SUPABASE_URL: ["NEXT_PUBLIC_SUPABASE_URL", "VITE_SUPABASE_URL", "SUPABASE_URL"],
    SUPABASE_SERVICE_ROLE_KEY: ["SUPABASE_SERVICE_ROLE_KEY"],
  });
  if (missingEnvKeys.length > 0) {
    throw new Error(`Env script belum lengkap: ${missingEnvKeys.join(", ")}`);
  }

  const supabaseUrl = pickScriptEnv(env, ["NEXT_PUBLIC_SUPABASE_URL", "VITE_SUPABASE_URL", "SUPABASE_URL"]);
  const serviceRoleKey = pickScriptEnv(env, ["SUPABASE_SERVICE_ROLE_KEY"]);
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const normalizedRows = logEntries.map((entry) => ({
    domain,
    tanggal: entry.tanggal,
    release_version: inferReleaseVersion(entry.update, entry.areaDiuji, entry.referensi),
    subdomain: null,
    update_name: entry.update,
    tester: "Codex",
    reviewer: null,
    approver: null,
    workflow_status: inferWorkflowStatus(entry.ringkasanHasil, entry.referensi),
    area_diuji: entry.areaDiuji,
    ringkasan_hasil: entry.ringkasanHasil,
    referensi: entry.referensi,
    status: inferExecutionStatus(entry.ringkasanHasil),
    source: SYNC_SOURCE,
  }));

  const { data: existingRows, error: existingError } = await adminClient
    .from("uat_execution_logbook_entries")
    .select(
      "id, domain, tanggal, release_version, subdomain, update_name, tester, reviewer, approver, workflow_status, area_diuji, ringkasan_hasil, referensi, status, source",
    )
    .eq("domain", domain)
    .eq("source", SYNC_SOURCE);

  if (existingError) {
    throw existingError;
  }

  const existingMap = new Map((existingRows || []).map((row) => [toSignature(row), row]));
  const inserts = [];
  const updates = [];

  for (const row of normalizedRows) {
    const existingRow = existingMap.get(toSignature(row));
    if (!existingRow) {
      inserts.push(row);
      continue;
    }

    const nextComparable = {
      domain: row.domain,
      tanggal: row.tanggal,
      release_version: row.release_version,
      subdomain: row.subdomain,
      update_name: row.update_name,
      tester: row.tester,
      reviewer: row.reviewer,
      approver: row.approver,
      workflow_status: row.workflow_status,
      area_diuji: row.area_diuji,
      ringkasan_hasil: row.ringkasan_hasil,
      referensi: row.referensi,
      status: row.status,
      source: row.source,
    };

    const currentComparable = {
      domain: existingRow.domain,
      tanggal: existingRow.tanggal,
      release_version: existingRow.release_version,
      subdomain: existingRow.subdomain,
      update_name: existingRow.update_name,
      tester: existingRow.tester,
      reviewer: existingRow.reviewer,
      approver: existingRow.approver,
      workflow_status: existingRow.workflow_status,
      area_diuji: existingRow.area_diuji,
      ringkasan_hasil: existingRow.ringkasan_hasil,
      referensi: existingRow.referensi,
      status: existingRow.status,
      source: existingRow.source,
    };

    if (summarizeMutation(currentComparable, nextComparable)) {
      updates.push({
        id: existingRow.id,
        ...row,
      });
    }
  }

  const summary = {
    mode: dryRun ? "dry_run" : "apply",
    domain,
    source_file: sourceFile,
    checklist_rows: normalizedRows.length,
    inserts: inserts.length,
    updates: updates.length,
    unchanged: normalizedRows.length - inserts.length - updates.length,
  };

  if (!dryRun) {
    if (inserts.length > 0) {
      const { error } = await adminClient.from("uat_execution_logbook_entries").insert(inserts);
      if (error) {
        throw error;
      }
    }

    for (const row of updates) {
      const { id, ...payload } = row;
      const { error } = await adminClient.from("uat_execution_logbook_entries").update(payload).eq("id", id);
      if (error) {
        throw error;
      }
    }
  }

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.error(`sync-uat-monitoring failed: ${message}`);
  process.exitCode = 1;
});
