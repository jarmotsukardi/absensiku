import type { Locator } from "@playwright/test";

export const parseCountFromText = (text: string, pattern: RegExp): number => {
  const match = text.match(pattern);
  if (!match) return -1;
  return Number(match[1]);
};

export const countTableRowsIgnoringEmptyState = async (
  rows: Locator,
  emptyNeedles: string[],
): Promise<number> => {
  const count = await rows.count();
  if (count === 0) return 0;
  if (count === 1) {
    const rowText = ((await rows.first().textContent()) || "").toLowerCase();
    if (emptyNeedles.some((needle) => rowText.includes(needle.toLowerCase()))) {
      return 0;
    }
  }
  return count;
};
