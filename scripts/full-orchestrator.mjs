#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT_DIR = process.cwd();
const ARTIFACT_ROOT = path.join(ROOT_DIR, "artifacts", "full-orchestration");

function parseArgs(argv) {
  const args = {
    task: "",
    specFile: "",
    profile: "quick",
    maxParallel: 3,
    withMigrate: false,
    withPreview: false,
    withSmoke: false,
    local: false,
    dryRun: false,
    skipOrchestrate: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--task") {
      args.task = argv[i + 1] || "";
      i += 1;
      continue;
    }
    if (arg === "--spec-file") {
      args.specFile = argv[i + 1] || "";
      i += 1;
      continue;
    }
    if (arg === "--profile") {
      args.profile = argv[i + 1] || "quick";
      i += 1;
      continue;
    }
    if (arg === "--max-parallel") {
      args.maxParallel = Number.parseInt(argv[i + 1] || "3", 10) || 3;
      i += 1;
      continue;
    }
    if (arg === "--with-migrate") {
      args.withMigrate = true;
      continue;
    }
    if (arg === "--with-preview") {
      args.withPreview = true;
      continue;
    }
    if (arg === "--with-smoke") {
      args.withSmoke = true;
      continue;
    }
    if (arg === "--local") {
      args.local = true;
      continue;
    }
    if (arg === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (arg === "--skip-orchestrate") {
      args.skipOrchestrate = true;
      continue;
    }
  }
  return args;
}

function makeRunId() {
  return `FOR-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
}

function getErrorMessage(error) {
  if (!error) return "";
  if (error instanceof Error) return error.message;
  return String(error);
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readSpec(specFile) {
  if (!specFile) return { content: "", parsed: {} };
  const fullPath = path.isAbsolute(specFile) ? specFile : path.join(ROOT_DIR, specFile);
  const content = await fs.readFile(fullPath, "utf8");
  const parsed = {};
  const fields = [
    "Tujuan",
    "Scope",
    "Acceptance Criteria",
    "Non Goals",
    "Rute/Modul",
    "Catatan Data",
  ];
  for (const field of fields) {
    const regex = new RegExp(`##\\s+${field}\\s*\\n([\\s\\S]*?)(?=\\n##\\s+|$)`, "i");
    const match = content.match(regex);
    if (match?.[1]?.trim()) parsed[field] = match[1].trim();
  }
  return { content, parsed };
}

function renderSpecSummary(parsed, fallbackTask) {
  const lines = [];
  if (fallbackTask) lines.push(`Task: ${fallbackTask}`);
  for (const [k, v] of Object.entries(parsed)) {
    lines.push(`${k}: ${String(v).split("\n")[0]}`);
  }
  return lines.join("\n");
}

function run(command, args, { dryRun = false, label = "" } = {}) {
  const cmdLabel = label || [command, ...args].join(" ");
  if (dryRun) {
    return Promise.resolve({
      ok: true,
      code: 0,
      label: cmdLabel,
      durationMs: 0,
      skipped: true,
    });
  }
  return new Promise((resolve) => {
    const start = Date.now();
    const child = spawn(command, args, {
      cwd: ROOT_DIR,
      stdio: "inherit",
      env: process.env,
      shell: false,
    });
    child.on("error", (error) => {
      resolve({
        ok: false,
        code: -1,
        label: cmdLabel,
        durationMs: Date.now() - start,
        error: getErrorMessage(error),
      });
    });
    child.on("close", (code) => {
      resolve({
        ok: code === 0,
        code: code ?? -1,
        label: cmdLabel,
        durationMs: Date.now() - start,
      });
    });
  });
}

async function runParallel(commands, maxParallel, dryRun) {
  const queue = [...commands];
  const output = [];
  const workers = Array.from({ length: Math.max(1, maxParallel) }, async () => {
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) break;
      const result = await run(next.command, next.args, {
        dryRun,
        label: next.label,
      });
      output.push(result);
      const status = result.ok ? "OK" : "FAIL";
      process.stdout.write(`[${status}] ${result.label}\n`);
    }
  });
  await Promise.all(workers);
  return output;
}

async function writeArtifacts(dir, payload) {
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "run.json"),
    JSON.stringify(payload, null, 2),
    "utf8",
  );

  const failed = payload.steps.filter((s) => !s.ok);
  const md = [
    `# Full Orchestration Report`,
    ``,
    `- Run ID: ${payload.runId}`,
    `- Started At: ${payload.startedAt}`,
    `- Duration: ${payload.durationMs}ms`,
    `- Status: ${failed.length === 0 ? "SUCCESS" : "FAILED"}`,
    ``,
    `## Intake`,
    "```",
    payload.intakeSummary || "(empty)",
    "```",
    ``,
    `## Steps`,
    ...payload.steps.map((s) => `- [${s.ok ? "OK" : "FAIL"}] ${s.label} (${s.durationMs}ms)`),
    ``,
    `## Residual Risk`,
    failed.length > 0
      ? `- ${failed.length} step gagal. Ref: ERR-${payload.runId}`
      : `- Tidak ada dari langkah yang dijalankan.`,
  ].join("\n");
  await fs.writeFile(path.join(dir, "summary.md"), md, "utf8");
}

function buildMigrationCommands() {
  const commands = [];
  const packageJsonPath = path.join(ROOT_DIR, "package.json");
  return fs.readFile(packageJsonPath, "utf8")
    .then((raw) => JSON.parse(raw))
    .then((pkg) => {
      const scripts = pkg?.scripts || {};
      if (scripts["db:migrate"]) {
        commands.push({ command: "npm", args: ["run", "db:migrate"], label: "npm run db:migrate" });
      } else if (scripts["supabase:push"]) {
        commands.push({ command: "npm", args: ["run", "supabase:push"], label: "npm run supabase:push" });
      }
      return commands;
    })
    .catch(() => commands);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const runId = makeRunId();
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const artifactDir = path.join(ARTIFACT_ROOT, runId);
  const steps = [];

  const spec = await readSpec(args.specFile);
  const derivedTask = args.task || spec.parsed["Tujuan"] || "Implement task from spec";
  const intakeSummary = renderSpecSummary(spec.parsed, derivedTask);

  process.stdout.write(`=== Full Orchestration [${runId}] ===\n`);
  process.stdout.write(`Intake summary:\n${intakeSummary || "(empty)"}\n`);

  if (!args.skipOrchestrate && derivedTask) {
    const orchestrateArgs = ["run", "orchestrate:models", "--", "--task", derivedTask];
    if (args.local) orchestrateArgs.push("--local");
    if (args.dryRun) orchestrateArgs.push("--dry-run");
    const orchestration = await run("npm", orchestrateArgs, {
      dryRun: args.dryRun,
      label: `npm ${orchestrateArgs.join(" ")}`,
    });
    steps.push(orchestration);
    if (!orchestration.ok) {
      await writeArtifacts(artifactDir, {
        runId,
        startedAt,
        durationMs: Date.now() - startedMs,
        intakeSummary,
        steps,
      });
      process.stdout.write(`ERR-${runId}: orchestration gagal.\n`);
      process.exitCode = 1;
      return;
    }
  }

  const builderArgs = ["run", "builder", "--", "--profile", args.profile, "--skip-orchestrate", "--max-parallel", String(args.maxParallel)];
  if (args.withSmoke) builderArgs.push("--with-smoke");
  if (args.dryRun) builderArgs.push("--dry-run");
  const builder = await run("npm", builderArgs, {
    dryRun: args.dryRun,
    label: `npm ${builderArgs.join(" ")}`,
  });
  steps.push(builder);
  if (!builder.ok) {
    await writeArtifacts(artifactDir, {
      runId,
      startedAt,
      durationMs: Date.now() - startedMs,
      intakeSummary,
      steps,
    });
    process.stdout.write(`ERR-${runId}: builder stage gagal.\n`);
    process.exitCode = 1;
    return;
  }

  if (args.withMigrate) {
    const migrationCommands = await buildMigrationCommands();
    if (migrationCommands.length === 0) {
      steps.push({
        ok: true,
        code: 0,
        label: "migration hook skipped (script not found)",
        durationMs: 0,
      });
    } else {
      const migrationResults = await runParallel(migrationCommands, 1, args.dryRun);
      steps.push(...migrationResults);
      if (migrationResults.some((item) => !item.ok)) {
        await writeArtifacts(artifactDir, {
          runId,
          startedAt,
          durationMs: Date.now() - startedMs,
          intakeSummary,
          steps,
        });
        process.stdout.write(`ERR-${runId}: migration stage gagal.\n`);
        process.exitCode = 1;
        return;
      }
    }
  }

  if (args.withPreview) {
    const hasVercelJson = await exists(path.join(ROOT_DIR, "vercel.json"));
    steps.push({
      ok: true,
      code: 0,
      label: hasVercelJson
        ? "preview hook ready (jalankan deploy/preview manual sesuai policy)"
        : "preview hook info (vercel.json tidak ditemukan)",
      durationMs: 0,
    });
  }

  const payload = {
    runId,
    startedAt,
    durationMs: Date.now() - startedMs,
    intakeSummary,
    steps,
  };
  await writeArtifacts(artifactDir, payload);
  process.stdout.write(`DONE [${runId}] artifacts: ${artifactDir}\n`);
}

main().catch(async (error) => {
  const runId = makeRunId();
  const artifactDir = path.join(ARTIFACT_ROOT, runId);
  const message = getErrorMessage(error);
  await writeArtifacts(artifactDir, {
    runId,
    startedAt: new Date().toISOString(),
    durationMs: 0,
    intakeSummary: "",
    steps: [
      {
        ok: false,
        code: -1,
        label: "full-orchestrator crash",
        durationMs: 0,
        error: message,
      },
    ],
  });
  process.stdout.write(`ERR-${runId}: ${message}\n`);
  process.exitCode = 1;
});

