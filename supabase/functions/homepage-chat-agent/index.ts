import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createTraceId, logTraceError, withTrace } from "../_shared/error-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_TIMEOUT_MS = 12000;
const MAX_QUESTION_LENGTH = 600;
const RATE_LIMIT_ATTEMPT_TYPE = "homepage_chat_agent";
const RATE_LIMIT_WINDOW_MINUTES = 5;
const RATE_LIMIT_MAX_ATTEMPTS = 12;
const RATE_LIMIT_LOCKOUT_MINUTES = 10;

interface GeminiFeature {
  title: string;
  description: string;
}

interface GeminiPricingPlan {
  name: string;
  price: number;
  period: string;
}

interface GeminiFaq {
  question: string;
  answer: string;
  category: string;
}

interface GeminiArticle {
  title: string;
  excerpt: string;
}

interface GeminiContext {
  features: GeminiFeature[];
  pricingPlans: GeminiPricingPlan[];
  faqs: GeminiFaq[];
  articles: GeminiArticle[];
}

interface ChatRequest {
  question?: unknown;
  model?: unknown;
  context?: unknown;
}

interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    if (error.name === "AbortError") return "Permintaan ke Gemini timeout";
    return error.message;
  }
  return "Terjadi kesalahan internal";
};

const sanitizeText = (value: unknown, maxLength: number): string => {
  if (typeof value !== "string") return "";
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  return normalized.slice(0, maxLength);
};

const sanitizeToken = (value: string, fallback: string): string => {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!normalized) return fallback;
  return normalized.slice(0, 64);
};

const resolveClientIp = (req: Request): string => {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const firstIp = forwardedFor.split(",")[0]?.trim();
    if (firstIp) return firstIp;
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp?.trim()) return realIp.trim();
  const cfIp = req.headers.get("cf-connecting-ip");
  if (cfIp?.trim()) return cfIp.trim();
  return "unknown";
};

const buildRateLimitIdentifier = (req: Request): string => {
  const ipToken = sanitizeToken(resolveClientIp(req), "unknown-ip");
  const uaToken = sanitizeToken(req.headers.get("user-agent") || "", "unknown-ua");
  return `homepage_chat_agent:${ipToken}:${uaToken}`;
};

const applyRateLimit = async (input: {
  supabase: ReturnType<typeof createClient>;
  identifier: string;
}): Promise<RateLimitResult> => {
  const now = new Date();
  const nowIso = now.toISOString();
  const windowStart = new Date(now.getTime() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000);

  const { data: row, error: readError } = await input.supabase
    .from("rate_limit_otp")
    .select("*")
    .eq("identifier", input.identifier)
    .eq("attempt_type", RATE_LIMIT_ATTEMPT_TYPE)
    .maybeSingle();

  if (readError) throw readError;

  if (!row) {
    const { error: insertError } = await input.supabase.from("rate_limit_otp").insert({
      identifier: input.identifier,
      attempt_type: RATE_LIMIT_ATTEMPT_TYPE,
      attempt_count: 1,
      first_attempt_at: nowIso,
      last_attempt_at: nowIso,
      locked_until: null,
    });
    if (insertError) throw insertError;
    return { allowed: true };
  }

  const lockedUntil = row.locked_until ? new Date(row.locked_until) : null;
  if (lockedUntil && lockedUntil > now) {
    const retryAfterSeconds = Math.max(1, Math.ceil((lockedUntil.getTime() - now.getTime()) / 1000));
    return { allowed: false, retryAfterSeconds };
  }

  const firstAttemptAt = row.first_attempt_at ? new Date(row.first_attempt_at) : null;
  if (!firstAttemptAt || firstAttemptAt < windowStart) {
    const { error: resetError } = await input.supabase
      .from("rate_limit_otp")
      .update({
        attempt_count: 1,
        first_attempt_at: nowIso,
        last_attempt_at: nowIso,
        locked_until: null,
      })
      .eq("id", row.id);
    if (resetError) throw resetError;
    return { allowed: true };
  }

  const attemptCount = Number(row.attempt_count || 0);
  if (attemptCount >= RATE_LIMIT_MAX_ATTEMPTS) {
    const lockedUntilDate = new Date(now.getTime() + RATE_LIMIT_LOCKOUT_MINUTES * 60 * 1000);
    const { error: lockError } = await input.supabase
      .from("rate_limit_otp")
      .update({
        locked_until: lockedUntilDate.toISOString(),
        last_attempt_at: nowIso,
      })
      .eq("id", row.id);
    if (lockError) throw lockError;
    const retryAfterSeconds = Math.max(1, Math.ceil((lockedUntilDate.getTime() - now.getTime()) / 1000));
    return { allowed: false, retryAfterSeconds };
  }

  const { error: incrementError } = await input.supabase
    .from("rate_limit_otp")
    .update({
      attempt_count: attemptCount + 1,
      last_attempt_at: nowIso,
      locked_until: null,
    })
    .eq("id", row.id);
  if (incrementError) throw incrementError;

  return { allowed: true };
};

const normalizeContext = (value: unknown): GeminiContext => {
  const fallback: GeminiContext = {
    features: [],
    pricingPlans: [],
    faqs: [],
    articles: [],
  };

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fallback;
  }

  const raw = value as Record<string, unknown>;

  const features = Array.isArray(raw.features)
    ? raw.features
        .map((item) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) return null;
          const row = item as Record<string, unknown>;
          const title = sanitizeText(row.title, 120);
          if (!title) return null;
          return {
            title,
            description: sanitizeText(row.description, 260),
          } satisfies GeminiFeature;
        })
        .filter((item): item is GeminiFeature => Boolean(item))
        .slice(0, 8)
    : [];

  const pricingPlans = Array.isArray(raw.pricingPlans)
    ? raw.pricingPlans
        .map((item) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) return null;
          const row = item as Record<string, unknown>;
          const name = sanitizeText(row.name, 80);
          if (!name) return null;
          const parsedPrice = Number(row.price);
          return {
            name,
            price: Number.isFinite(parsedPrice) ? parsedPrice : 0,
            period: sanitizeText(row.period, 60) || "bulan",
          } satisfies GeminiPricingPlan;
        })
        .filter((item): item is GeminiPricingPlan => Boolean(item))
        .slice(0, 6)
    : [];

  const faqs = Array.isArray(raw.faqs)
    ? raw.faqs
        .map((item) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) return null;
          const row = item as Record<string, unknown>;
          const question = sanitizeText(row.question, 240);
          if (!question) return null;
          return {
            question,
            answer: sanitizeText(row.answer, 700),
            category: sanitizeText(row.category, 80) || "Umum",
          } satisfies GeminiFaq;
        })
        .filter((item): item is GeminiFaq => Boolean(item))
        .slice(0, 12)
    : [];

  const articles = Array.isArray(raw.articles)
    ? raw.articles
        .map((item) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) return null;
          const row = item as Record<string, unknown>;
          const title = sanitizeText(row.title, 180);
          if (!title) return null;
          return {
            title,
            excerpt: sanitizeText(row.excerpt, 360),
          } satisfies GeminiArticle;
        })
        .filter((item): item is GeminiArticle => Boolean(item))
        .slice(0, 6)
    : [];

  return { features, pricingPlans, faqs, articles };
};

const buildContextPrompt = (context: GeminiContext): { text: string; sources: string[] } => {
  const segments: string[] = [];
  const sources: string[] = [];

  if (context.features.length > 0) {
    sources.push("features_settings");
    segments.push(
      [
        "FITUR:",
        ...context.features.map((item) => `- ${item.title}: ${item.description || "-"}`),
      ].join("\n"),
    );
  }

  if (context.pricingPlans.length > 0) {
    sources.push("pricing_settings");
    segments.push(
      [
        "PAKET HARGA:",
        ...context.pricingPlans.map((item) => `- ${item.name}: Rp${item.price.toLocaleString("id-ID")}/${item.period}`),
      ].join("\n"),
    );
  }

  if (context.faqs.length > 0) {
    sources.push("faq_settings");
    segments.push(
      [
        "FAQ:",
        ...context.faqs.map((item) => `- [${item.category}] ${item.question} => ${item.answer || "-"}`),
      ].join("\n"),
    );
  }

  if (context.articles.length > 0) {
    sources.push("articles");
    segments.push(
      [
        "ARTIKEL / BERITA:",
        ...context.articles.map((item) => `- ${item.title}${item.excerpt ? `: ${item.excerpt}` : ""}`),
      ].join("\n"),
    );
  }

  return {
    text: segments.join("\n\n"),
    sources,
  };
};

const extractGeminiText = (payload: unknown): string => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "";
  const body = payload as Record<string, unknown>;
  const candidates = Array.isArray(body.candidates) ? body.candidates : [];
  const firstCandidate = candidates[0];
  if (!firstCandidate || typeof firstCandidate !== "object" || Array.isArray(firstCandidate)) return "";
  const content = (firstCandidate as Record<string, unknown>).content;
  if (!content || typeof content !== "object" || Array.isArray(content)) return "";
  const parts = Array.isArray((content as Record<string, unknown>).parts)
    ? ((content as Record<string, unknown>).parts as unknown[])
    : [];

  const text = parts
    .map((part) => {
      if (!part || typeof part !== "object" || Array.isArray(part)) return "";
      return sanitizeText((part as Record<string, unknown>).text, 4000);
    })
    .filter(Boolean)
    .join("\n")
    .trim();

  return text;
};

const callGemini = async (input: {
  apiKey: string;
  model: string;
  question: string;
  contextPrompt: string;
}): Promise<string> => {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.model)}:generateContent?key=${encodeURIComponent(input.apiKey)}`;
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  const prompt = [
    "Anda adalah Chat Agent AbsensiKu.",
    "Gunakan hanya konteks yang diberikan.",
    "Jika informasi tidak tersedia pada konteks, jawab jujur bahwa data belum tersedia dan sarankan kontak WhatsApp/support.",
    "Jawab dalam Bahasa Indonesia yang ringkas dan jelas.",
    "",
    `PERTANYAAN USER: ${input.question}`,
    "",
    "KONTEKS:",
    input.contextPrompt || "Tidak ada konteks tambahan.",
  ].join("\n");

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          topK: 40,
          topP: 0.9,
          maxOutputTokens: 800,
        },
      }),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const details =
        payload && typeof payload === "object" && !Array.isArray(payload)
          ? (payload as Record<string, unknown>)
          : {};
      const message =
        details.error && typeof details.error === "object"
          ? sanitizeText((details.error as Record<string, unknown>).message, 240)
          : "";
      throw new Error(message || `Gemini HTTP ${response.status}`);
    }

    const text = extractGeminiText(payload);
    if (!text) {
      throw new Error("Gemini tidak mengembalikan teks jawaban");
    }

    return text;
  } finally {
    clearTimeout(timeoutHandle);
  }
};

const resolveGeminiApiKey = async (admin: ReturnType<typeof createClient>): Promise<string> => {
  const vaultResult = await admin.rpc("get_homepage_chat_agent_gemini_api_key");
  if (vaultResult.error) {
    throw new Error(`Gagal membaca Gemini API key dari vault: ${vaultResult.error.message}`);
  }

  if (typeof vaultResult.data === "string" && vaultResult.data.trim()) {
    return vaultResult.data.replace(/\s+/g, "").trim();
  }

  return (Deno.env.get("GEMINI_API_KEY") || Deno.env.get("GOOGLE_API_KEY") || "").replace(/\s+/g, "").trim();
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const traceId = createTraceId("homepage-chat-agent");

  try {
    const supabaseUrl = (Deno.env.get("SUPABASE_URL") || "").trim();
    const supabaseServiceKey = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify(withTrace({ success: false, error: "SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi" }, traceId)),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const admin = createClient(supabaseUrl, supabaseServiceKey);
    const rateLimitIdentifier = buildRateLimitIdentifier(req);
    const rateLimitResult = await applyRateLimit({ supabase: admin, identifier: rateLimitIdentifier });
    if (!rateLimitResult.allowed) {
      const retryAfterSeconds = rateLimitResult.retryAfterSeconds ?? RATE_LIMIT_LOCKOUT_MINUTES * 60;
      return new Response(
        JSON.stringify(
          withTrace(
            {
              success: false,
              error: "Terlalu banyak permintaan. Silakan coba lagi nanti.",
              retry_after_seconds: retryAfterSeconds,
            },
            traceId,
          ),
        ),
        {
          status: 429,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "Retry-After": String(retryAfterSeconds),
          },
        },
      );
    }
    const geminiApiKey = await resolveGeminiApiKey(admin);
    if (!geminiApiKey) {
      return new Response(
        JSON.stringify(
          withTrace(
            {
              success: false,
              error: "GEMINI_API_KEY/GOOGLE_API_KEY belum dikonfigurasi di edge function secret",
            },
            traceId,
          ),
        ),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = (await req.json().catch(() => null)) as ChatRequest | null;
    const question = sanitizeText(body?.question, MAX_QUESTION_LENGTH);
    if (!question) {
      return new Response(
        JSON.stringify(withTrace({ success: false, error: "Pertanyaan tidak boleh kosong" }, traceId)),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const model = sanitizeText(body?.model, 120) || DEFAULT_GEMINI_MODEL;
    const context = normalizeContext(body?.context);
    const { text: contextPrompt, sources } = buildContextPrompt(context);
    const answerText = await callGemini({
      apiKey: geminiApiKey,
      model,
      question,
      contextPrompt,
    });

    return new Response(
      JSON.stringify(
        withTrace(
          {
            success: true,
            provider: "gemini",
            model,
            text: answerText,
            sources: ["gemini", ...sources],
          },
          traceId,
        ),
      ),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    logTraceError(traceId, "homepage-chat-agent failed", error);
    return new Response(
      JSON.stringify(withTrace({ success: false, error: toErrorMessage(error) }, traceId)),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
