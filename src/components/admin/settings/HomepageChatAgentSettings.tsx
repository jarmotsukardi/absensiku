import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquare, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { withTimeout } from "@/lib/attendanceResilience";

type ChatAnswerMode = "local" | "gemini_hybrid" | "gemini";

interface HomepageChatAgentSettingValue {
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
  answer_mode: ChatAnswerMode;
  gemini_model: string;
  enable_whatsapp_fallback: boolean;
  whatsapp_number: string;
  whatsapp_message: string;
}

interface GeminiKeyStatusResponse {
  configured?: boolean;
  last4?: string | null;
  updated_at?: string | null;
}

interface GeminiKeyStatus {
  configured: boolean;
  last4: string | null;
  updatedAt: string | null;
}

const settingKey = "homepage_chat_agent_settings";
const DEFAULT_GEMINI_MODEL = "gemini-2.0-flash";
const looksLikeGeminiApiKey = (value: string) => /^AIza[0-9A-Za-z_-]{20,}$/.test(value.trim());
const normalizeGeminiModel = (value: unknown) => {
  if (typeof value !== "string") return DEFAULT_GEMINI_MODEL;
  const trimmed = value.trim();
  if (!trimmed || looksLikeGeminiApiKey(trimmed)) return DEFAULT_GEMINI_MODEL;
  return trimmed;
};

const defaultSetting: HomepageChatAgentSettingValue = {
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

const defaultGeminiKeyStatus: GeminiKeyStatus = {
  configured: false,
  last4: null,
  updatedAt: null,
};

const normalizeSetting = (value: unknown): HomepageChatAgentSettingValue => {
  if (!value || typeof value !== "object") return defaultSetting;
  const raw = value as Record<string, unknown>;
  const maxHistoryCandidate = Number(raw.max_history);
  const autoOpenCandidate = Number(raw.auto_open_seconds);
  const answerMode: ChatAnswerMode =
    raw.answer_mode === "gemini_hybrid" || raw.answer_mode === "gemini"
      ? raw.answer_mode
      : defaultSetting.answer_mode;

  const allowedPaths = Array.isArray(raw.allowed_paths)
    ? raw.allowed_paths.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
    : defaultSetting.allowed_paths;

  const quickPrompts = Array.isArray(raw.quick_prompts)
    ? raw.quick_prompts.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
    : defaultSetting.quick_prompts;

  return {
    enabled: raw.enabled === true,
    bot_name: typeof raw.bot_name === "string" && raw.bot_name.trim() ? raw.bot_name.trim() : defaultSetting.bot_name,
    bot_subtitle:
      typeof raw.bot_subtitle === "string" && raw.bot_subtitle.trim()
        ? raw.bot_subtitle.trim()
        : defaultSetting.bot_subtitle,
    welcome_message:
      typeof raw.welcome_message === "string" && raw.welcome_message.trim()
        ? raw.welcome_message.trim()
        : defaultSetting.welcome_message,
    input_placeholder:
      typeof raw.input_placeholder === "string" && raw.input_placeholder.trim()
        ? raw.input_placeholder.trim()
        : defaultSetting.input_placeholder,
    position: raw.position === "bottom-right" ? "bottom-right" : "bottom-left",
    show_on_mobile: raw.show_on_mobile !== false,
    show_on_desktop: raw.show_on_desktop !== false,
    allowed_paths: allowedPaths.length > 0 ? allowedPaths : defaultSetting.allowed_paths,
    quick_prompts: quickPrompts.length > 0 ? quickPrompts : defaultSetting.quick_prompts,
    max_history:
      Number.isFinite(maxHistoryCandidate) && maxHistoryCandidate > 0
        ? Math.min(30, Math.floor(maxHistoryCandidate))
        : defaultSetting.max_history,
    show_sources: raw.show_sources !== false,
    auto_open_seconds:
      Number.isFinite(autoOpenCandidate) && autoOpenCandidate >= 0
        ? Math.min(30, Math.floor(autoOpenCandidate))
        : defaultSetting.auto_open_seconds,
    answer_mode: answerMode,
    gemini_model: normalizeGeminiModel(raw.gemini_model),
    enable_whatsapp_fallback: raw.enable_whatsapp_fallback === true,
    whatsapp_number: typeof raw.whatsapp_number === "string" ? raw.whatsapp_number.trim() : defaultSetting.whatsapp_number,
    whatsapp_message:
      typeof raw.whatsapp_message === "string" && raw.whatsapp_message.trim()
        ? raw.whatsapp_message.trim()
        : defaultSetting.whatsapp_message,
  };
};

export function HomepageChatAgentSettings() {
  const [isFetching, setIsFetching] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingGeminiKey, setIsSavingGeminiKey] = useState(false);
  const [setting, setSetting] = useState<HomepageChatAgentSettingValue>(defaultSetting);
  const [geminiApiKeyInput, setGeminiApiKeyInput] = useState("");
  const [geminiKeyStatus, setGeminiKeyStatus] = useState<GeminiKeyStatus>(defaultGeminiKeyStatus);

  const fetchGeminiKeyStatus = useCallback(async () => {
    try {
      const { data, error } = await withTimeout(
        () => supabase.rpc("get_homepage_chat_agent_gemini_key_status"),
        10000,
        "Load gemini key status timeout"
      );
      if (error) throw error;

      const raw = (data as GeminiKeyStatusResponse | null) || {};
      setGeminiKeyStatus({
        configured: raw.configured === true,
        last4: typeof raw.last4 === "string" ? raw.last4 : null,
        updatedAt: typeof raw.updated_at === "string" ? raw.updated_at : null,
      });
    } catch (error) {
      reportError(error, "admin.homepage_layout.chat_agent.fetch_gemini_key_status");
      setGeminiKeyStatus(defaultGeminiKeyStatus);
    }
  }, []);

  const fetchSetting = useCallback(async () => {
    try {
      const { data, error } = await withTimeout(
        () =>
          supabase
            .from("system_settings")
            .select("value")
            .eq("key", settingKey)
            .maybeSingle(),
        10000,
        "Load chat agent settings timeout"
      );

      if (error) throw error;
      setSetting(normalizeSetting(data?.value));
    } catch (error) {
      const ref = reportError(error, "admin.homepage_layout.chat_agent.fetch_settings");
      toast.error(appendErrorReference("Gagal memuat pengaturan chat agent.", ref));
      setSetting(defaultSetting);
    } finally {
      setIsFetching(false);
    }
  }, []);

  useEffect(() => {
    void fetchSetting();
    void fetchGeminiKeyStatus();
  }, [fetchGeminiKeyStatus, fetchSetting]);

  const handleSave = async () => {
    if (setting.answer_mode !== "local" && looksLikeGeminiApiKey(setting.gemini_model)) {
      toast.error("Field Model Gemini berisi format API key. Isi nama model (contoh: gemini-2.0-flash).");
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        key: settingKey,
        value: setting,
        description: "Pengaturan chat agent halaman utama",
        updated_at: new Date().toISOString(),
      };

      const { error } = await withTimeout(
        () =>
          supabase
            .from("system_settings")
            .upsert(payload, { onConflict: "key" }),
        10000,
        "Save chat agent settings timeout"
      );

      if (error) throw error;
      toast.success("Pengaturan chat agent berhasil disimpan.");
    } catch (error) {
      const ref = reportError(error, "admin.homepage_layout.chat_agent.save_settings", {
        enabled: setting.enabled,
      });
      toast.error(appendErrorReference("Gagal menyimpan pengaturan chat agent.", ref));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveGeminiApiKey = async () => {
    const nextKey = geminiApiKeyInput.trim();
    if (!nextKey) {
      toast.error("API key Gemini wajib diisi.");
      return;
    }

    setIsSavingGeminiKey(true);
    try {
      const { data, error } = await withTimeout(
        () =>
          supabase.rpc("set_homepage_chat_agent_gemini_api_key", {
            p_api_key: nextKey,
          }),
        10000,
        "Save gemini api key timeout"
      );

      if (error) throw error;

      const raw = (data as GeminiKeyStatusResponse | null) || {};
      const last4 = typeof raw.last4 === "string" ? raw.last4 : null;
      toast.success(last4 ? `API key Gemini berhasil diperbarui (...${last4}).` : "API key Gemini berhasil diperbarui.");
      setGeminiApiKeyInput("");
      await fetchGeminiKeyStatus();
    } catch (error) {
      const ref = reportError(error, "admin.homepage_layout.chat_agent.save_gemini_api_key");
      toast.error(appendErrorReference("Gagal menyimpan API key Gemini.", ref));
    } finally {
      setIsSavingGeminiKey(false);
    }
  };

  if (isFetching) {
    return (
      <div className="flex h-24 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  const geminiModelLooksLikeKey = looksLikeGeminiApiKey(setting.gemini_model);
  const geminiKeyUpdatedAtLabel = geminiKeyStatus.updatedAt
    ? new Date(geminiKeyStatus.updatedAt).toLocaleString("id-ID")
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" />
          Chat Agent Halaman Utama
        </h3>
        <p className="text-sm text-muted-foreground">
          Atur asisten chat publik agar pengunjung cepat menemukan informasi produk.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pengaturan Utama</CardTitle>
          <CardDescription>Kontrol visibilitas, konten awal, dan perilaku widget chat.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <Label className="font-medium">Aktifkan Chat Agent</Label>
              <p className="text-sm text-muted-foreground">Widget chat tampil di halaman publik sesuai path.</p>
            </div>
            <Switch
              checked={setting.enabled}
              onCheckedChange={(checked) => setSetting((prev) => ({ ...prev, enabled: checked }))}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Nama Bot</Label>
              <Input
                value={setting.bot_name}
                onChange={(event) => setSetting((prev) => ({ ...prev, bot_name: event.target.value }))}
                placeholder="AbsensiKu Assistant"
              />
            </div>
            <div className="space-y-2">
              <Label>Subjudul Bot</Label>
              <Input
                value={setting.bot_subtitle}
                onChange={(event) => setSetting((prev) => ({ ...prev, bot_subtitle: event.target.value }))}
                placeholder="Bantu info fitur, harga, dan FAQ"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Pesan Pembuka</Label>
            <Textarea
              value={setting.welcome_message}
              onChange={(event) => setSetting((prev) => ({ ...prev, welcome_message: event.target.value }))}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>Placeholder Input</Label>
            <Input
              value={setting.input_placeholder}
              onChange={(event) => setSetting((prev) => ({ ...prev, input_placeholder: event.target.value }))}
              placeholder="Tulis pertanyaan Anda..."
            />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Posisi Widget</Label>
              <Select
                value={setting.position}
                onValueChange={(value: "bottom-left" | "bottom-right") => setSetting((prev) => ({ ...prev, position: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bottom-left">Kiri bawah</SelectItem>
                  <SelectItem value="bottom-right">Kanan bawah</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Buka Otomatis (detik)</Label>
              <Input
                type="number"
                min={0}
                max={30}
                value={setting.auto_open_seconds}
                onChange={(event) =>
                  setSetting((prev) => ({
                    ...prev,
                    auto_open_seconds: Math.max(0, Math.min(30, Number(event.target.value) || 0)),
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Maks Riwayat Chat</Label>
              <Input
                type="number"
                min={4}
                max={30}
                value={setting.max_history}
                onChange={(event) =>
                  setSetting((prev) => ({
                    ...prev,
                    max_history: Math.max(4, Math.min(30, Number(event.target.value) || 4)),
                  }))
                }
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <Label className="font-medium">Tampilkan di Seluler</Label>
                <p className="text-xs text-muted-foreground">Browser ponsel/tablet</p>
              </div>
              <Switch
                checked={setting.show_on_mobile}
                onCheckedChange={(checked) => setSetting((prev) => ({ ...prev, show_on_mobile: checked }))}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <Label className="font-medium">Tampilkan di Desktop</Label>
                <p className="text-xs text-muted-foreground">Browser laptop/PC</p>
              </div>
              <Switch
                checked={setting.show_on_desktop}
                onCheckedChange={(checked) => setSetting((prev) => ({ ...prev, show_on_desktop: checked }))}
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <Label className="font-medium">Tampilkan Sumber Jawaban</Label>
              <p className="text-xs text-muted-foreground">Menampilkan referensi data (FAQ/fitur/harga) di balasan bot.</p>
            </div>
            <Switch
              checked={setting.show_sources}
              onCheckedChange={(checked) => setSetting((prev) => ({ ...prev, show_sources: checked }))}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Mode Jawaban</Label>
              <Select
                value={setting.answer_mode}
                onValueChange={(value: ChatAnswerMode) => setSetting((prev) => ({ ...prev, answer_mode: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="local">Lokal Saja</SelectItem>
                  <SelectItem value="gemini_hybrid">Gemini + Fallback Lokal</SelectItem>
                  <SelectItem value="gemini">Gemini Saja</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Rekomendasi: <code>Gemini + Fallback Lokal</code> agar tetap responsif saat API eksternal gagal.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Model Gemini</Label>
              <Input
                value={setting.gemini_model}
                onChange={(event) => setSetting((prev) => ({ ...prev, gemini_model: event.target.value }))}
                placeholder="gemini-2.0-flash"
                disabled={setting.answer_mode === "local"}
              />
              {geminiModelLooksLikeKey ? (
                <p className="text-xs text-destructive">
                  Ini terlihat seperti API key. Field ini hanya untuk nama model, misalnya <code>gemini-2.0-flash</code>.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Isi nama model Gemini, contoh <code>gemini-2.0-flash</code>.
                </p>
              )}
            </div>
          </div>

          <div className="space-y-3 rounded-lg border p-4">
            <div>
              <Label className="font-medium">API Key Gemini (Rahasia)</Label>
              <p className="text-xs text-muted-foreground">
                Masukkan API key baru untuk rotasi. Nilai tidak ditampilkan ulang dan disimpan terenkripsi di Vault.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
              <Input
                type="password"
                value={geminiApiKeyInput}
                onChange={(event) => setGeminiApiKeyInput(event.target.value)}
                placeholder="AIza..."
                autoComplete="off"
              />
              <Button
                type="button"
                onClick={() => void handleSaveGeminiApiKey()}
                disabled={isSavingGeminiKey || !geminiApiKeyInput.trim()}
              >
                {isSavingGeminiKey ? "Menyimpan Key..." : "Simpan API Key"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Status:{" "}
              {geminiKeyStatus.configured
                ? `Tersimpan${geminiKeyStatus.last4 ? ` (...${geminiKeyStatus.last4})` : ""}`
                : "Belum tersimpan"}
              {geminiKeyUpdatedAtLabel ? ` • Diperbarui: ${geminiKeyUpdatedAtLabel}` : ""}
            </p>
          </div>

          <div className="space-y-2">
            <Label>Path Halaman yang Diizinkan</Label>
            <Input
              value={setting.allowed_paths.join(", ")}
              onChange={(event) =>
                setSetting((prev) => ({
                  ...prev,
                  allowed_paths: event.target.value
                    .split(",")
                    .map((item) => item.trim())
                    .filter(Boolean),
                }))
              }
              placeholder="/, /about, /faq"
            />
            <p className="text-xs text-muted-foreground">Pisahkan dengan koma. Contoh: <code>/, /about, /faq</code></p>
          </div>

          <div className="space-y-2">
            <Label>Pertanyaan Cepat (Quick Prompts)</Label>
            <Textarea
              value={setting.quick_prompts.join("\n")}
              onChange={(event) =>
                setSetting((prev) => ({
                  ...prev,
                  quick_prompts: event.target.value
                    .split("\n")
                    .map((item) => item.trim())
                    .filter(Boolean),
                }))
              }
              rows={4}
            />
            <p className="text-xs text-muted-foreground">Satu baris satu pertanyaan.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fallback WhatsApp</CardTitle>
          <CardDescription>Opsional. Tampilkan tombol lanjut chat ke WhatsApp jika user butuh bantuan langsung.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <Label className="font-medium">Aktifkan Fallback WhatsApp</Label>
              <p className="text-xs text-muted-foreground">Tombol tampil di panel chat agent.</p>
            </div>
            <Switch
              checked={setting.enable_whatsapp_fallback}
              onCheckedChange={(checked) => setSetting((prev) => ({ ...prev, enable_whatsapp_fallback: checked }))}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Nomor WhatsApp (62xxxx)</Label>
              <Input
                value={setting.whatsapp_number}
                onChange={(event) => setSetting((prev) => ({ ...prev, whatsapp_number: event.target.value }))}
                placeholder="6281234567890"
              />
            </div>
            <div className="space-y-2">
              <Label>Pesan WhatsApp</Label>
              <Input
                value={setting.whatsapp_message}
                onChange={(event) => setSetting((prev) => ({ ...prev, whatsapp_message: event.target.value }))}
                placeholder="Halo, saya ingin konsultasi mengenai AbsensiKu."
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving}>
          <Save className="mr-2 h-4 w-4" />
          {isSaving ? "Menyimpan..." : "Simpan Pengaturan Chat Agent"}
        </Button>
      </div>
    </div>
  );
}
