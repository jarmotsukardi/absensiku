import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bot, MessageSquare, Send, X, ExternalLink } from "lucide-react";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import type { Article, FAQ, Feature, PricingPlan } from "@/hooks/useHomepageData";

type ChatRole = "assistant" | "user";
type ChatAnswerEngine = "gemini" | "local";

interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  sources?: string[];
  engine?: ChatAnswerEngine;
}

interface HomepageChatAgentSettings {
  enabled: boolean;
  bot_name: string;
  bot_subtitle: string;
  welcome_message: string;
  input_placeholder: string;
  position: "bottom-left" | "bottom-right";
  show_on_mobile: boolean;
  show_on_desktop: boolean;
  allowed_paths: string[];
  quick_prompts: string[];
  max_history: number;
  show_sources: boolean;
  auto_open_seconds: number;
  answer_mode: "local" | "gemini_hybrid" | "gemini";
  gemini_model: string;
  enable_whatsapp_fallback: boolean;
  whatsapp_number: string;
  whatsapp_message: string;
}

interface HomepageChatAgentProps {
  features: Feature[];
  pricingPlans: PricingPlan[];
  faqs: FAQ[];
  articles: Article[];
  hideLauncher?: boolean;
}

interface ResolvedAnswer {
  text: string;
  sources: string[];
  engine: ChatAnswerEngine;
}

interface GeminiFeaturePayload {
  title: string;
  description: string;
}

interface GeminiPricingPayload {
  name: string;
  price: number;
  period: string;
}

interface GeminiFaqPayload {
  question: string;
  answer: string;
  category: string;
}

interface GeminiArticlePayload {
  title: string;
  excerpt: string;
}

interface GeminiContextPayload {
  features: GeminiFeaturePayload[];
  pricingPlans: GeminiPricingPayload[];
  faqs: GeminiFaqPayload[];
  articles: GeminiArticlePayload[];
}

interface GeminiFunctionResponse {
  success?: boolean;
  text?: string;
  sources?: string[];
  error?: string;
  trace_id?: string;
  provider?: string;
  model?: string;
}

const STORAGE_KEY = "homepage_chat_agent_dismissed";
const DEFAULT_GEMINI_MODEL = "gemini-2.0-flash";
const looksLikeGeminiApiKey = (value: string) => /^AIza[0-9A-Za-z_-]{20,}$/.test(value.trim());
const normalizeGeminiModel = (value: unknown) => {
  if (typeof value !== "string") return DEFAULT_GEMINI_MODEL;
  const trimmed = value.trim();
  if (!trimmed || looksLikeGeminiApiKey(trimmed)) return DEFAULT_GEMINI_MODEL;
  return trimmed;
};

const defaultSettings: HomepageChatAgentSettings = {
  enabled: false,
  bot_name: "AbsensiKu Assistant",
  bot_subtitle: "Bantu info fitur, harga, dan FAQ",
  welcome_message: "Halo, saya bisa bantu jawab pertanyaan tentang AbsensiKu.",
  input_placeholder: "Tulis pertanyaan Anda...",
  position: "bottom-left",
  show_on_mobile: true,
  show_on_desktop: true,
  allowed_paths: ["/", "/about", "/faq"],
  quick_prompts: ["Apa fitur unggulan AbsensiKu?", "Bagaimana paket harganya?", "Bagaimana cara mulai trial?"],
  max_history: 12,
  show_sources: true,
  auto_open_seconds: 0,
  answer_mode: "local",
  gemini_model: DEFAULT_GEMINI_MODEL,
  enable_whatsapp_fallback: false,
  whatsapp_number: "",
  whatsapp_message: "Halo, saya ingin konsultasi mengenai AbsensiKu.",
};

const toStrArray = (value: unknown, fallback: string[]) => {
  if (!Array.isArray(value)) return fallback;
  const sanitized = value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
  return sanitized.length > 0 ? sanitized : fallback;
};

const normalizeSettings = (value: unknown): HomepageChatAgentSettings => {
  if (!value || typeof value !== "object") return defaultSettings;
  const raw = value as Record<string, unknown>;
  const maxHistoryCandidate = Number(raw.max_history);
  const autoOpenCandidate = Number(raw.auto_open_seconds);
  const answerMode =
    raw.answer_mode === "gemini_hybrid" || raw.answer_mode === "gemini"
      ? raw.answer_mode
      : defaultSettings.answer_mode;

  return {
    enabled: raw.enabled === true,
    bot_name: typeof raw.bot_name === "string" && raw.bot_name.trim() ? raw.bot_name.trim() : defaultSettings.bot_name,
    bot_subtitle: typeof raw.bot_subtitle === "string" && raw.bot_subtitle.trim() ? raw.bot_subtitle.trim() : defaultSettings.bot_subtitle,
    welcome_message:
      typeof raw.welcome_message === "string" && raw.welcome_message.trim()
        ? raw.welcome_message.trim()
        : defaultSettings.welcome_message,
    input_placeholder:
      typeof raw.input_placeholder === "string" && raw.input_placeholder.trim()
        ? raw.input_placeholder.trim()
        : defaultSettings.input_placeholder,
    position: raw.position === "bottom-right" ? "bottom-right" : "bottom-left",
    show_on_mobile: raw.show_on_mobile !== false,
    show_on_desktop: raw.show_on_desktop !== false,
    allowed_paths: toStrArray(raw.allowed_paths, defaultSettings.allowed_paths),
    quick_prompts: toStrArray(raw.quick_prompts, defaultSettings.quick_prompts),
    max_history: Number.isFinite(maxHistoryCandidate) && maxHistoryCandidate > 0 ? Math.min(30, Math.floor(maxHistoryCandidate)) : defaultSettings.max_history,
    show_sources: raw.show_sources !== false,
    auto_open_seconds: Number.isFinite(autoOpenCandidate) && autoOpenCandidate >= 0 ? Math.min(30, Math.floor(autoOpenCandidate)) : defaultSettings.auto_open_seconds,
    answer_mode: answerMode,
    gemini_model: normalizeGeminiModel(raw.gemini_model),
    enable_whatsapp_fallback: raw.enable_whatsapp_fallback === true,
    whatsapp_number: typeof raw.whatsapp_number === "string" ? raw.whatsapp_number.trim() : defaultSettings.whatsapp_number,
    whatsapp_message:
      typeof raw.whatsapp_message === "string" && raw.whatsapp_message.trim()
        ? raw.whatsapp_message.trim()
        : defaultSettings.whatsapp_message,
  };
};

const matchesAllowedPath = (path: string, allowed: string[]) => {
  if (allowed.length === 0) return true;
  return allowed.some((item) => {
    const normalized = item.trim();
    if (!normalized) return false;
    if (normalized === "/") return path === "/";
    return path.startsWith(normalized);
  });
};

const includesKeyword = (query: string, keywords: string[]) => keywords.some((keyword) => query.includes(keyword));

const CHAT_PREVIEW_MAX_GENERIC = 360;
const CHAT_PREVIEW_MAX_FAQ = 1200;
const GEMINI_CONTEXT_LIMITS = {
  features: 8,
  pricingPlans: 6,
  faqs: 12,
  articles: 6,
};

const shortText = (text: string, max = CHAT_PREVIEW_MAX_GENERIC) =>
  text.length > max ? `${text.slice(0, max).trim()}...` : text;
const createMessageId = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const fallbackFeatures = [
  { title: "Absensi GPS", description: "Validasi lokasi real-time berbasis GPS." },
  { title: "Anti Fake GPS", description: "Deteksi mock location/fake GPS." },
  { title: "Multi Shift", description: "Pengaturan jadwal kerja fleksibel per shift." },
  { title: "Izin & Cuti", description: "Pengajuan izin/cuti dengan alur persetujuan." },
];

const fallbackPricing = [
  { name: "Akses", price: 0, period: "gratis" },
  { name: "Profesional", price: 3500, period: "pegawai/bulan" },
  { name: "Enterprise", price: 0, period: "custom" },
];

export function HomepageChatAgent({ features, pricingPlans, faqs, articles, hideLauncher = false }: HomepageChatAgentProps) {
  const [settings, setSettings] = useState<HomepageChatAgentSettings>(defaultSettings);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [isResponding, setIsResponding] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const didAutoOpen = useRef(false);

  const currentPath = typeof window !== "undefined" ? window.location.pathname : "/";
  const isMobile = typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(max-width: 768px)").matches
    : false;

  const isVisible = useMemo(() => {
    if (!settings.enabled) return false;
    if (isMobile && !settings.show_on_mobile) return false;
    if (!isMobile && !settings.show_on_desktop) return false;
    if (!matchesAllowedPath(currentPath, settings.allowed_paths)) return false;
    return true;
  }, [currentPath, isMobile, settings]);

  const buildAnswer = useCallback(
    (question: string): ResolvedAnswer => {
      const q = question.toLowerCase();
      const sources: string[] = [];

      if (includesKeyword(q, ["harga", "biaya", "paket", "langganan", "subscription"])) {
        const topPlans =
          pricingPlans.length > 0
            ? pricingPlans.slice(0, 3)
            : fallbackPricing.map((plan) => ({
                id: plan.name,
                name: plan.name,
                description: "",
                price: plan.price,
                period: plan.period,
                features: [],
                is_popular: false,
              }));
        const planLines = topPlans
          .map((plan) => {
            if (Number(plan.price || 0) <= 0) return `- ${plan.name}: ${plan.period || "custom"}`;
            return `- ${plan.name}: Rp${Number(plan.price || 0).toLocaleString("id-ID")}/${plan.period || "bulan"}`;
          })
          .join("\n");

        return {
          text: `Berikut paket utama yang tersedia:\n${planLines}\n\nSilakan pilih paket yang paling sesuai kebutuhan organisasi Anda.`,
          sources: pricingPlans.length > 0 ? ["pricing_settings"] : ["pricing_default_fallback"],
          engine: "local",
        };
      }

      if (includesKeyword(q, ["fitur", "keunggulan", "kelebihan", "bisa apa", "unggulan"])) {
        const topFeatures =
          features.length > 0
            ? features.slice(0, 4)
            : fallbackFeatures.map((feature, idx) => ({
                id: `fallback-${idx}`,
                icon: "Shield",
                title: feature.title,
                description: feature.description,
              }));
        return {
          text: `Fitur unggulan AbsensiKu:\n${topFeatures
            .map((feature) => `- ${feature.title}: ${shortText(feature.description || "")}`)
            .join("\n")}`,
          sources: features.length > 0 ? ["features_settings"] : ["features_default_fallback"],
          engine: "local",
        };
      }

      if (includesKeyword(q, ["berita", "artikel", "update", "rilis", "pengumuman"])) {
        if (articles.length === 0) {
          return {
            text: "Saat ini belum ada artikel/berita yang bisa ditampilkan.",
            sources: ["articles"],
            engine: "local",
          };
        }

        return {
          text: `Update terbaru:\n${articles
            .slice(0, 3)
            .map((article) => `- ${article.title}`)
            .join("\n")}\n\nAnda bisa buka menu Berita/Artikel untuk detail lengkap.`,
          sources: ["articles"],
          engine: "local",
        };
      }

      if (includesKeyword(q, ["login", "masuk", "daftar", "registrasi", "trial", "coba"])) {
        return {
          text: "Untuk mulai menggunakan AbsensiKu, Anda bisa daftar akun organisasi dari halaman utama lalu login sesuai peran (Admin Organisasi/Pegawai). Jika ingin demo, gunakan tombol WhatsApp pada halaman ini.",
          sources: ["faq_settings", "hero_settings"],
          engine: "local",
        };
      }

      const faqMatches = faqs.filter((faq) => {
        const haystack = `${faq.question} ${faq.answer}`.toLowerCase();
        return q.split(/\s+/).filter(Boolean).some((token) => token.length > 2 && haystack.includes(token));
      });

      if (faqMatches.length > 0) {
        const selected = faqMatches.slice(0, 3);
        return {
          text: selected
            .map((faq, idx) => `${idx + 1}. ${faq.question}\n${shortText(faq.answer || "", CHAT_PREVIEW_MAX_FAQ)}`)
            .join("\n\n"),
          sources: ["faq_settings"],
          engine: "local",
        };
      }

      sources.push("faq_settings", "features_settings", "pricing_settings");
      return {
        text: "Saya belum menemukan jawaban spesifik untuk pertanyaan itu. Coba tanya tentang fitur, harga, trial, atau berita terbaru. Anda juga bisa lanjut ke WhatsApp agar tim kami bantu langsung.",
        sources,
        engine: "local",
      };
    },
    [articles, faqs, features, pricingPlans],
  );

  const appendAssistantMessage = useCallback((text: string, sources?: string[], engine?: ChatAnswerEngine) => {
    setMessages((prev) => {
      const next = [
        ...prev,
        {
          id: createMessageId(),
          role: "assistant" as const,
          text,
          sources,
          engine,
        },
      ];
      const maxMessages = Math.max(4, settings.max_history * 2);
      return next.slice(-maxMessages);
    });
  }, [settings.max_history]);

  const buildGeminiContext = useCallback((): GeminiContextPayload => {
    return {
      features: features.slice(0, GEMINI_CONTEXT_LIMITS.features).map((feature) => ({
        title: shortText(feature.title || "", 120),
        description: shortText(feature.description || "", 260),
      })),
      pricingPlans: pricingPlans.slice(0, GEMINI_CONTEXT_LIMITS.pricingPlans).map((plan) => ({
        name: shortText(plan.name || "", 80),
        price: Number(plan.price || 0),
        period: shortText(plan.period || "", 60),
      })),
      faqs: faqs.slice(0, GEMINI_CONTEXT_LIMITS.faqs).map((faq) => ({
        question: shortText(faq.question || "", 240),
        answer: shortText(faq.answer || "", 600),
        category: shortText(faq.category || "Umum", 80),
      })),
      articles: articles.slice(0, GEMINI_CONTEXT_LIMITS.articles).map((article) => ({
        title: shortText(article.title || "", 180),
        excerpt: shortText(article.excerpt || "", 320),
      })),
    };
  }, [articles, faqs, features, pricingPlans]);

  const askGemini = useCallback(
    async (question: string): Promise<ResolvedAnswer> => {
      const resolvedModel = normalizeGeminiModel(settings.gemini_model);
      const payload = {
        question,
        model: resolvedModel,
        context: buildGeminiContext(),
      };

      const { data, error } = await supabase.functions.invoke<GeminiFunctionResponse>("homepage-chat-agent", {
        body: payload,
      });

      if (error) throw error;
      if (!data?.success || typeof data.text !== "string" || !data.text.trim()) {
        const traceSuffix = data?.trace_id ? ` [trace_id=${data.trace_id}]` : "";
        throw new Error((data?.error || "Gemini tidak mengembalikan jawaban valid") + traceSuffix);
      }

      return {
        text: data.text.trim(),
        sources: data.sources && data.sources.length > 0 ? data.sources : ["gemini"],
        engine: "gemini",
      };
    },
    [buildGeminiContext, settings.gemini_model],
  );

  const handleSubmit = useCallback(async () => {
    const question = input.trim();
    if (!question || isResponding) return;

    setInput("");
    setMessages((prev) => {
      const next = [...prev, { id: createMessageId(), role: "user" as const, text: question }];
      const maxMessages = Math.max(4, settings.max_history * 2);
      return next.slice(-maxMessages);
    });

    setIsResponding(true);
    try {
      const shouldUseGemini = settings.answer_mode === "gemini" || settings.answer_mode === "gemini_hybrid";
      let answer: ResolvedAnswer | null = null;

      if (shouldUseGemini) {
        try {
          answer = await askGemini(question);
        } catch (error) {
          const fallbackRef = reportError(error, "homepage.chat_agent.gemini_answer_failed", {
            question,
            answer_mode: settings.answer_mode,
          });

          if (settings.answer_mode === "gemini") {
            throw new Error(appendErrorReference("Gemini tidak dapat menjawab saat ini.", fallbackRef));
          }
        }
      }

      if (!answer) {
        answer = buildAnswer(question);
      }

      window.setTimeout(() => {
        appendAssistantMessage(answer.text, answer.sources, answer.engine);
        setIsResponding(false);
      }, 250);
    } catch (error) {
      const ref = reportError(error, "homepage.chat_agent.generate_answer", { question });
      appendAssistantMessage(appendErrorReference("Terjadi kendala saat memproses pertanyaan.", ref));
      setIsResponding(false);
    }
  }, [appendAssistantMessage, askGemini, buildAnswer, input, isResponding, settings.answer_mode, settings.max_history]);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const { data, error } = await supabase
          .from("system_settings")
          .select("value")
          .eq("key", "homepage_chat_agent_settings")
          .maybeSingle();

        if (error) throw error;

        const resolved = normalizeSettings(data?.value);
        setSettings(resolved);
        setMessages([
          {
            id: createMessageId(),
            role: "assistant",
            text: resolved.welcome_message,
          },
        ]);
      } catch (error) {
        const ref = reportError(error, "homepage.chat_agent.fetch_settings");
        setSettings(defaultSettings);
        setMessages([
          {
            id: createMessageId(),
            role: "assistant",
            text: appendErrorReference(defaultSettings.welcome_message, ref),
          },
        ]);
      } finally {
        setIsLoaded(true);
      }
    };

    void fetchSettings();
  }, []);

  useEffect(() => {
    if (!isLoaded || !isVisible || didAutoOpen.current) return;
    if (settings.auto_open_seconds <= 0) return;
    if (typeof window !== "undefined" && window.localStorage.getItem(STORAGE_KEY) === "1") return;

    didAutoOpen.current = true;
    const timer = window.setTimeout(() => setIsOpen(true), settings.auto_open_seconds * 1000);
    return () => window.clearTimeout(timer);
  }, [isLoaded, isVisible, settings.auto_open_seconds]);

  useEffect(() => {
    if (isOpen && typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, "1");
    }
  }, [isOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const openFromExternalLauncher = () => setIsOpen(true);
    window.addEventListener("homepage-chat-agent:open", openFromExternalLauncher as EventListener);
    return () => {
      window.removeEventListener("homepage-chat-agent:open", openFromExternalLauncher as EventListener);
    };
  }, []);

  const handleWhatsappFallback = () => {
    const phone = settings.whatsapp_number.replace(/\D/g, "");
    if (!phone) return;
    const text = encodeURIComponent(settings.whatsapp_message || defaultSettings.whatsapp_message);
    window.open(`https://wa.me/${phone}?text=${text}`, "_blank", "noopener,noreferrer");
  };

  if (!isLoaded || !isVisible) return null;

  const onRight = settings.position === "bottom-right";
  const containerStyle = onRight ? { right: "1rem" } : { left: "1rem" };
  const panelAlignClass = onRight ? "items-end" : "items-start";
  const panelClass = onRight ? "origin-bottom-right" : "origin-bottom-left";
  const bottomOffset = "calc(env(safe-area-inset-bottom) + 1rem)";

  return (
    <div className="fixed z-50 flex flex-col" style={{ ...containerStyle, bottom: bottomOffset }}>
      {isOpen && (
        <div className={`mb-3 flex ${panelAlignClass}`}>
          <div className={`w-[22rem] max-w-[calc(100vw-1.5rem)] rounded-xl border bg-card shadow-xl ${panelClass}`}>
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Bot className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold leading-none">{settings.bot_name}</p>
                  <p className="text-xs text-muted-foreground">{settings.bot_subtitle}</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setIsOpen(false)}
                aria-label="Tutup chat agent"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="max-h-[26rem] space-y-3 overflow-y-auto px-4 py-3">
              {settings.quick_prompts.length > 0 && messages.length <= 1 && (
                <div className="flex flex-wrap gap-2">
                  {settings.quick_prompts.slice(0, 6).map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => setInput(prompt)}
                      className="rounded-full border px-3 py-1 text-xs text-muted-foreground hover:bg-muted"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              )}

              {messages.map((message) => (
                <div key={message.id} className={`flex ${message.role === "assistant" ? "justify-start" : "justify-end"}`}>
                  <div
                    className={`max-w-[90%] rounded-lg px-3 py-2 text-sm whitespace-pre-line ${
                      message.role === "assistant"
                        ? "bg-muted text-foreground"
                        : "bg-primary text-primary-foreground"
                    }`}
                  >
                    {message.text}
                    {message.role === "assistant" && message.engine && (
                      <p className="mt-2 text-[11px] opacity-70">
                        Mode Jawaban: {message.engine === "gemini" ? "Gemini" : "Fallback Lokal"}
                      </p>
                    )}
                    {settings.show_sources && message.role === "assistant" && message.sources && message.sources.length > 0 && (
                      <p className="mt-1 text-[11px] opacity-70">Sumber: {Array.from(new Set(message.sources)).join(", ")}</p>
                    )}
                  </div>
                </div>
              ))}

              {isResponding && (
                <div className="text-xs text-muted-foreground">Sedang menyiapkan jawaban...</div>
              )}
            </div>

            <div className="space-y-3 border-t px-4 py-3">
              <div className="flex gap-2">
                <Input
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handleSubmit();
                    }
                  }}
                  placeholder={settings.input_placeholder}
                />
                <Button onClick={() => void handleSubmit()} disabled={!input.trim() || isResponding} aria-label="Kirim pesan">
                  <Send className="h-4 w-4" />
                </Button>
              </div>

              {settings.enable_whatsapp_fallback && settings.whatsapp_number.trim() && (
                <Button variant="outline" className="w-full" onClick={handleWhatsappFallback}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Lanjutkan via WhatsApp
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {!hideLauncher && (
        <Button
          onClick={() => setIsOpen((prev) => !prev)}
          className="h-14 w-14 rounded-full shadow-lg"
          aria-label={isOpen ? "Tutup chat" : "Buka chat"}
        >
          {isOpen ? <X className="h-6 w-6" /> : <MessageSquare className="h-6 w-6" />}
        </Button>
      )}
    </div>
  );
}
