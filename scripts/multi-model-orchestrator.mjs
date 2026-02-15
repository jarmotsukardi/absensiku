#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT_DIR = process.cwd();
const DEFAULT_CONFIG_PATH = path.join(ROOT_DIR, "scripts", "multi-model.config.json");

const DEFAULT_CONFIG = {
  orchestrator: {
    planner_model: "gpt-5.3-codex",
    default_model: "gpt-5.2-codex",
    fallback_models: ["gpt-5.1-codex-max", "gpt-5.2", "gpt-5.1-code-mini"],
    max_parallel: 4,
  },
  routing: {
    architecture: "gpt-5.3-codex",
    implementation: "gpt-5.2-codex",
    review: "gpt-5.1-codex-max",
    boilerplate: "gpt-5.1-code-mini",
    qa: "gpt-5.2",
    default: "gpt-5.2-codex",
  },
  model_aliases: {
    "gpt 5.3 codex": "gpt-5.3-codex",
    "gpt 5.2 codex": "gpt-5.2-codex",
    "gpt 5.1 codex max": "gpt-5.1-codex-max",
    "gpt 5.2": "gpt-5.2",
    "gpt 5.1 code mini": "gpt-5.1-code-mini",
  },
};

class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

function usage() {
  return [
    "Usage:",
    "  node scripts/multi-model-orchestrator.mjs --task \"<task besar>\"",
    "  node scripts/multi-model-orchestrator.mjs --task-file artifacts/subtasks.json",
    "",
    "Options:",
    "  --task <text>            Task utama yang akan dipecah",
    "  --task-file <path>       File JSON berisi subtask",
    "  --config <path>          Override config (default: scripts/multi-model.config.json)",
    "  --max-parallel <n>       Maksimum subtask paralel",
    "  --output-dir <path>      Folder output artifacts",
    "  --no-plan                Skip planner model; gunakan satu subtask dari task",
    "  --local                  Paksa mode lokal tanpa API call",
    "  --dry-run                Simulasi tanpa API call model",
    "  --help                   Tampilkan bantuan",
    "",
    "Catatan:",
    "- Jika OPENAI_API_KEY tidak ada, script otomatis fallback ke mode lokal.",
  ].join("\n");
}

function parseArgs(argv) {
  const args = {
    configPath: DEFAULT_CONFIG_PATH,
    task: "",
    taskFile: "",
    outputDir: "",
    maxParallel: undefined,
    noPlan: false,
    local: false,
    dryRun: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--task") {
      args.task = argv[i + 1] || "";
      i += 1;
      continue;
    }
    if (arg === "--task-file") {
      args.taskFile = argv[i + 1] || "";
      i += 1;
      continue;
    }
    if (arg === "--config") {
      args.configPath = argv[i + 1] || DEFAULT_CONFIG_PATH;
      i += 1;
      continue;
    }
    if (arg === "--max-parallel") {
      args.maxParallel = Number.parseInt(argv[i + 1] || "", 10);
      i += 1;
      continue;
    }
    if (arg === "--output-dir") {
      args.outputDir = argv[i + 1] || "";
      i += 1;
      continue;
    }
    if (arg === "--no-plan") {
      args.noPlan = true;
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
    if (arg === "--help" || arg === "-h") {
      args.help = true;
      continue;
    }
  }

  return args;
}

function normalizeAlias(input) {
  return String(input || "")
    .toLowerCase()
    .trim()
    .replace(/[_\s]+/g, "-");
}

function resolveModelName(modelName, config) {
  if (!modelName) return config.orchestrator.default_model;
  const modelAliases = config.model_aliases || {};
  const normalized = normalizeAlias(modelName);
  for (const [alias, target] of Object.entries(modelAliases)) {
    if (normalizeAlias(alias) === normalized) return target;
  }
  return modelName;
}

function uniqueModels(models) {
  const seen = new Set();
  const out = [];
  for (const item of models) {
    const value = String(item || "").trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function deepMerge(base, override) {
  if (!override || typeof override !== "object") return base;
  const out = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value && typeof value === "object" && !Array.isArray(value) && out[key] && typeof out[key] === "object" && !Array.isArray(out[key])) {
      out[key] = deepMerge(out[key], value);
      continue;
    }
    out[key] = value;
  }
  return out;
}

async function loadConfig(configPath) {
  try {
    const raw = await fs.readFile(configPath, "utf8");
    const userConfig = JSON.parse(raw);
    return deepMerge(DEFAULT_CONFIG, userConfig);
  } catch {
    return DEFAULT_CONFIG;
  }
}

async function loadEnvFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) continue;
      const [, key, valRaw] = match;
      if (process.env[key]) continue;
      let value = valRaw.trim();
      if (
        (value.startsWith("\"") && value.endsWith("\"")) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  } catch {
    // ignore missing env file
  }
}

function buildRunId() {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const rand = crypto.randomBytes(3).toString("hex");
  return `${ts}-${rand}`;
}

function sanitizeId(input, fallback) {
  const cleaned = String(input || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || fallback;
}

function extractOutputText(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const chunks = [];
  const outputs = Array.isArray(payload?.output) ? payload.output : [];
  for (const output of outputs) {
    if (!Array.isArray(output?.content)) continue;
    for (const content of output.content) {
      if (typeof content?.text === "string" && content.text.trim()) {
        chunks.push(content.text.trim());
      }
    }
  }
  return chunks.join("\n\n").trim();
}

function extractJson(text) {
  const direct = text.trim();
  try {
    return JSON.parse(direct);
  } catch {
    // continue
  }

  const fencedMatch = text.match(/```json\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    try {
      return JSON.parse(fencedMatch[1].trim());
    } catch {
      // continue
    }
  }

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const candidate = text.slice(firstBrace, lastBrace + 1);
    return JSON.parse(candidate);
  }

  throw new Error("Planner output bukan JSON valid");
}

async function invokeResponsesApi({ apiKey, model, systemPrompt, userPrompt }) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: systemPrompt }],
        },
        {
          role: "user",
          content: [{ type: "input_text", text: userPrompt }],
        },
      ],
    }),
  });

  const rawBody = await response.text();
  let jsonBody = {};
  try {
    jsonBody = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    jsonBody = { raw: rawBody };
  }

  if (!response.ok) {
    const message = jsonBody?.error?.message || `OpenAI API error (${response.status})`;
    throw new ApiError(message, response.status, jsonBody);
  }

  const outputText = extractOutputText(jsonBody);
  if (!outputText) {
    throw new ApiError("Respons model kosong", response.status, jsonBody);
  }

  return {
    outputText,
    raw: jsonBody,
  };
}

async function runModelWithFallback({
  apiKey,
  preferredModel,
  fallbackModels,
  systemPrompt,
  userPrompt,
}) {
  const orderedModels = uniqueModels([preferredModel, ...(fallbackModels || [])]);
  let lastError = null;

  for (const model of orderedModels) {
    try {
      const result = await invokeResponsesApi({
        apiKey,
        model,
        systemPrompt,
        userPrompt,
      });
      return { ...result, modelUsed: model };
    } catch (error) {
      lastError = error;
      const detail = error instanceof ApiError ? `${error.status} ${error.message}` : String(error);
      console.warn(`[orchestrator] model gagal: ${model} -> ${detail}`);
    }
  }

  throw lastError || new Error("Semua model fallback gagal");
}

function heuristicPlanFromTask(taskText) {
  const base = taskText.trim();
  return {
    subtasks: [
      {
        id: "context-scan",
        title: "Scan konteks dan dampak",
        kind: "architecture",
        goal: `Pahami konteks teknis untuk task: ${base}`,
        acceptance_criteria: [
          "Area file terdampak teridentifikasi",
          "Risiko integrasi tercatat",
        ],
      },
      {
        id: "implementation-core",
        title: "Implementasi inti",
        kind: "implementation",
        goal: "Implementasikan perubahan utama sesuai kebutuhan",
        acceptance_criteria: [
          "Perubahan utama selesai",
          "Tidak merusak fitur terkait",
        ],
      },
      {
        id: "tests-and-quality",
        title: "Validasi kualitas",
        kind: "qa",
        goal: "Jalankan lint, test, dan build untuk validasi",
        acceptance_criteria: [
          "Lint/test/build selesai",
          "Temuan dan risiko didokumentasikan",
        ],
      },
    ],
  };
}

function normalizeSubtasks(rawPlan, config) {
  const source = Array.isArray(rawPlan) ? rawPlan : rawPlan?.subtasks;
  if (!Array.isArray(source) || source.length === 0) {
    throw new Error("Planner tidak menghasilkan subtask");
  }

  const fallbackModels = (config.orchestrator.fallback_models || []).map((m) => resolveModelName(m, config));

  return source.map((item, idx) => {
    const kind = String(item?.kind || "default").toLowerCase();
    const routeModel = config.routing[kind] || config.routing.default || config.orchestrator.default_model;
    const preferred = resolveModelName(item?.model || routeModel, config);
    const id = sanitizeId(item?.id || item?.title || `subtask-${idx + 1}`, `subtask-${idx + 1}`);
    const acceptance = Array.isArray(item?.acceptance_criteria)
      ? item.acceptance_criteria.map((v) => String(v))
      : [];

    return {
      id,
      title: String(item?.title || `Subtask ${idx + 1}`),
      kind,
      goal: String(item?.goal || ""),
      acceptance_criteria: acceptance,
      prompt: String(item?.prompt || ""),
      priority: Number.isFinite(item?.priority) ? item.priority : idx + 1,
      model: preferred,
      fallback_models: fallbackModels,
      depends_on: Array.isArray(item?.depends_on) ? item.depends_on.map((d) => String(d)) : [],
    };
  });
}

async function mapWithConcurrency(items, concurrency, worker) {
  const safeConcurrency = Math.max(1, Number(concurrency) || 1);
  const results = new Array(items.length);
  let cursor = 0;

  async function runWorker() {
    while (cursor < items.length) {
      const currentIndex = cursor;
      cursor += 1;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }

  const workers = Array.from({ length: Math.min(safeConcurrency, items.length) }, () => runWorker());
  await Promise.all(workers);
  return results;
}

function buildPlannerPrompt(taskText) {
  return [
    "Pecah task besar berikut menjadi subtask independen agar bisa dikerjakan paralel.",
    "Keluaran wajib JSON valid dengan format:",
    "{",
    "  \"subtasks\": [",
    "    {",
    "      \"id\": \"string-slug\",",
    "      \"title\": \"judul\",",
    "      \"kind\": \"architecture|implementation|review|boilerplate|qa\",",
    "      \"goal\": \"tujuan jelas\",",
    "      \"acceptance_criteria\": [\"kriteria 1\", \"kriteria 2\"],",
    "      \"depends_on\": [\"id-subtask-lain\"],",
    "      \"priority\": 1",
    "    }",
    "  ]",
    "}",
    "",
    "Aturan:",
    "- Maksimal 8 subtask.",
    "- Utamakan subtask yang bisa paralel.",
    "- Hindari overlap edit file yang sama.",
    "",
    `Task utama: ${taskText}`,
  ].join("\n");
}

function buildExecutionPrompt(mainTask, subtask) {
  const acceptance = subtask.acceptance_criteria.length
    ? subtask.acceptance_criteria.map((v, i) => `${i + 1}. ${v}`).join("\n")
    : "-";

  return [
    `Task utama: ${mainTask}`,
    `Subtask ID: ${subtask.id}`,
    `Subtask: ${subtask.title}`,
    `Jenis: ${subtask.kind}`,
    `Tujuan: ${subtask.goal || "-"}`,
    "",
    "Acceptance criteria:",
    acceptance,
    "",
    "Buat output ringkas dan action-ready dengan format markdown:",
    "1) Ringkasan solusi",
    "2) Langkah implementasi teknis",
    "3) Checklist validasi",
    "4) Risiko + mitigasi",
  ].join("\n");
}

function buildLocalExecutionOutput(mainTask, subtask, refId) {
  const acceptance = subtask.acceptance_criteria.length
    ? subtask.acceptance_criteria.map((value, index) => `${index + 1}. ${value}`).join("\n")
    : "1. Task selesai dan tervalidasi";

  const commandHintsByKind = {
    architecture: [
      "rg --files",
      "rg -n \"keyword\" src supabase scripts",
      "npm run lint -- --max-warnings=100000",
    ],
    implementation: [
      "npm run autofix",
      "npm run test",
      "npm run build",
    ],
    review: [
      "git status --short",
      "npm run lint -- --max-warnings=100000",
      "npm run test",
    ],
    boilerplate: [
      "rg --files",
      "npm run lint -- --max-warnings=100000",
    ],
    qa: [
      "npm run lint -- --max-warnings=100000",
      "npm run test",
      "npm run build",
    ],
    default: [
      "rg --files",
      "npm run lint -- --max-warnings=100000",
      "npm run test",
    ],
  };

  const hints = commandHintsByKind[subtask.kind] || commandHintsByKind.default;
  const commandHints = hints.map((cmd, index) => `${index + 1}. \`${cmd}\``).join("\n");

  return [
    `# ${subtask.title}`,
    "",
    `- ref_id: ${refId}`,
    `- mode: local-generated`,
    `- suggested_model: ${subtask.model}`,
    "",
    "## Ringkasan Solusi",
    `Subtask ini dihasilkan oleh mode lokal untuk task utama: "${mainTask}".`,
    "",
    "## Langkah Implementasi Teknis",
    `1. Fokuskan perubahan pada tujuan subtask: ${subtask.goal || "-"}.`,
    "2. Kerjakan file yang independen untuk menghindari konflik paralel.",
    "3. Jalankan validasi minimal setelah perubahan.",
    "",
    "## Checklist Validasi",
    acceptance,
    "",
    "## Command Hint",
    commandHints,
    "",
    "## Risiko + Mitigasi",
    "1. Risiko: hasil lokal tidak sekomprehensif model API.",
    "2. Mitigasi: lanjutkan iterasi manual + lint/test/build setelah implementasi.",
  ].join("\n");
}

function renderSummary(runInfo, results) {
  const lines = [
    `# Multi-Model Orchestration Summary`,
    "",
    `- run_id: \`${runInfo.runId}\``,
    `- task: ${runInfo.task}`,
    `- planner_model: \`${runInfo.plannerModel}\``,
    `- max_parallel: \`${runInfo.maxParallel}\``,
    "",
    "| # | subtask_id | title | model | status |",
    "|---|---|---|---|---|",
  ];

  for (let i = 0; i < results.length; i += 1) {
    const result = results[i];
    lines.push(`| ${i + 1} | ${result.subtask.id} | ${result.subtask.title} | ${result.modelUsed} | ${result.status} |`);
  }

  return lines.join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(usage());
    return;
  }

  if (!args.task && !args.taskFile) {
    throw new Error("Isi --task atau --task-file\n\n" + usage());
  }

  await loadEnvFile(path.join(ROOT_DIR, ".env.local"));
  await loadEnvFile(path.join(ROOT_DIR, ".env"));

  const config = await loadConfig(path.resolve(args.configPath));
  const apiKey = process.env.OPENAI_API_KEY || "";
  const hasApiKey = Boolean(apiKey.trim());
  const executionMode = args.dryRun ? "dry-run" : args.local || !hasApiKey ? "local" : "remote-api";
  const runId = buildRunId();
  const outputDir = args.outputDir
    ? path.resolve(args.outputDir)
    : path.join(ROOT_DIR, "artifacts", "model-orchestration", runId);

  await fs.mkdir(outputDir, { recursive: true });

  const maxParallel = args.maxParallel || config.orchestrator.max_parallel || 4;
  const fallbackModels = (config.orchestrator.fallback_models || []).map((m) => resolveModelName(m, config));
  let mainTask = args.task || "";
  let plannedSubtasks = [];
  let plannerModel = resolveModelName(config.orchestrator.planner_model, config);

  if (executionMode === "local" && !args.local && !hasApiKey) {
    console.log("[orchestrator] OPENAI_API_KEY tidak ditemukan, fallback otomatis ke mode lokal.");
  }

  if (args.taskFile) {
    const taskFilePath = path.resolve(args.taskFile);
    const raw = await fs.readFile(taskFilePath, "utf8");
    const parsed = JSON.parse(raw);
    mainTask = parsed.task || mainTask || "Task dari task-file";
    plannedSubtasks = normalizeSubtasks(parsed, config);
    plannerModel = "task-file";
  } else if (args.noPlan) {
    plannedSubtasks = normalizeSubtasks(
      {
        subtasks: [
          {
            id: "single-task",
            title: "Eksekusi task tunggal",
            kind: "implementation",
            goal: mainTask,
            acceptance_criteria: ["Task selesai dan tervalidasi"],
          },
        ],
      },
      config
    );
    plannerModel = "disabled";
  } else if (args.dryRun) {
    plannedSubtasks = normalizeSubtasks(heuristicPlanFromTask(mainTask), config);
    plannerModel = "heuristic";
  } else if (executionMode === "remote-api") {
    const plannerResult = await runModelWithFallback({
      apiKey,
      preferredModel: plannerModel,
      fallbackModels,
      systemPrompt: "Kamu planner engineering. Jawab hanya JSON valid.",
      userPrompt: buildPlannerPrompt(mainTask),
    });
    plannerModel = plannerResult.modelUsed;
    plannedSubtasks = normalizeSubtasks(extractJson(plannerResult.outputText), config);
  } else {
    plannedSubtasks = normalizeSubtasks(heuristicPlanFromTask(mainTask), config);
    plannerModel = args.local ? "local-forced" : "local-auto-no-key";
  }

  const runInfo = {
    runId,
    task: mainTask,
    outputDir,
    plannerModel,
    maxParallel,
    totalSubtasks: plannedSubtasks.length,
    dryRun: args.dryRun,
    executionMode,
    hasApiKey,
    createdAt: new Date().toISOString(),
  };

  await fs.writeFile(path.join(outputDir, "run-info.json"), JSON.stringify(runInfo, null, 2));
  await fs.writeFile(path.join(outputDir, "plan.json"), JSON.stringify({ task: mainTask, subtasks: plannedSubtasks }, null, 2));

  console.log(`[orchestrator] run_id=${runId}`);
  console.log(`[orchestrator] subtasks=${plannedSubtasks.length}, max_parallel=${maxParallel}`);

  const executionResults = await mapWithConcurrency(plannedSubtasks, maxParallel, async (subtask, index) => {
    const ref = `${runId}-${String(index + 1).padStart(2, "0")}-${subtask.id}`;
    const startedAt = new Date().toISOString();
    console.log(`[orchestrator] start ${subtask.id} model=${subtask.model}`);

    if (args.dryRun) {
      const text = [
        `# ${subtask.title}`,
        "",
        `- ref_id: ${ref}`,
        `- mode: dry-run`,
        `- model: ${subtask.model}`,
        "",
        "Output model dilewati karena --dry-run aktif.",
      ].join("\n");
      return {
        ref_id: ref,
        status: "dry-run",
        modelUsed: subtask.model,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        subtask,
        output: text,
      };
    }

    if (executionMode === "local") {
      return {
        ref_id: ref,
        status: "local-generated",
        modelUsed: "local-template",
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        subtask,
        output: buildLocalExecutionOutput(mainTask, subtask, ref),
      };
    }

    const result = await runModelWithFallback({
      apiKey,
      preferredModel: subtask.model,
      fallbackModels: subtask.fallback_models,
      systemPrompt: "Kamu senior coding agent. Jawab ringkas, teknis, dan terstruktur.",
      userPrompt: buildExecutionPrompt(mainTask, subtask),
    });

    return {
      ref_id: ref,
      status: "completed",
      modelUsed: result.modelUsed,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      subtask,
      output: result.outputText,
    };
  });

  for (let i = 0; i < executionResults.length; i += 1) {
    const item = executionResults[i];
    const filename = `${String(i + 1).padStart(2, "0")}-${item.subtask.id}.md`;
    await fs.writeFile(path.join(outputDir, filename), item.output);
  }

  await fs.writeFile(path.join(outputDir, "results.json"), JSON.stringify(executionResults, null, 2));
  await fs.writeFile(path.join(outputDir, "summary.md"), renderSummary(runInfo, executionResults));

  console.log(`[orchestrator] selesai. artifacts: ${outputDir}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[orchestrator] gagal: ${message}`);
  process.exitCode = 1;
});
