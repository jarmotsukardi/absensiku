import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const MANUAL_DIR = path.join(ROOT, "public", "manuals");
const OUTPUT_PATH = path.join(MANUAL_DIR, "index.html");

const pad = (value) => value.toString().padStart(2, "0");

const formatDateFromName = (name) => {
  const match = name.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const [_, year, month, day] = match;
  return `${day}-${month}-${year}`;
};

const extractTitle = (name) => {
  const base = name.replace(/\.pdf$/i, "");
  if (base.includes("manual-hr-admin")) return "Manual HR Admin";
  if (base.includes("manual-payroll-admin")) return "Manual Payroll Admin";
  if (base.includes("manual-hr-")) return "Manual HR";
  if (base.includes("manual-payroll-")) return "Manual Payroll";
  if (base.includes("manual-")) return "Manual";
  return "Dokumen";
};

const formatLabel = (fileName) => {
  const title = extractTitle(fileName);
  const date = formatDateFromName(fileName);
  if (date) return `${title} (${date})`;
  return title;
};

const listManuals = () => {
  if (!fs.existsSync(MANUAL_DIR)) return [];
  const entries = fs.readdirSync(MANUAL_DIR);
  return entries
    .filter((name) => name.toLowerCase().endsWith(".pdf"))
    .sort((a, b) => b.localeCompare(a));
};

const files = listManuals();
const now = new Date();
const generatedAt = `${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

const listItems = files.length
  ? files
      .map((file) => {
        const label = formatLabel(file);
        return `    <li><a href="/manuals/${file}" target="_blank" rel="noopener noreferrer">${label}</a></li>`;
      })
      .join("\n")
  : "    <li class=\"muted\">Belum ada PDF manual.</li>";

const html = `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Indeks Manual</title>
  <style>
    :root { color-scheme: light; }
    body { font-family: "Times New Roman", Times, serif; line-height: 1.5; margin: 40px; color: #111; }
    h1 { font-size: 22px; margin: 0 0 12px; }
    p { margin: 0 0 12px; }
    ul { padding-left: 18px; }
    a { color: #1b4db1; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .muted { color: #555; }
    .meta { font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <h1>Indeks Manual</h1>
  <p class="muted">Daftar manual PDF tersedia untuk diunduh.</p>
  <ul>
${listItems}
  </ul>
  <p class="meta">Dibuat otomatis: ${generatedAt}</p>
</body>
</html>
`;

fs.writeFileSync(OUTPUT_PATH, html, "utf8");
console.log(`Manual index generated: ${OUTPUT_PATH}`);
