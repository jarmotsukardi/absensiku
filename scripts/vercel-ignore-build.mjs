#!/usr/bin/env node

import { execFileSync } from "node:child_process";

const IGNORABLE_PREFIXES = [
  "docs/",
  "ops/",
  "artifacts/",
  "tmp/",
  ".github/",
  "apps/",
];

const IGNORABLE_EXACT = new Set([
  "README.md",
  "AGENTS.md",
  "autopilot.md",
  "kerja_paralel.md",
  "memperkuat_memory.md",
]);

const IGNORABLE_SUFFIXES = [".md", ".txt", ".log"];

const runGit = (args) => {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
};

const splitLines = (value) =>
  String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

const getChangedFiles = () => {
  const prev = process.env.VERCEL_GIT_PREVIOUS_SHA?.trim();
  const current = process.env.VERCEL_GIT_COMMIT_SHA?.trim();
  if (prev && current) {
    return splitLines(runGit(["diff", "--name-only", `${prev}...${current}`]));
  }

  const head = runGit(["rev-parse", "--verify", "HEAD"]);
  const parent = runGit(["rev-parse", "--verify", "HEAD^"]);
  if (head && parent) {
    return splitLines(runGit(["diff", "--name-only", `${parent}...${head}`]));
  }

  return [];
};

const isIgnorableFile = (filePath) => {
  if (!filePath) return true;
  if (IGNORABLE_EXACT.has(filePath)) return true;
  if (IGNORABLE_PREFIXES.some((prefix) => filePath.startsWith(prefix))) return true;
  return IGNORABLE_SUFFIXES.some((suffix) => filePath.endsWith(suffix));
};

const changedFiles = getChangedFiles();
if (changedFiles.length === 0) {
  console.log("[vercel-ignore] Changed file set is empty/unavailable, keep build.");
  process.exit(1);
}

const requiredBuildFiles = changedFiles.filter((filePath) => !isIgnorableFile(filePath));
if (requiredBuildFiles.length === 0) {
  console.log(`[vercel-ignore] Skip build (${changedFiles.length} ignorable files).`);
  process.exit(0);
}

console.log("[vercel-ignore] Build required. Non-ignorable changes:");
for (const filePath of requiredBuildFiles.slice(0, 40)) {
  console.log(`- ${filePath}`);
}
process.exit(1);
