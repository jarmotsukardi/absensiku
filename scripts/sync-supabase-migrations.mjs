#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT_DIR = process.cwd();
const SOURCE_DIR = path.join(ROOT_DIR, "supabase", "migrations");
const TARGET_DIR = path.join(ROOT_DIR, "docker", "postgres", "migrations", "supabase");

function makeErrorRef() {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `ERR-MIGSYNC-${stamp}`;
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function readSqlFiles(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

async function copyFile(src, dst) {
  const content = await fs.readFile(src, "utf8");
  await fs.writeFile(dst, content, "utf8");
}

async function main() {
  try {
    await fs.access(SOURCE_DIR);
  } catch {
    const ref = makeErrorRef();
    process.stderr.write(`[${ref}] Source migration tidak ditemukan: ${path.relative(ROOT_DIR, SOURCE_DIR)}\n`);
    process.exitCode = 1;
    return;
  }

  await ensureDir(TARGET_DIR);

  const sourceFiles = await readSqlFiles(SOURCE_DIR);
  const targetFiles = await readSqlFiles(TARGET_DIR);

  let copied = 0;
  let removed = 0;

  for (const fileName of sourceFiles) {
    await copyFile(path.join(SOURCE_DIR, fileName), path.join(TARGET_DIR, fileName));
    copied += 1;
  }

  const sourceSet = new Set(sourceFiles);
  for (const fileName of targetFiles) {
    if (sourceSet.has(fileName)) continue;
    await fs.unlink(path.join(TARGET_DIR, fileName));
    removed += 1;
  }

  process.stdout.write("Sinkronisasi migration Supabase selesai.\n");
  process.stdout.write(`- Source : ${path.relative(ROOT_DIR, SOURCE_DIR)}\n`);
  process.stdout.write(`- Target : ${path.relative(ROOT_DIR, TARGET_DIR)}\n`);
  process.stdout.write(`- Copied : ${copied}\n`);
  process.stdout.write(`- Removed: ${removed}\n`);
}

main().catch((error) => {
  const ref = makeErrorRef();
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[${ref}] sync-supabase-migrations error: ${message}\n`);
  process.exitCode = 1;
});
