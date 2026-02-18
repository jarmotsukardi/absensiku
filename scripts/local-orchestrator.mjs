#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT_DIR = process.cwd();
const ARTIFACT_ROOT = path.join(ROOT_DIR, "artifacts", "local-orchestration");

function parseArgs(argv) {
  const args = {
    task: "",
    specFile: "",
    profile: "quick",
    maxParallel: 4,
    withMigrate: false,
    withPreview: true,
    withSmoke: true,
    previewPort: 4173,
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
      args.maxParallel = Number.parseInt(argv[i + 1] || "4", 10) || 4;
      i += 1;
      continue;
    }
    if (arg === "--preview-port") {
      args.previewPort = Number.parseInt(argv[i + 1] || "4173", 10) || 4173;
      i += 1;
      continue;
    }
    if (arg === "--with-migrate") {
      args.withMigrate = true;
      continue;
    }
    if (arg === "--without-preview") {
      args.withPreview = false;
      continue;
    }
    if (arg === "--without-smoke") {
      args.withSmoke = false;
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
  return `LOR-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
}

function getErrorMessage(error) {
  if (!error) return "";
  if (error instanceof Error) return error.message;
  return String(error);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  if (!specFile) return { parsed: {} };
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
  return { parsed };
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
    process.stdout.write(`[DRY-RUN] ${cmdLabel}\n`);
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
      const result = await run(next.command, next.args, { dryRun, label: next.label });
      output.push(result);
      process.stdout.write(`[${result.ok ? "OK" : "FAIL"}] ${result.label}\n`);
    }
  });
  await Promise.all(workers);
  return output;
}

async function hasScript(name) {
  try {
    const raw = await fs.readFile(path.join(ROOT_DIR, "package.json"), "utf8");
    const parsed = JSON.parse(raw);
    return Boolean(parsed?.scripts?.[name]);
  } catch {
    return false;
  }
}

async function waitForHttp(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      // continue polling
    }
    await sleep(1000);
  }
  return false;
}

async function runPreviewAndSmoke({ port, withSmoke, dryRun }) {
  const previewUrl = `http://127.0.0.1:${port}`;
  if (dryRun) {
    return {
      ok: true,
      code: 0,
      label: `preview smoke @ ${previewUrl}`,
      durationMs: 0,
      previewUrl,
    };
  }

  const started = Date.now();
  const preview = spawn("npm", ["run", "preview", "--", "--host", "127.0.0.1", "--port", String(port)], {
    cwd: ROOT_DIR,
    stdio: "ignore",
    env: process.env,
    shell: false,
  });

  let ok = true;
  let code = 0;
  let errorMessage = "";
  const smokeResults = [];

  try {
    const ready = await waitForHttp(previewUrl, 30000);
    if (!ready) {
      ok = false;
      code = 1;
      errorMessage = "preview server tidak siap dalam 30 detik";
      return {
        ok,
        code,
        label: `preview smoke @ ${previewUrl}`,
        durationMs: Date.now() - started,
        error: errorMessage,
        previewUrl,
      };
    }

    if (withSmoke) {
      const smokeCommands = [];
      if (await hasScript("routes:trace")) {
        smokeCommands.push({ command: "npm", args: ["run", "routes:trace"], label: "npm run routes:trace" });
      }
      if (await hasScript("smoke:dashboard")) {
        smokeCommands.push({ command: "npm", args: ["run", "smoke:dashboard"], label: "npm run smoke:dashboard" });
      }
      if (smokeCommands.length > 0) {
        const results = await runParallel(smokeCommands, 2, false);
        smokeResults.push(...results);
        if (results.some((item) => !item.ok)) {
          ok = false;
          code = 1;
          errorMessage = "sebagian smoke check gagal";
        }
      }
    }
  } finally {
    preview.kill("SIGTERM");
  }

  return {
    ok,
    code,
    label: `preview smoke @ ${previewUrl}`,
    durationMs: Date.now() - started,
    error: errorMessage || undefined,
    previewUrl,
    smokeResults,
  };
}

async function writeArtifacts(dir, payload) {
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "run.json"), JSON.stringify(payload, null, 2), "utf8");
  const failed = payload.steps.filter((s) => !s.ok);
  const md = [
    "# Local Orchestration Report",
    "",
    `- Run ID: ${payload.runId}`,
    `- Started At: ${payload.startedAt}`,
    `- Duration: ${payload.durationMs}ms`,
    `- Status: ${failed.length === 0 ? "SUCCESS" : "FAILED"}`,
    payload.previewUrl ? `- Preview URL: ${payload.previewUrl}` : "- Preview URL: n/a",
    "",
    "## Intake",
    "```",
    payload.intakeSummary || "(empty)",
    "```",
    "",
    "## Steps",
    ...payload.steps.map((s) => `- [${s.ok ? "OK" : "FAIL"}] ${s.label} (${s.durationMs}ms)`),
    "",
    "## Residual Risk",
    failed.length > 0 ? `- ${failed.length} step gagal. Ref: ERR-${payload.runId}` : "- Tidak ada dari langkah yang dijalankan.",
  ].join("\n");
  await fs.writeFile(path.join(dir, "summary.md"), md, "utf8");
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

  process.stdout.write(`=== Local Orchestration [${runId}] ===\n`);
  process.stdout.write(`Intake summary:\n${intakeSummary || "(empty)"}\n`);

  if (!args.skipOrchestrate) {
    const orchestrateArgs = ["run", "orchestrate:models", "--", "--task", derivedTask, "--local"];
    if (args.dryRun) orchestrateArgs.push("--dry-run");
    const orchestration = await run("npm", orchestrateArgs, {
      dryRun: args.dryRun,
      label: `npm ${orchestrateArgs.join(" ")}`,
    });
    steps.push(orchestration);
    if (!orchestration.ok) {
      const payload = {
        runId,
        startedAt,
        durationMs: Date.now() - startedMs,
        intakeSummary,
        steps,
      };
      await writeArtifacts(artifactDir, payload);
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
    const payload = {
      runId,
      startedAt,
      durationMs: Date.now() - startedMs,
      intakeSummary,
      steps,
    };
    await writeArtifacts(artifactDir, payload);
    process.stdout.write(`ERR-${runId}: builder stage gagal.\n`);
    process.exitCode = 1;
    return;
  }

  if (args.withMigrate) {
    const canRunMigrate = await hasScript("db:migrate");
    const canRunPush = await hasScript("supabase:push");
    if (!canRunMigrate && !canRunPush) {
      steps.push({
        ok: true,
        code: 0,
        label: "migration hook skipped (script not found)",
        durationMs: 0,
      });
    } else {
      const migrateCommand = canRunMigrate ? ["run", "db:migrate"] : ["run", "supabase:push"];
      const migrate = await run("npm", migrateCommand, {
        dryRun: args.dryRun,
        label: `npm ${migrateCommand.join(" ")}`,
      });
      steps.push(migrate);
      if (!migrate.ok) {
        const payload = {
          runId,
          startedAt,
          durationMs: Date.now() - startedMs,
          intakeSummary,
          steps,
        };
        await writeArtifacts(artifactDir, payload);
        process.stdout.write(`ERR-${runId}: migration stage gagal.\n`);
        process.exitCode = 1;
        return;
      }
    }
  }

  let previewUrl = "";
  if (args.withPreview) {
    const hasPreview = await exists(path.join(ROOT_DIR, "node_modules"));
    if (!hasPreview && !args.dryRun) {
      steps.push({
        ok: false,
        code: 1,
        label: "preview stage gagal (node_modules tidak ditemukan)",
        durationMs: 0,
      });
    } else {
      const previewResult = await runPreviewAndSmoke({
        port: args.previewPort,
        withSmoke: args.withSmoke,
        dryRun: args.dryRun,
      });
      previewUrl = previewResult.previewUrl || "";
      steps.push(previewResult);
    }
  }

  const payload = {
    runId,
    startedAt,
    durationMs: Date.now() - startedMs,
    intakeSummary,
    previewUrl,
    steps,
  };
  await writeArtifacts(artifactDir, payload);
  const failed = steps.filter((s) => !s.ok);
  if (failed.length > 0) {
    process.stdout.write(`ERR-${runId}: ada ${failed.length} step gagal.\n`);
    process.exitCode = 1;
    return;
  }
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
        label: "local-orchestrator crash",
        durationMs: 0,
        error: message,
      },
    ],
  });
  process.stdout.write(`ERR-${runId}: ${message}\n`);
  process.exitCode = 1;
});

