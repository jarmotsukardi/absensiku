import { supabase } from "@/integrations/supabase/client";
import {
  ABSENCE_LIMIT_TEMPLATE_SETTING_KEY,
  normalizeAbsenceLimitTemplate,
} from "@/lib/absenceLimitTemplates";

export const ORG_ONBOARDING_TEMPLATE_SETTING_KEY = "org_onboarding_template_v1";

export interface OrgTemplateOpdItem {
  name: string;
  code: string;
  is_active: boolean;
}

export interface OrgTemplateWorkUnitItem {
  name: string;
  code: string;
  opd_code?: string | null;
  institution_type: string;
  is_active: boolean;
}

export interface OrgTemplatePositionItem {
  name: string;
  is_active: boolean;
}

export interface OrgTemplateOfficeItem {
  name: string;
  address: string;
  opd_code?: string | null;
  latitude: number;
  longitude: number;
  radius_meters: number;
  work_start_time: string;
  work_end_time: string;
  late_tolerance_minutes: number;
  is_active: boolean;
}

export interface OrgTemplateScheduleDefaults {
  institution_type: string;
  active_days: number[];
  time_in: string;
  time_out: string;
  late_tolerance_minutes: number;
  is_active: boolean;
}

export interface OrgTemplateAnnouncementItem {
  title: string;
  content: string;
  is_published: boolean;
  is_pinned: boolean;
}

export interface OrgTemplateFeatureFlags {
  allow_wfh: boolean;
  wfh_requires_approval: boolean;
  absence_limit_notifications_enabled: boolean;
  auto_apply_absence_limits: boolean;
  seed_sample_announcements: boolean;
}

export interface OrgOnboardingTemplate {
  version: number;
  label: string;
  description: string;
  opd_defaults: OrgTemplateOpdItem[];
  work_unit_defaults: OrgTemplateWorkUnitItem[];
  position_defaults: OrgTemplatePositionItem[];
  office_defaults: OrgTemplateOfficeItem[];
  schedule_defaults: OrgTemplateScheduleDefaults;
  announcement_defaults: OrgTemplateAnnouncementItem[];
  feature_flags: OrgTemplateFeatureFlags;
}

export interface OrgOnboardingCounts {
  opd: number;
  work_units: number;
  positions: number;
  offices: number;
  work_hours: number;
  absence_limits: number;
  announcements: number;
}

export interface OrgOnboardingModuleReport {
  module: string;
  inserted: number;
  skipped: boolean;
  note: string;
}

export interface OrgOnboardingApplyResult {
  reports: OrgOnboardingModuleReport[];
  counts_before: OrgOnboardingCounts;
  counts_after: OrgOnboardingCounts;
}

export const DEFAULT_ORG_ONBOARDING_TEMPLATE: OrgOnboardingTemplate = {
  version: 1,
  label: "Template Setup Awal Organisasi",
  description:
    "Template default untuk membantu member/tenant baru menyelesaikan setup master data, jadwal kerja, dan notifikasi awal.",
  opd_defaults: [
    {
      name: "Sekretariat Umum",
      code: "SEKRETARIAT",
      is_active: true,
    },
  ],
  work_unit_defaults: [
    {
      name: "Administrasi Umum",
      code: "ADM-UMUM",
      opd_code: "SEKRETARIAT",
      institution_type: "pemerintahan",
      is_active: true,
    },
  ],
  position_defaults: [
    {
      name: "Staf",
      is_active: true,
    },
    {
      name: "Operator Absensi",
      is_active: true,
    },
    {
      name: "Supervisor",
      is_active: true,
    },
  ],
  office_defaults: [
    {
      name: "Kantor Pusat Organisasi",
      address: "Lengkapi alamat kantor utama organisasi Anda",
      opd_code: "SEKRETARIAT",
      latitude: -3.69543,
      longitude: 128.1814,
      radius_meters: 100,
      work_start_time: "08:00:00",
      work_end_time: "16:30:00",
      late_tolerance_minutes: 0,
      is_active: true,
    },
  ],
  schedule_defaults: {
    institution_type: "pemerintahan",
    active_days: [1, 2, 3, 4, 5],
    time_in: "08:00:00",
    time_out: "16:30:00",
    late_tolerance_minutes: 0,
    is_active: true,
  },
  announcement_defaults: [
    {
      title: "Selamat Datang di Sistem Absensi Organisasi",
      content:
        "Setup awal berhasil. Silakan lengkapi master data OPD, satuan kerja, dan lokasi kerja sebelum aktivasi penuh pegawai.",
      is_published: true,
      is_pinned: true,
    },
    {
      title: "Langkah Wajib Setelah Onboarding",
      content:
        "Periksa jam kerja, batas absensi, dan kebijakan lembur/WFH agar seluruh modul operasional sesuai SOP instansi Anda.",
      is_published: true,
      is_pinned: false,
    },
    {
      title: "Panduan Aktivasi Pegawai",
      content:
        "Undang pegawai aktif dari menu Undangan Pegawai, lalu pastikan akun terhubung agar notifikasi dan approval flow berjalan normal.",
      is_published: true,
      is_pinned: false,
    },
  ],
  feature_flags: {
    allow_wfh: true,
    wfh_requires_approval: true,
    absence_limit_notifications_enabled: true,
    auto_apply_absence_limits: true,
    seed_sample_announcements: true,
  },
};

interface OrgTemplateSettingRow {
  value: unknown;
  updated_at?: string | null;
}

const toBoolean = (value: unknown, fallback: boolean): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return fallback;
};

const toNumber = (value: unknown, fallback: number): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

const toStringValue = (value: unknown, fallback: string): string => {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
};

const normalizeCode = (value: string | null | undefined): string => (value || "").trim().toUpperCase();

const dedupeByKey = <T,>(items: T[], keyFn: (item: T) => string): T[] => {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
};

const normalizeTimeOrFallback = (value: unknown, fallback: string): string => {
  const raw = toStringValue(value, fallback).trim();
  if (!raw) return fallback;
  // Accept HH:mm or HH:mm:ss. Normalize to HH:mm:ss.
  if (/^\d{2}:\d{2}$/.test(raw)) return `${raw}:00`;
  if (/^\d{2}:\d{2}:\d{2}$/.test(raw)) return raw;
  return fallback;
};

export const normalizeOrgOnboardingTemplate = (value: unknown): OrgOnboardingTemplate => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return DEFAULT_ORG_ONBOARDING_TEMPLATE;
  }

  const raw = value as Record<string, unknown>;
  const defaults = DEFAULT_ORG_ONBOARDING_TEMPLATE;

  const opdDefaults = Array.isArray(raw.opd_defaults)
    ? dedupeByKey(
        raw.opd_defaults
          .map((item) => {
            if (!item || typeof item !== "object" || Array.isArray(item)) return null;
            const row = item as Record<string, unknown>;
            const name = toStringValue(row.name, "").trim();
            const code = normalizeCode(toStringValue(row.code, ""));
            if (!name || !code) return null;
            return {
              name,
              code,
              is_active: toBoolean(row.is_active, true),
            } satisfies OrgTemplateOpdItem;
          })
          .filter((item): item is OrgTemplateOpdItem => Boolean(item)),
        (item) => normalizeCode(item.code)
      )
    : defaults.opd_defaults;

  const workUnitDefaults = Array.isArray(raw.work_unit_defaults)
    ? dedupeByKey(
        raw.work_unit_defaults
          .map((item) => {
            if (!item || typeof item !== "object" || Array.isArray(item)) return null;
            const row = item as Record<string, unknown>;
            const name = toStringValue(row.name, "").trim();
            const code = normalizeCode(toStringValue(row.code, ""));
            if (!name || !code) return null;
            return {
              name,
              code,
              opd_code: normalizeCode(toStringValue(row.opd_code, "")) || null,
              institution_type: toStringValue(row.institution_type, "pemerintahan"),
              is_active: toBoolean(row.is_active, true),
            } satisfies OrgTemplateWorkUnitItem;
          })
          .filter((item): item is OrgTemplateWorkUnitItem => Boolean(item)),
        (item) => normalizeCode(item.code)
      )
    : defaults.work_unit_defaults;

  const positionDefaults = Array.isArray(raw.position_defaults)
    ? dedupeByKey(
        raw.position_defaults
          .map((item) => {
            if (!item || typeof item !== "object" || Array.isArray(item)) return null;
            const row = item as Record<string, unknown>;
            const name = toStringValue(row.name, "").trim();
            if (!name) return null;
            return {
              name,
              is_active: toBoolean(row.is_active, true),
            } satisfies OrgTemplatePositionItem;
          })
          .filter((item): item is OrgTemplatePositionItem => Boolean(item)),
        (item) => item.name.toLowerCase()
      )
    : defaults.position_defaults;

  const officeDefaults = Array.isArray(raw.office_defaults)
    ? dedupeByKey(
        raw.office_defaults
          .map((item) => {
            if (!item || typeof item !== "object" || Array.isArray(item)) return null;
            const row = item as Record<string, unknown>;
            const name = toStringValue(row.name, "").trim();
            if (!name) return null;
            return {
              name,
              address: toStringValue(row.address, "").trim(),
              opd_code: normalizeCode(toStringValue(row.opd_code, "")) || null,
              latitude: toNumber(row.latitude, 0),
              longitude: toNumber(row.longitude, 0),
              radius_meters: Math.max(10, Math.floor(toNumber(row.radius_meters, 100))),
              work_start_time: normalizeTimeOrFallback(row.work_start_time, "08:00:00"),
              work_end_time: normalizeTimeOrFallback(row.work_end_time, "16:30:00"),
              late_tolerance_minutes: Math.max(0, Math.floor(toNumber(row.late_tolerance_minutes, 0))),
              is_active: toBoolean(row.is_active, true),
            } satisfies OrgTemplateOfficeItem;
          })
          .filter((item): item is OrgTemplateOfficeItem => Boolean(item)),
        (item) => item.name.toLowerCase()
      )
    : defaults.office_defaults;

  const scheduleRaw =
    raw.schedule_defaults && typeof raw.schedule_defaults === "object" && !Array.isArray(raw.schedule_defaults)
      ? (raw.schedule_defaults as Record<string, unknown>)
      : {};
  const scheduleDefaults: OrgTemplateScheduleDefaults = {
    institution_type: toStringValue(scheduleRaw.institution_type, defaults.schedule_defaults.institution_type),
    active_days: Array.isArray(scheduleRaw.active_days)
      ? dedupeByKey(
          scheduleRaw.active_days
            .map((day) => Math.max(1, Math.min(7, Math.floor(toNumber(day, 0)))))
            .filter((day) => day >= 1 && day <= 7),
          (day) => String(day)
        )
      : defaults.schedule_defaults.active_days,
    time_in: normalizeTimeOrFallback(scheduleRaw.time_in, defaults.schedule_defaults.time_in),
    time_out: normalizeTimeOrFallback(scheduleRaw.time_out, defaults.schedule_defaults.time_out),
    late_tolerance_minutes: Math.max(
      0,
      Math.floor(toNumber(scheduleRaw.late_tolerance_minutes, defaults.schedule_defaults.late_tolerance_minutes))
    ),
    is_active: toBoolean(scheduleRaw.is_active, defaults.schedule_defaults.is_active),
  };
  if (scheduleDefaults.active_days.length === 0) {
    scheduleDefaults.active_days = [...defaults.schedule_defaults.active_days];
  }

  const announcementDefaults = Array.isArray(raw.announcement_defaults)
    ? raw.announcement_defaults
        .map((item) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) return null;
          const row = item as Record<string, unknown>;
          const title = toStringValue(row.title, "").trim();
          const content = toStringValue(row.content, "").trim();
          if (!title || !content) return null;
          return {
            title,
            content,
            is_published: toBoolean(row.is_published, true),
            is_pinned: toBoolean(row.is_pinned, false),
          } satisfies OrgTemplateAnnouncementItem;
        })
        .filter((item): item is OrgTemplateAnnouncementItem => Boolean(item))
    : defaults.announcement_defaults;

  const featureRaw =
    raw.feature_flags && typeof raw.feature_flags === "object" && !Array.isArray(raw.feature_flags)
      ? (raw.feature_flags as Record<string, unknown>)
      : {};
  const featureFlags: OrgTemplateFeatureFlags = {
    allow_wfh: toBoolean(featureRaw.allow_wfh, defaults.feature_flags.allow_wfh),
    wfh_requires_approval: toBoolean(
      featureRaw.wfh_requires_approval,
      defaults.feature_flags.wfh_requires_approval
    ),
    absence_limit_notifications_enabled: toBoolean(
      featureRaw.absence_limit_notifications_enabled,
      defaults.feature_flags.absence_limit_notifications_enabled
    ),
    auto_apply_absence_limits: toBoolean(
      featureRaw.auto_apply_absence_limits,
      defaults.feature_flags.auto_apply_absence_limits
    ),
    seed_sample_announcements: toBoolean(
      featureRaw.seed_sample_announcements,
      defaults.feature_flags.seed_sample_announcements
    ),
  };

  return {
    version: Math.max(1, Math.floor(toNumber(raw.version, defaults.version))),
    label: toStringValue(raw.label, defaults.label),
    description: toStringValue(raw.description, defaults.description),
    opd_defaults: opdDefaults.length > 0 ? opdDefaults : defaults.opd_defaults,
    work_unit_defaults: workUnitDefaults.length > 0 ? workUnitDefaults : defaults.work_unit_defaults,
    position_defaults: positionDefaults.length > 0 ? positionDefaults : defaults.position_defaults,
    office_defaults: officeDefaults.length > 0 ? officeDefaults : defaults.office_defaults,
    schedule_defaults: scheduleDefaults,
    announcement_defaults: announcementDefaults.length > 0 ? announcementDefaults : defaults.announcement_defaults,
    feature_flags: featureFlags,
  };
};

export async function loadOrgOnboardingTemplate(): Promise<{
  template: OrgOnboardingTemplate;
  updatedAt: string | null;
}> {
  const { data, error } = await supabase
    .from("system_settings")
    .select("value, updated_at")
    .eq("key", ORG_ONBOARDING_TEMPLATE_SETTING_KEY)
    .maybeSingle<OrgTemplateSettingRow>();
  if (error) throw error;

  return {
    template: normalizeOrgOnboardingTemplate(data?.value),
    updatedAt: data?.updated_at || null,
  };
}

export async function saveOrgOnboardingTemplate(template: OrgOnboardingTemplate): Promise<void> {
  const normalized = normalizeOrgOnboardingTemplate(template);
  const { error } = await supabase.from("system_settings").upsert(
    {
      key: ORG_ONBOARDING_TEMPLATE_SETTING_KEY,
      value: normalized,
      description:
        "Template setup awal tenant/member baru: master data, jadwal kerja, notifikasi, dan konten onboarding.",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  );
  if (error) throw error;
}

const fetchCountValue = async (promise: Promise<{ count: number | null; error: { message: string } | null }>) => {
  const { count, error } = await promise;
  if (error) throw error;
  return count || 0;
};

export async function fetchOrgOnboardingCounts(tenantId: string): Promise<OrgOnboardingCounts> {
  const [opd, workUnits, positions, offices, workHours, absenceLimits, announcements] = await Promise.all([
    fetchCountValue(supabase.from("opd").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId)),
    fetchCountValue(supabase.from("work_units").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId)),
    fetchCountValue(supabase.from("positions").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId)),
    fetchCountValue(supabase.from("offices").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId)),
    fetchCountValue(supabase.from("work_hours").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId)),
    fetchCountValue(
      supabase.from("absence_limits").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId)
    ),
    fetchCountValue(
      supabase.from("announcements").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId)
    ),
  ]);

  return {
    opd,
    work_units: workUnits,
    positions,
    offices,
    work_hours: workHours,
    absence_limits: absenceLimits,
    announcements,
  };
}

interface UpsertOrgSettingPayload {
  tenantId: string;
  settingKey: string;
  settingValue: unknown;
  description: string;
}

const insertSettingIfMissing = async ({
  tenantId,
  settingKey,
  settingValue,
  description,
}: UpsertOrgSettingPayload): Promise<boolean> => {
  const { data, error } = await supabase
    .from("organization_settings")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("setting_key", settingKey)
    .maybeSingle();
  if (error && error.code !== "PGRST116") throw error;
  if (data?.id) return false;

  const { error: insertError } = await supabase.from("organization_settings").insert({
    tenant_id: tenantId,
    setting_key: settingKey,
    setting_value: settingValue,
    description,
  });
  if (insertError) throw insertError;
  return true;
};

const loadOpdMap = async (tenantId: string) => {
  const { data, error } = await supabase.from("opd").select("id, code, name").eq("tenant_id", tenantId);
  if (error) throw error;
  const map = new Map<string, string>();
  (data || []).forEach((row) => {
    if (row.code) map.set(normalizeCode(row.code), row.id);
    if (row.name) map.set(`name:${row.name.trim().toLowerCase()}`, row.id);
  });
  return map;
};

const loadWorkUnitMap = async (tenantId: string) => {
  const { data, error } = await supabase.from("work_units").select("id, code, name").eq("tenant_id", tenantId);
  if (error) throw error;
  const map = new Map<string, string>();
  (data || []).forEach((row) => {
    if (row.code) map.set(normalizeCode(row.code), row.id);
    if (row.name) map.set(`name:${row.name.trim().toLowerCase()}`, row.id);
  });
  return map;
};

export async function applyOrgOnboardingTemplateToTenant(
  tenantId: string,
  options?: {
    template?: OrgOnboardingTemplate;
  }
): Promise<OrgOnboardingApplyResult> {
  const template = options?.template || (await loadOrgOnboardingTemplate()).template;
  const reports: OrgOnboardingModuleReport[] = [];
  const countsBefore = await fetchOrgOnboardingCounts(tenantId);

  if (countsBefore.opd === 0) {
    const payload = template.opd_defaults.map((item) => ({
      tenant_id: tenantId,
      name: item.name,
      code: normalizeCode(item.code),
      is_active: item.is_active,
    }));
    const { data, error } = await supabase.from("opd").insert(payload).select("id");
    if (error) throw error;
    reports.push({
      module: "OPD",
      inserted: data?.length || payload.length,
      skipped: false,
      note: "OPD template ditambahkan.",
    });
  } else {
    reports.push({
      module: "OPD",
      inserted: 0,
      skipped: true,
      note: "Data OPD sudah ada, template tidak menimpa data.",
    });
  }

  const opdMap = await loadOpdMap(tenantId);
  const firstOpdId = Array.from(opdMap.values())[0] || null;

  if (countsBefore.work_units === 0) {
    const payload = template.work_unit_defaults.map((item) => ({
      tenant_id: tenantId,
      name: item.name,
      code: item.code,
      opd_id: (item.opd_code && opdMap.get(normalizeCode(item.opd_code))) || firstOpdId,
      institution_type: item.institution_type,
      is_active: item.is_active,
    }));
    const { data, error } = await supabase.from("work_units").insert(payload).select("id");
    if (error) throw error;
    reports.push({
      module: "Satuan Kerja",
      inserted: data?.length || payload.length,
      skipped: false,
      note: "Template satuan kerja ditambahkan.",
    });
  } else {
    reports.push({
      module: "Satuan Kerja",
      inserted: 0,
      skipped: true,
      note: "Data satuan kerja sudah ada, template tidak menimpa data.",
    });
  }

  if (countsBefore.offices === 0) {
    const payload = template.office_defaults.map((item) => ({
      tenant_id: tenantId,
      name: item.name,
      address: item.address || null,
      opd_id: (item.opd_code && opdMap.get(normalizeCode(item.opd_code))) || firstOpdId,
      latitude: item.latitude,
      longitude: item.longitude,
      radius_meters: item.radius_meters,
      work_start_time: item.work_start_time,
      work_end_time: item.work_end_time,
      late_tolerance_minutes: item.late_tolerance_minutes,
      is_active: item.is_active,
    }));
    const { data, error } = await supabase.from("offices").insert(payload).select("id");
    if (error) throw error;
    reports.push({
      module: "Lokasi Kerja",
      inserted: data?.length || payload.length,
      skipped: false,
      note: "Template lokasi kerja ditambahkan.",
    });
  } else {
    reports.push({
      module: "Lokasi Kerja",
      inserted: 0,
      skipped: true,
      note: "Data lokasi kerja sudah ada, template tidak menimpa data.",
    });
  }

  if (countsBefore.work_hours === 0) {
    const payload = template.schedule_defaults.active_days.map((day) => ({
      tenant_id: tenantId,
      day_of_week: day,
      institution_type: template.schedule_defaults.institution_type,
      time_in: template.schedule_defaults.time_in,
      time_out: template.schedule_defaults.time_out,
      late_tolerance_minutes: template.schedule_defaults.late_tolerance_minutes,
      is_active: template.schedule_defaults.is_active,
    }));
    const { data, error } = await supabase.from("work_hours").insert(payload).select("id");
    if (error) throw error;
    reports.push({
      module: "Jam Kerja",
      inserted: data?.length || payload.length,
      skipped: false,
      note: "Template jam kerja ditambahkan.",
    });
  } else {
    reports.push({
      module: "Jam Kerja",
      inserted: 0,
      skipped: true,
      note: "Data jam kerja sudah ada, template tidak menimpa data.",
    });
  }

  if (template.feature_flags.auto_apply_absence_limits && countsBefore.absence_limits === 0) {
    const { data: absenceTemplateSetting, error: absenceTemplateError } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", ABSENCE_LIMIT_TEMPLATE_SETTING_KEY)
      .maybeSingle();
    if (absenceTemplateError) throw absenceTemplateError;

    const absenceTemplateRules = normalizeAbsenceLimitTemplate(absenceTemplateSetting?.value);
    const payload = absenceTemplateRules.map((rule) => ({
      tenant_id: tenantId,
      max_days: rule.max_days,
      warning_type: rule.warning_type,
      description: rule.description || null,
      is_active: rule.is_active,
    }));
    if (payload.length > 0) {
      const { data, error } = await supabase.from("absence_limits").insert(payload).select("id");
      if (error) throw error;
      reports.push({
        module: "Batas Absen",
        inserted: data?.length || payload.length,
        skipped: false,
        note: "Template batas absen diterapkan.",
      });
    } else {
      reports.push({
        module: "Batas Absen",
        inserted: 0,
        skipped: true,
        note: "Template batas absen admin kosong.",
      });
    }
  } else {
    reports.push({
      module: "Batas Absen",
      inserted: 0,
      skipped: true,
      note: template.feature_flags.auto_apply_absence_limits
        ? "Data batas absen sudah ada, template tidak menimpa data."
        : "Auto apply batas absen dinonaktifkan pada template.",
    });
  }

  const insertedSettings = [
    await insertSettingIfMissing({
      tenantId,
      settingKey: "allow_wfh",
      settingValue: template.feature_flags.allow_wfh,
      description: "Template onboarding: aktif/nonaktifkan fitur WFH.",
    }),
    await insertSettingIfMissing({
      tenantId,
      settingKey: "wfh_requires_approval",
      settingValue: template.feature_flags.wfh_requires_approval,
      description: "Template onboarding: apakah WFH wajib approval.",
    }),
    await insertSettingIfMissing({
      tenantId,
      settingKey: "absence_limit_notifications_enabled",
      settingValue: template.feature_flags.absence_limit_notifications_enabled,
      description: "Template onboarding: notifikasi batas absen ke pegawai.",
    }),
  ].filter(Boolean).length;

  reports.push({
    module: "Pengaturan Fitur",
    inserted: insertedSettings,
    skipped: insertedSettings === 0,
    note:
      insertedSettings > 0
        ? "Setting default fitur onboarding berhasil ditambahkan."
        : "Setting fitur sudah ada sebelumnya.",
  });

  const countsAfter = await fetchOrgOnboardingCounts(tenantId);
  return {
    reports,
    counts_before: countsBefore,
    counts_after: countsAfter,
  };
}
