export interface HomepageSectionLike {
  section_key: string;
  is_enabled: boolean;
  sort_order: number;
}

interface SectionWithKey {
  key: string;
}

export const HOMEPAGE_PINNED_TOP_KEYS = ["banner_promo", "hero", "solutions"] as const;
export const HOMEPAGE_PINNED_BOTTOM_KEYS = ["pricing", "faq", "cta", "footer"] as const;

const sectionAliases: Record<string, string[]> = {
  clients: ["partners"],
  partners: ["clients"],
};

export function getHomepagePinnedPlacement(key: string): "top" | "bottom" | null {
  if (HOMEPAGE_PINNED_TOP_KEYS.includes(key as (typeof HOMEPAGE_PINNED_TOP_KEYS)[number])) return "top";
  if (HOMEPAGE_PINNED_BOTTOM_KEYS.includes(key as (typeof HOMEPAGE_PINNED_BOTTOM_KEYS)[number])) return "bottom";
  return null;
}

export function resolveHomepageSection(
  sections: HomepageSectionLike[],
  key: string,
): HomepageSectionLike | undefined {
  const direct = sections.find((section) => section.section_key === key);
  if (direct) return direct;

  const aliases = sectionAliases[key] || [];
  for (const alias of aliases) {
    const match = sections.find((section) => section.section_key === alias);
    if (match) return match;
  }

  return undefined;
}

export function isHomepageSectionEnabled(
  sections: HomepageSectionLike[],
  key: string,
): boolean {
  const section = resolveHomepageSection(sections, key);
  return section?.is_enabled ?? true;
}

export function getHomepageSectionOrder(
  sections: HomepageSectionLike[],
  key: string,
): number {
  const section = resolveHomepageSection(sections, key);
  return section?.sort_order ?? 999;
}

export function sortHomepageSectionDefinitions<T extends SectionWithKey>(
  definitions: T[],
  sections: HomepageSectionLike[],
): T[] {
  return [...definitions].sort((a, b) => {
    const orderA = getHomepageSectionOrder(sections, a.key);
    const orderB = getHomepageSectionOrder(sections, b.key);

    if (orderA === orderB) return a.key.localeCompare(b.key);
    return orderA - orderB;
  });
}

export function stabilizeHomepageSectionDefinitions<T extends SectionWithKey>(definitions: T[]): T[] {
  const map = new Map(definitions.map((definition) => [definition.key, definition]));
  const pinnedKeys = new Set([...HOMEPAGE_PINNED_TOP_KEYS, ...HOMEPAGE_PINNED_BOTTOM_KEYS]);

  const topItems = HOMEPAGE_PINNED_TOP_KEYS
    .map((key) => map.get(key))
    .filter((item): item is T => Boolean(item));

  const middleItems = definitions.filter((definition) => !pinnedKeys.has(definition.key));

  const bottomItems = HOMEPAGE_PINNED_BOTTOM_KEYS
    .map((key) => map.get(key))
    .filter((item): item is T => Boolean(item));

  return [...topItems, ...middleItems, ...bottomItems];
}

export function stabilizeHomepageSectionRecords<T extends HomepageSectionLike>(sections: T[]): T[] {
  const map = new Map(sections.map((section) => [section.section_key, section]));
  const pinnedKeys = new Set([...HOMEPAGE_PINNED_TOP_KEYS, ...HOMEPAGE_PINNED_BOTTOM_KEYS]);

  const topItems = HOMEPAGE_PINNED_TOP_KEYS
    .map((key) => map.get(key))
    .filter((item): item is T => Boolean(item));

  const middleItems = sections.filter((section) => !pinnedKeys.has(section.section_key));

  const bottomItems = HOMEPAGE_PINNED_BOTTOM_KEYS
    .map((key) => map.get(key))
    .filter((item): item is T => Boolean(item));

  return [...topItems, ...middleItems, ...bottomItems].map((section, index) => ({
    ...section,
    sort_order: index + 1,
  }));
}
