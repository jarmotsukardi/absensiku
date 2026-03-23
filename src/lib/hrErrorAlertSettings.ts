import { supabase } from "@/integrations/supabase/client";

export const HR_ERROR_ALERT_SETTINGS_KEY = "hr_error_alert_settings_v1";

export interface HrErrorAlertSettings {
  enableRealtimeAlerts: boolean;
  webhookUrl: string;
  slackWebhookUrl: string;
  whatsappWebhookUrl: string;
  emailWebhookUrl: string;
}

export const DEFAULT_HR_ERROR_ALERT_SETTINGS: HrErrorAlertSettings = {
  enableRealtimeAlerts: false,
  webhookUrl: "",
  slackWebhookUrl: "",
  whatsappWebhookUrl: "",
  emailWebhookUrl: "",
};

const normalize = (value: unknown): HrErrorAlertSettings => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return DEFAULT_HR_ERROR_ALERT_SETTINGS;
  }

  const raw = value as Record<string, unknown>;
  return {
    enableRealtimeAlerts: Boolean(raw.enable_realtime_alerts),
    webhookUrl: typeof raw.webhook_url === "string" ? raw.webhook_url.trim() : "",
    slackWebhookUrl: typeof raw.slack_webhook_url === "string" ? raw.slack_webhook_url.trim() : "",
    whatsappWebhookUrl: typeof raw.whatsapp_webhook_url === "string" ? raw.whatsapp_webhook_url.trim() : "",
    emailWebhookUrl: typeof raw.email_webhook_url === "string" ? raw.email_webhook_url.trim() : "",
  };
};

const serialize = (value: HrErrorAlertSettings) => ({
  enable_realtime_alerts: value.enableRealtimeAlerts,
  webhook_url: value.webhookUrl.trim(),
  slack_webhook_url: value.slackWebhookUrl.trim(),
  whatsapp_webhook_url: value.whatsappWebhookUrl.trim(),
  email_webhook_url: value.emailWebhookUrl.trim(),
});

export async function fetchTenantHrErrorAlertSettings(tenantId: string): Promise<HrErrorAlertSettings> {
  const { data, error } = await supabase
    .from("organization_settings")
    .select("setting_value")
    .eq("tenant_id", tenantId)
    .eq("setting_key", HR_ERROR_ALERT_SETTINGS_KEY)
    .maybeSingle();

  if (error && error.code !== "PGRST116") throw error;
  return normalize(data?.setting_value);
}

export async function saveTenantHrErrorAlertSettings(
  tenantId: string,
  settings: HrErrorAlertSettings,
): Promise<void> {
  const { data: existing, error: existingError } = await supabase
    .from("organization_settings")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("setting_key", HR_ERROR_ALERT_SETTINGS_KEY)
    .maybeSingle();

  if (existingError && existingError.code !== "PGRST116") throw existingError;

  if (existing?.id) {
    const { error: updateError } = await supabase
      .from("organization_settings")
      .update({
        setting_value: serialize(settings),
        description: "Pengaturan alert realtime log error kritis HR.",
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (updateError) throw updateError;
    return;
  }

  const { error: insertError } = await supabase.from("organization_settings").insert({
    tenant_id: tenantId,
    setting_key: HR_ERROR_ALERT_SETTINGS_KEY,
    setting_value: serialize(settings),
    description: "Pengaturan alert realtime log error kritis HR.",
  });
  if (insertError) throw insertError;
}
