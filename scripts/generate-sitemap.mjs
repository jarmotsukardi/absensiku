import fs from "node:fs/promises";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();
const PUBLIC_DIR = path.join(ROOT, "public");
const OUTPUT_PATH = path.join(PUBLIC_DIR, "sitemap.xml");
const BASE_URL = "https://absensipro.com";

const STATIC_ROUTES = [
  { path: "/", changefreq: "daily", priority: "1.0" },
  { path: "/hr", changefreq: "weekly", priority: "0.9" },
  { path: "/payroll", changefreq: "weekly", priority: "0.9" },
  { path: "/konsultasi", changefreq: "weekly", priority: "0.8" },
  { path: "/news", changefreq: "daily", priority: "0.8" },
  { path: "/faq", changefreq: "weekly", priority: "0.8" },
  { path: "/about", changefreq: "monthly", priority: "0.7" },
  { path: "/download", changefreq: "weekly", priority: "0.8" },
];

const readEnvFile = async (filename) => {
  try {
    const raw = await fs.readFile(path.join(ROOT, filename), "utf8");
    return Object.fromEntries(
      raw
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#") && line.includes("="))
        .map((line) => {
          const idx = line.indexOf("=");
          const key = line.slice(0, idx).trim();
          const value = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
          return [key, value];
        }),
    );
  } catch {
    return {};
  }
};

const resolveEnv = async () => {
  const envLocal = await readEnvFile(".env.local");
  const envOnline = await readEnvFile(".env.online");
  const env = { ...envOnline, ...envLocal, ...process.env };

  return {
    supabaseUrl: env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "",
    supabaseAnonKey: env.VITE_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  };
};

const escapeXml = (value) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const buildUrlXml = ({ loc, changefreq, priority, lastmod }) => `  <url>
    <loc>${escapeXml(loc)}</loc>
    ${lastmod ? `<lastmod>${escapeXml(lastmod)}</lastmod>` : ""}
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;

const formatIsoDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
};

const main = async () => {
  const { supabaseUrl, supabaseAnonKey } = await resolveEnv();
  const urls = [...STATIC_ROUTES].map((route) => ({
    loc: `${BASE_URL}${route.path}`,
    changefreq: route.changefreq,
    priority: route.priority,
  }));

  if (supabaseUrl && supabaseAnonKey) {
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase
      .from("articles")
      .select("slug, published_at, created_at, is_published")
      .eq("is_published", true)
      .order("published_at", { ascending: false });

    if (error) {
      console.error("[warn] gagal memuat artikel untuk sitemap:", error.message);
    } else if (Array.isArray(data)) {
      for (const article of data) {
        if (!article.slug) continue;
        urls.push({
          loc: `${BASE_URL}/news/${article.slug}`,
          changefreq: "monthly",
          priority: "0.7",
          lastmod: formatIsoDate(article.published_at || article.created_at),
        });
      }
    }
  } else {
    console.warn("[warn] env Supabase tidak tersedia, sitemap dihasilkan hanya dengan route statis");
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(buildUrlXml).join("\n")}
</urlset>
`;

  await fs.writeFile(OUTPUT_PATH, xml, "utf8");
  console.log(`[ok] sitemap ditulis ke ${OUTPUT_PATH} dengan ${urls.length} URL`);
};

main().catch((error) => {
  console.error("[error] generate sitemap gagal:", error);
  process.exitCode = 1;
});
