export interface SidebarBannerItem {
  id: string;
  title: string;
  link: string;
  position: string;
  imageUrl: string;
  isActive: boolean;
}

const DEFAULT_POSITION = "homepage";

const toTrimmedString = (value: unknown): string => {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
};

const toBoolean = (value: unknown): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes";
  }
  if (typeof value === "number") return value !== 0;
  return false;
};

const unwrapBannerCollection = (raw: unknown): unknown[] => {
  if (Array.isArray(raw)) return raw;

  if (raw && typeof raw === "object") {
    const objectValue = raw as Record<string, unknown>;
    if (Array.isArray(objectValue.items)) return objectValue.items;
    if (Array.isArray(objectValue.banners)) return objectValue.banners;
    if (Array.isArray(objectValue.value)) return objectValue.value;
  }

  return [];
};

const normalizeSingleBanner = (raw: unknown, index: number): SidebarBannerItem | null => {
  if (!raw || typeof raw !== "object") return null;
  const objectValue = raw as Record<string, unknown>;

  const id = toTrimmedString(objectValue.id) || `sidebar-banner-${index + 1}`;
  const title = toTrimmedString(objectValue.title);
  const link = toTrimmedString(objectValue.link);
  const position = toTrimmedString(objectValue.position) || DEFAULT_POSITION;
  const imageUrl = toTrimmedString(objectValue.imageUrl);
  const isActive = toBoolean(objectValue.isActive);

  return { id, title, link, position, imageUrl, isActive };
};

export const normalizeSidebarBanners = (raw: unknown): SidebarBannerItem[] => {
  const collection = unwrapBannerCollection(raw);
  return collection
    .map((item, index) => normalizeSingleBanner(item, index))
    .filter((item): item is SidebarBannerItem => item !== null);
};

