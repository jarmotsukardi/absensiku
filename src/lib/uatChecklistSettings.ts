import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { UatDomain } from "@/lib/uatChecklistDomains";

export const UAT_CHECKLIST_SETTINGS_KEY = "uat_checklist_runtime";
export const UAT_EXECUTION_LOGBOOK_SETTINGS_KEY = "uat_execution_logbook";
const UAT_EXECUTION_LOGBOOK_TABLE = "uat_execution_logbook_entries";

export interface UatChecklistSettingsPayload {
  markdown: string;
  source_label?: string | null;
}

export interface UatChecklistSettingsRecord {
  markdown: string;
  sourceLabel: string | null;
  updatedAt: string | null;
}

export interface UatExecutionLogEntry {
  id: string;
  domain: UatDomain;
  tanggal: string;
  releaseVersion: string | null;
  subdomain: string | null;
  update: string;
  tester: string | null;
  reviewer: string | null;
  approver: string | null;
  workflowStatus: "draft" | "diuji" | "sign_off" | "closed";
  areaDiuji: string;
  ringkasanHasil: string;
  referensi: string;
  status: "lolos" | "perlu_tindak_lanjut";
  createdAt: string;
}

export interface UatExecutionLogbookQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: "all" | UatExecutionLogEntry["status"];
  workflowStatus?: "all" | UatExecutionLogEntry["workflowStatus"];
  releaseVersion?: string;
  tester?: string;
}

export interface UatExecutionLogbookPageResult {
  entries: UatExecutionLogEntry[];
  totalItems: number;
  page: number;
  pageSize: number;
  source: "table" | "legacy" | "hybrid";
}

export interface UatExecutionLogbookFilterOptions {
  releaseVersions: string[];
  testers: string[];
  source: "table" | "legacy" | "hybrid";
}

type UatExecutionLogbookRow = Database["public"]["Tables"]["uat_execution_logbook_entries"]["Row"];

const normalizePayload = (value: unknown): UatChecklistSettingsPayload | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const payload = value as Record<string, unknown>;
  const markdown = typeof payload.markdown === "string" ? payload.markdown : null;
  if (!markdown) {
    return null;
  }

  return {
    markdown,
    source_label: typeof payload.source_label === "string" ? payload.source_label : null,
  };
};

const getDomainChecklistSettingsKey = (domain: UatDomain) => `${UAT_CHECKLIST_SETTINGS_KEY}_${domain}`;
const getDomainExecutionLogbookSettingsKey = (domain: UatDomain) => `${UAT_EXECUTION_LOGBOOK_SETTINGS_KEY}_${domain}`;

const isMissingRelationError = (error: unknown) =>
  Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      typeof (error as { code?: string }).code === "string" &&
      (error as { code: string }).code === "42P01",
  );

const mapTableRowToEntry = (row: UatExecutionLogbookRow): UatExecutionLogEntry => ({
  id: row.id,
  domain: row.domain as UatDomain,
  tanggal: row.tanggal,
  releaseVersion: row.release_version,
  subdomain: row.subdomain,
  update: row.update_name,
  tester: row.tester,
  reviewer: row.reviewer,
  approver: row.approver,
  workflowStatus: row.workflow_status as UatExecutionLogEntry["workflowStatus"],
  areaDiuji: row.area_diuji,
  ringkasanHasil: row.ringkasan_hasil,
  referensi: row.referensi,
  status: row.status as UatExecutionLogEntry["status"],
  createdAt: row.created_at,
});

const sortExecutionEntries = (entries: UatExecutionLogEntry[]) =>
  [...entries].sort((a, b) => {
    const dateSort = b.tanggal.localeCompare(a.tanggal);
    return dateSort !== 0 ? dateSort : b.createdAt.localeCompare(a.createdAt);
  });

const normalizeExecutionLogbook = (value: unknown, domainFilter?: UatDomain): UatExecutionLogEntry[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return sortExecutionEntries(
    value
      .map((item) => {
        if (!item || typeof item !== "object") {
          return null;
        }

        const payload = item as Record<string, unknown>;
        const id = typeof payload.id === "string" ? payload.id : null;
        const domain =
          payload.domain === "absensi" || payload.domain === "hr" || payload.domain === "payroll"
            ? payload.domain
            : "absensi";
        const tanggal = typeof payload.tanggal === "string" ? payload.tanggal : null;
        const releaseVersion = typeof payload.releaseVersion === "string" ? payload.releaseVersion : null;
        const subdomain = typeof payload.subdomain === "string" ? payload.subdomain : null;
        const update = typeof payload.update === "string" ? payload.update : null;
        const tester = typeof payload.tester === "string" ? payload.tester : null;
        const reviewer = typeof payload.reviewer === "string" ? payload.reviewer : null;
        const approver = typeof payload.approver === "string" ? payload.approver : null;
        const workflowStatus =
          payload.workflowStatus === "draft" ||
          payload.workflowStatus === "diuji" ||
          payload.workflowStatus === "sign_off" ||
          payload.workflowStatus === "closed"
            ? payload.workflowStatus
            : "diuji";
        const areaDiuji = typeof payload.areaDiuji === "string" ? payload.areaDiuji : null;
        const ringkasanHasil = typeof payload.ringkasanHasil === "string" ? payload.ringkasanHasil : null;
        const referensi = typeof payload.referensi === "string" ? payload.referensi : null;
        const status =
          payload.status === "lolos" || payload.status === "perlu_tindak_lanjut" ? payload.status : null;
        const createdAt = typeof payload.createdAt === "string" ? payload.createdAt : null;

        if (!id || !tanggal || !update || !areaDiuji || !ringkasanHasil || !referensi || !status || !createdAt) {
          return null;
        }

        return {
          id,
          domain,
          tanggal,
          releaseVersion,
          subdomain,
          update,
          tester,
          reviewer,
          approver,
          workflowStatus,
          areaDiuji,
          ringkasanHasil,
          referensi,
          status,
          createdAt,
        } satisfies UatExecutionLogEntry;
      })
      .filter((item): item is UatExecutionLogEntry => item !== null)
      .filter((item) => (domainFilter ? item.domain === domainFilter : true)),
  );
};

const dedupeExecutionEntries = (entries: UatExecutionLogEntry[]) => {
  const seen = new Set<string>();
  return sortExecutionEntries(
    entries.filter((entry) => {
      if (seen.has(entry.id)) {
        return false;
      }
      seen.add(entry.id);
      return true;
    }),
  );
};

const normalizeLogbookQuery = (query: UatExecutionLogbookQuery = {}) => ({
  page: Math.max(1, query.page ?? 1),
  pageSize: Math.max(1, query.pageSize ?? 10),
  search: query.search?.trim() ?? "",
  status: query.status ?? "all",
  workflowStatus: query.workflowStatus ?? "all",
  releaseVersion: query.releaseVersion?.trim() ?? "",
  tester: query.tester?.trim() ?? "",
});

const matchesExecutionLogbookQuery = (entry: UatExecutionLogEntry, query: UatExecutionLogbookQuery) => {
  const normalized = normalizeLogbookQuery(query);
  const matchesSearch =
    !normalized.search ||
    [
      entry.tanggal,
      entry.releaseVersion ?? "",
      entry.subdomain ?? "",
      entry.update,
      entry.tester ?? "",
      entry.reviewer ?? "",
      entry.approver ?? "",
      entry.areaDiuji,
      entry.ringkasanHasil,
      entry.referensi,
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalized.search.toLowerCase());
  const matchesStatus = normalized.status === "all" || entry.status === normalized.status;
  const matchesWorkflow =
    normalized.workflowStatus === "all" || entry.workflowStatus === normalized.workflowStatus;
  const matchesRelease =
    !normalized.releaseVersion || normalized.releaseVersion === "all"
      ? true
      : (entry.releaseVersion?.trim() ?? "") === normalized.releaseVersion;
  const matchesTester =
    !normalized.tester || normalized.tester === "all" ? true : (entry.tester?.trim() ?? "") === normalized.tester;

  return matchesSearch && matchesStatus && matchesWorkflow && matchesRelease && matchesTester;
};

const paginateExecutionEntries = (entries: UatExecutionLogEntry[], query: UatExecutionLogbookQuery) => {
  const normalized = normalizeLogbookQuery(query);
  const offset = (normalized.page - 1) * normalized.pageSize;

  return {
    entries: entries.slice(offset, offset + normalized.pageSize),
    totalItems: entries.length,
    page: normalized.page,
    pageSize: normalized.pageSize,
  };
};

const extractExecutionLogbookFilterOptions = (entries: UatExecutionLogEntry[]) => ({
  releaseVersions: Array.from(
    new Set(entries.map((entry) => entry.releaseVersion?.trim()).filter((value): value is string => Boolean(value))),
  ),
  testers: Array.from(
    new Set(entries.map((entry) => entry.tester?.trim()).filter((value): value is string => Boolean(value))),
  ),
});

const toPostgrestIlikePattern = (value: string) => `%${value.replace(/[,%()]/g, " ").replace(/\s+/g, " ").trim()}%`;

async function fetchLegacyExecutionLogbook(domain: UatDomain) {
  const primaryKey = getDomainExecutionLogbookSettingsKey(domain);
  const keys = domain === "absensi" ? [primaryKey, UAT_EXECUTION_LOGBOOK_SETTINGS_KEY] : [primaryKey];
  const { data, error } = await supabase.from("system_settings").select("key, value").in("key", keys);

  if (error) {
    throw error;
  }

  const primaryRecord = data?.find((item) => item.key === primaryKey);
  if (primaryRecord) {
    return normalizeExecutionLogbook(primaryRecord.value, domain);
  }

  if (domain === "absensi") {
    const legacyRecord = data?.find((item) => item.key === UAT_EXECUTION_LOGBOOK_SETTINGS_KEY);
    return normalizeExecutionLogbook(legacyRecord?.value, "absensi");
  }

  return [];
}

async function fetchTableExecutionLogbook(domain: UatDomain) {
  const { data, error } = await supabase
    .from(UAT_EXECUTION_LOGBOOK_TABLE)
    .select("*")
    .eq("domain", domain)
    .order("tanggal", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapTableRowToEntry);
}

async function fetchTableExecutionLogbookPage(domain: UatDomain, query: UatExecutionLogbookQuery = {}) {
  const normalized = normalizeLogbookQuery(query);
  const from = (normalized.page - 1) * normalized.pageSize;
  const to = from + normalized.pageSize - 1;

  let request = supabase
    .from(UAT_EXECUTION_LOGBOOK_TABLE)
    .select("*", { count: "exact" })
    .eq("domain", domain);

  if (normalized.status !== "all") {
    request = request.eq("status", normalized.status);
  }

  if (normalized.workflowStatus !== "all") {
    request = request.eq("workflow_status", normalized.workflowStatus);
  }

  if (normalized.releaseVersion && normalized.releaseVersion !== "all") {
    request = request.eq("release_version", normalized.releaseVersion);
  }

  if (normalized.tester && normalized.tester !== "all") {
    request = request.eq("tester", normalized.tester);
  }

  if (normalized.search) {
    const pattern = toPostgrestIlikePattern(normalized.search);
    request = request.or(
      [
        `tanggal.ilike.${pattern}`,
        `release_version.ilike.${pattern}`,
        `subdomain.ilike.${pattern}`,
        `update_name.ilike.${pattern}`,
        `tester.ilike.${pattern}`,
        `reviewer.ilike.${pattern}`,
        `approver.ilike.${pattern}`,
        `area_diuji.ilike.${pattern}`,
        `ringkasan_hasil.ilike.${pattern}`,
        `referensi.ilike.${pattern}`,
      ].join(","),
    );
  }

  const { data, error, count } = await request
    .order("tanggal", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    throw error;
  }

  return {
    entries: (data ?? []).map(mapTableRowToEntry),
    totalItems: count ?? 0,
    page: normalized.page,
    pageSize: normalized.pageSize,
    source: "table" as const,
  };
}

async function fetchTableExecutionLogbookFilterOptions(domain: UatDomain) {
  const { data, error } = await supabase
    .from(UAT_EXECUTION_LOGBOOK_TABLE)
    .select("release_version, tester")
    .eq("domain", domain);

  if (error) {
    throw error;
  }

  return {
    releaseVersions: Array.from(
      new Set((data ?? []).map((entry) => entry.release_version?.trim()).filter((value): value is string => Boolean(value))),
    ),
    testers: Array.from(
      new Set((data ?? []).map((entry) => entry.tester?.trim()).filter((value): value is string => Boolean(value))),
    ),
    source: "table" as const,
  };
}

export async function fetchRuntimeUatChecklist(domain: UatDomain = "absensi") {
  const primaryKey = getDomainChecklistSettingsKey(domain);
  const keys = domain === "absensi" ? [primaryKey, UAT_CHECKLIST_SETTINGS_KEY] : [primaryKey];
  const { data, error } = await supabase
    .from("system_settings")
    .select("key, value, updated_at")
    .in("key", keys);

  if (error) {
    throw error;
  }

  const record =
    data?.find((item) => item.key === primaryKey) ??
    (domain === "absensi" ? data?.find((item) => item.key === UAT_CHECKLIST_SETTINGS_KEY) : null);
  const payload = normalizePayload(record?.value);
  if (!payload) {
    return null;
  }

  return {
    markdown: payload.markdown,
    sourceLabel: payload.source_label ?? null,
    updatedAt: record?.updated_at ?? null,
  } satisfies UatChecklistSettingsRecord;
}

export async function saveRuntimeUatChecklist(
  markdown: string,
  sourceLabel?: string,
  domain: UatDomain = "absensi",
) {
  const now = new Date().toISOString();
  const { error } = await supabase.from("system_settings").upsert(
    {
      key: getDomainChecklistSettingsKey(domain),
      value: {
        markdown,
        source_label: sourceLabel ?? null,
      },
      description: `Sumber runtime untuk monitoring checklist UAT domain ${domain}.`,
      updated_at: now,
    },
    { onConflict: "key" },
  );

  if (error) {
    throw error;
  }

  return {
    markdown,
    sourceLabel: sourceLabel ?? null,
    updatedAt: now,
  } satisfies UatChecklistSettingsRecord;
}

export async function fetchUatExecutionLogbook(domain: UatDomain = "absensi") {
  const legacyEntriesPromise = fetchLegacyExecutionLogbook(domain);

  try {
    const [tableEntries, legacyEntries] = await Promise.all([fetchTableExecutionLogbook(domain), legacyEntriesPromise]);
    return dedupeExecutionEntries([...tableEntries, ...legacyEntries]);
  } catch (error) {
    if (isMissingRelationError(error)) {
      return legacyEntriesPromise;
    }

    throw error;
  }
}

export async function fetchUatExecutionLogbookPage(
  domain: UatDomain = "absensi",
  query: UatExecutionLogbookQuery = {},
): Promise<UatExecutionLogbookPageResult> {
  const legacyEntries = await fetchLegacyExecutionLogbook(domain);

  try {
    if (legacyEntries.length > 0) {
      const tableEntries = await fetchTableExecutionLogbook(domain);
      const filteredEntries = dedupeExecutionEntries([...tableEntries, ...legacyEntries]).filter((entry) =>
        matchesExecutionLogbookQuery(entry, query),
      );
      return {
        ...paginateExecutionEntries(filteredEntries, query),
        source: "hybrid",
      };
    }

    return await fetchTableExecutionLogbookPage(domain, query);
  } catch (error) {
    if (!isMissingRelationError(error)) {
      throw error;
    }

    const filteredEntries = legacyEntries.filter((entry) => matchesExecutionLogbookQuery(entry, query));
    return {
      ...paginateExecutionEntries(filteredEntries, query),
      source: "legacy",
    };
  }
}

export async function fetchUatExecutionLogbookFilterOptions(
  domain: UatDomain = "absensi",
): Promise<UatExecutionLogbookFilterOptions> {
  const legacyEntries = await fetchLegacyExecutionLogbook(domain);

  try {
    if (legacyEntries.length > 0) {
      const tableEntries = await fetchTableExecutionLogbook(domain);
      return {
        ...extractExecutionLogbookFilterOptions(dedupeExecutionEntries([...tableEntries, ...legacyEntries])),
        source: "hybrid",
      };
    }

    return await fetchTableExecutionLogbookFilterOptions(domain);
  } catch (error) {
    if (!isMissingRelationError(error)) {
      throw error;
    }

    return {
      ...extractExecutionLogbookFilterOptions(legacyEntries),
      source: "legacy",
    };
  }
}

export async function appendUatExecutionLogEntry(entry: Omit<UatExecutionLogEntry, "id" | "createdAt">) {
  const now = new Date().toISOString();

  try {
    const { data, error } = await supabase
      .from(UAT_EXECUTION_LOGBOOK_TABLE)
      .insert({
        domain: entry.domain,
        tanggal: entry.tanggal,
        release_version: entry.releaseVersion,
        subdomain: entry.subdomain,
        update_name: entry.update,
        tester: entry.tester,
        reviewer: entry.reviewer,
        approver: entry.approver,
        workflow_status: entry.workflowStatus,
        area_diuji: entry.areaDiuji,
        ringkasan_hasil: entry.ringkasanHasil,
        referensi: entry.referensi,
        status: entry.status,
        source: "admin_uat_monitoring",
        created_at: now,
        updated_at: now,
      })
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return mapTableRowToEntry(data);
  } catch (error) {
    if (!isMissingRelationError(error)) {
      throw error;
    }

    const currentEntries = await fetchLegacyExecutionLogbook(entry.domain);
    const nextEntry: UatExecutionLogEntry = {
      ...entry,
      id: crypto.randomUUID(),
      createdAt: now,
    };

    const nextEntries = [nextEntry, ...currentEntries];
    const { error: legacyError } = await supabase.from("system_settings").upsert(
      {
        key: getDomainExecutionLogbookSettingsKey(entry.domain),
        value: nextEntries,
        description: `Logbook permanen hasil eksekusi UAT domain ${entry.domain} dari halaman admin.`,
        updated_at: now,
      },
      { onConflict: "key" },
    );

    if (legacyError) {
      throw legacyError;
    }

    return nextEntry;
  }
}
