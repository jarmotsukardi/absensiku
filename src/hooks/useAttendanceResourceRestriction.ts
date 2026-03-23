import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_TIMEZONE, getCurrentTimeInTimezone } from "@/lib/timezone";

type RestrictableEmployeeTab =
  | "requests"
  | "help"
  | "profile"
  | "news"
  | "articles"
  | "announcements"
  | "notifications"
  | "activation"
  | "billing";

interface OfficeScheduleFallback {
  work_start_time?: string | null;
  work_end_time?: string | null;
}

interface UseAttendanceResourceRestrictionOptions {
  tenantId?: string | null;
  tenantTimezone?: string | null;
  organizationType?: string | null;
  officeScheduleFallback?: OfficeScheduleFallback | null;
}

interface AttendanceResourceRestrictionState {
  isLoading: boolean;
  isEnabled: boolean;
  isRestrictedNow: boolean;
  timezone: string;
  bufferHours: number;
  restrictionReason: string | null;
  scheduleLabel: string | null;
  reopensAtLabel: string | null;
}

const DEFAULT_STATE: AttendanceResourceRestrictionState = {
  isLoading: false,
  isEnabled: false,
  isRestrictedNow: false,
  timezone: DEFAULT_TIMEZONE,
  bufferHours: 3,
  restrictionReason: null,
  scheduleLabel: null,
  reopensAtLabel: null,
};

const RESTRICTED_TABS = new Set<RestrictableEmployeeTab>([
  "requests",
  "help",
  "profile",
  "news",
  "articles",
  "announcements",
  "notifications",
  "activation",
  "billing",
]);

const parseBooleanSetting = (value: unknown): boolean => value === true || value === "true";

const parseBufferHours = (value: unknown): number => {
  const numeric = Number.parseInt(String(value ?? "3"), 10);
  if (!Number.isFinite(numeric) || numeric < 0) return 3;
  return Math.min(numeric, 12);
};

const parseTimeToMinutes = (value: string | null | undefined): number | null => {
  if (!value || typeof value !== "string") return null;
  const parts = value.split(":").map((part) => Number.parseInt(part, 10));
  if (parts.length < 2 || parts.some((part) => !Number.isFinite(part))) return null;
  return parts[0] * 60 + parts[1];
};

const formatMinutesLabel = (minutes: number, prefixBesok = false): string => {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const hour = String(Math.floor(normalized / 60)).padStart(2, "0");
  const minute = String(normalized % 60).padStart(2, "0");
  return `${prefixBesok ? "besok " : ""}${hour}:${minute}`;
};

const normalizeOrganizationType = (value?: string | null): string | null => {
  if (!value) return null;
  if (value === "pemerintah_daerah" || value === "instansi_pemerintah") {
    return "pemerintahan";
  }
  return value;
};

const resolveRestrictionWindow = (
  currentMinutes: number,
  startMinutes: number,
  endMinutes: number,
): { isRestricted: boolean; reopenMinutes: number; reopensNextDay: boolean } => {
  const effectiveEnd = endMinutes;
  const normalizedCurrent =
    effectiveEnd >= 1440 && currentMinutes < startMinutes ? currentMinutes + 1440 : currentMinutes;

  return {
    isRestricted: normalizedCurrent >= startMinutes && normalizedCurrent <= effectiveEnd,
    reopenMinutes: effectiveEnd,
    reopensNextDay: effectiveEnd >= 1440,
  };
};

export const isEmployeeNonAttendanceTab = (tab: string | null | undefined): tab is RestrictableEmployeeTab =>
  typeof tab === "string" && RESTRICTED_TABS.has(tab as RestrictableEmployeeTab);

export function useAttendanceResourceRestriction({
  tenantId,
  tenantTimezone,
  organizationType,
  officeScheduleFallback,
}: UseAttendanceResourceRestrictionOptions) {
  const [state, setState] = useState<AttendanceResourceRestrictionState>(DEFAULT_STATE);

  useEffect(() => {
    let isCancelled = false;

    const fetchRestriction = async () => {
      if (!tenantId) {
        if (!isCancelled) setState(DEFAULT_STATE);
        return;
      }

      if (!isCancelled) {
        setState((prev) => ({ ...prev, isLoading: true }));
      }

      try {
        const [settingsRes, tenantRes] = await Promise.all([
          supabase
            .from("system_settings")
            .select("key, value")
            .in("key", ["restrict_access_during_attendance", "access_restriction_buffer_hours"]),
          tenantTimezone && organizationType
            ? Promise.resolve({ data: null, error: null })
            : supabase
                .from("tenants")
                .select("timezone, organization_type")
                .eq("id", tenantId)
                .maybeSingle(),
        ]);

        if (settingsRes.error) throw settingsRes.error;
        if (tenantRes.error) throw tenantRes.error;

        const settingsMap = new Map(
          (settingsRes.data || []).map((row) => [row.key, row.value] as const),
        );

        const isEnabled = parseBooleanSetting(settingsMap.get("restrict_access_during_attendance"));
        const bufferHours = parseBufferHours(settingsMap.get("access_restriction_buffer_hours"));
        const resolvedTimezone = tenantTimezone || tenantRes.data?.timezone || DEFAULT_TIMEZONE;
        const resolvedOrganizationType = normalizeOrganizationType(
          organizationType || tenantRes.data?.organization_type,
        );
        const zonedNow = getCurrentTimeInTimezone(resolvedTimezone);
        const todayDayOfWeek = zonedNow.getDay();

        let schedule = {
          time_in: officeScheduleFallback?.work_start_time || null,
          time_out: officeScheduleFallback?.work_end_time || null,
        };

        if (!schedule.time_in || !schedule.time_out) {
          const workHoursRes = await supabase
            .from("work_hours")
            .select("time_in, time_out, institution_type")
            .eq("tenant_id", tenantId)
            .eq("day_of_week", todayDayOfWeek)
            .eq("is_active", true)
            .or(
              resolvedOrganizationType
                ? `institution_type.eq.${resolvedOrganizationType},institution_type.is.null`
                : "institution_type.is.null",
            )
            .order("institution_type", { ascending: false, nullsFirst: false })
            .limit(1);

          if (workHoursRes.error) throw workHoursRes.error;

          const row = workHoursRes.data?.[0];
          if (row?.time_in && row?.time_out) {
            schedule = {
              time_in: row.time_in,
              time_out: row.time_out,
            };
          }
        }

        const startMinutes = parseTimeToMinutes(schedule.time_in);
        const endMinutes = parseTimeToMinutes(schedule.time_out);

        if (!isEnabled || startMinutes === null || endMinutes === null) {
          if (!isCancelled) {
            setState({
              isLoading: false,
              isEnabled,
              isRestrictedNow: false,
              timezone: resolvedTimezone,
              bufferHours,
              restrictionReason: null,
              scheduleLabel:
                startMinutes !== null && endMinutes !== null
                  ? `${formatMinutesLabel(startMinutes)}-${formatMinutesLabel(endMinutes)}`
                  : null,
              reopensAtLabel: null,
            });
          }
          return;
        }

        const currentMinutes = zonedNow.getHours() * 60 + zonedNow.getMinutes();
        const restrictionWindow = resolveRestrictionWindow(
          currentMinutes,
          startMinutes,
          endMinutes + bufferHours * 60,
        );
        const reopensAtLabel = formatMinutesLabel(
          restrictionWindow.reopenMinutes,
          restrictionWindow.reopensNextDay,
        );

        if (!isCancelled) {
          setState({
            isLoading: false,
            isEnabled,
            isRestrictedNow: restrictionWindow.isRestricted,
            timezone: resolvedTimezone,
            bufferHours,
            restrictionReason: restrictionWindow.isRestricted
              ? `Akses ke halaman non-absensi dibatasi sampai ${reopensAtLabel} untuk memprioritaskan proses absensi.`
              : null,
            scheduleLabel: `${formatMinutesLabel(startMinutes)}-${formatMinutesLabel(endMinutes)}`,
            reopensAtLabel,
          });
        }
      } catch (error) {
        console.error("Error resolving attendance resource restriction:", error);
        if (!isCancelled) {
          setState(DEFAULT_STATE);
        }
      }
    };

    void fetchRestriction();

    return () => {
      isCancelled = true;
    };
  }, [officeScheduleFallback?.work_end_time, officeScheduleFallback?.work_start_time, organizationType, tenantId, tenantTimezone]);

  return useMemo(() => state, [state]);
}
