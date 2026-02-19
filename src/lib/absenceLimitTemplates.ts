export const ABSENCE_LIMIT_TEMPLATE_SETTING_KEY = "absence_limits_template";

export interface AbsenceLimitTemplateItem {
  id: string;
  max_days: number;
  warning_type: string;
  description: string;
  is_active: boolean;
}

export const DEFAULT_ABSENCE_LIMIT_TEMPLATE: AbsenceLimitTemplateItem[] = [
  {
    id: "rule-3-lisan",
    max_days: 3,
    warning_type: "lisan",
    description: "Teguran lisan",
    is_active: true,
  },
  {
    id: "rule-5-tertulis-ringan",
    max_days: 5,
    warning_type: "tertulis_ringan",
    description: "Teguran tertulis ringan",
    is_active: true,
  },
  {
    id: "rule-10-tertulis-sedang",
    max_days: 10,
    warning_type: "tertulis_sedang",
    description: "Teguran tertulis sedang",
    is_active: true,
  },
  {
    id: "rule-15-tertulis-berat",
    max_days: 15,
    warning_type: "tertulis_berat",
    description: "Teguran tertulis berat",
    is_active: true,
  },
  {
    id: "rule-20-pemberhentian",
    max_days: 20,
    warning_type: "pemberhentian",
    description: "Pemberhentian sementara",
    is_active: true,
  },
];

const asString = (value: unknown, fallback = ""): string => {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
};

const asNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

const asBoolean = (value: unknown, fallback = true): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return fallback;
};

export const normalizeAbsenceLimitTemplate = (value: unknown): AbsenceLimitTemplateItem[] => {
  if (!Array.isArray(value)) {
    return [...DEFAULT_ABSENCE_LIMIT_TEMPLATE];
  }

  const seenIds = new Set<string>();
  const normalized = value
    .map((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const raw = item as Record<string, unknown>;
      const maxDays = Math.max(1, Math.floor(asNumber(raw.max_days, 0)));
      const warningType = asString(raw.warning_type).trim();
      const description = asString(raw.description).trim();
      if (!warningType) return null;

      const rawId = asString(raw.id).trim();
      let id = rawId || `rule-${maxDays}-${warningType}-${index + 1}`;
      while (seenIds.has(id)) {
        id = `${id}-dup`;
      }
      seenIds.add(id);

      return {
        id,
        max_days: maxDays,
        warning_type: warningType,
        description,
        is_active: asBoolean(raw.is_active, true),
      } satisfies AbsenceLimitTemplateItem;
    })
    .filter((item): item is AbsenceLimitTemplateItem => !!item)
    .sort((a, b) => a.max_days - b.max_days);

  if (normalized.length === 0) {
    return [...DEFAULT_ABSENCE_LIMIT_TEMPLATE];
  }

  return normalized;
};
