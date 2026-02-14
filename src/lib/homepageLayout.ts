export interface HomepageSectionLike {
  section_key: string;
  is_enabled: boolean;
  sort_order: number;
}

interface SectionWithKey {
  key: string;
}

const sectionAliases: Record<string, string[]> = {
  clients: ["partners"],
  partners: ["clients"],
};

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
