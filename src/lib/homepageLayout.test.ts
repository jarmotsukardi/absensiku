import { describe, expect, it } from "vitest";
import {
  getHomepageSectionOrder,
  isHomepageSectionEnabled,
  resolveHomepageSection,
  sortHomepageSectionDefinitions,
  type HomepageSectionLike,
} from "@/lib/homepageLayout";

const mockSections: HomepageSectionLike[] = [
  { section_key: "hero", is_enabled: false, sort_order: 3 },
  { section_key: "faq", is_enabled: true, sort_order: 1 },
  { section_key: "partners", is_enabled: true, sort_order: 2 },
  { section_key: "target_segment", is_enabled: true, sort_order: 4 },
];

describe("homepageLayout", () => {
  it("resolves alias key clients -> partners", () => {
    const section = resolveHomepageSection(mockSections, "clients");
    expect(section?.section_key).toBe("partners");
  });

  it("returns enabled by default for unknown section", () => {
    expect(isHomepageSectionEnabled(mockSections, "unknown_section")).toBe(true);
  });

  it("respects toggle state for known section", () => {
    expect(isHomepageSectionEnabled(mockSections, "hero")).toBe(false);
  });

  it("returns fallback order 999 for unknown section", () => {
    expect(getHomepageSectionOrder(mockSections, "unknown_section")).toBe(999);
  });

  it("sorts by admin sort_order and supports alias in rendered section list", () => {
    const definitions = [
      { key: "hero" },
      { key: "target_segment" },
      { key: "clients" },
      { key: "faq" },
    ];

    const sortedEnabledKeys = sortHomepageSectionDefinitions(definitions, mockSections)
      .filter((item) => isHomepageSectionEnabled(mockSections, item.key))
      .map((item) => item.key);

    expect(sortedEnabledKeys).toEqual(["faq", "clients", "target_segment"]);
  });
});
