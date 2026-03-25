export interface UatChecklistLogEntry {
  tanggal: string;
  update: string;
  areaDiuji: string;
  ringkasanHasil: string;
  referensi: string;
}

export interface UatChecklistItem {
  id: string;
  sectionId: string;
  sectionTitle: string;
  title: string;
  status: string;
  priority: string | null;
  isPassed: boolean;
  requiresAction: boolean;
}

export interface UatChecklistSection {
  id: string;
  title: string;
  defaultPriority: string | null;
  defaultMethod: string | null;
  statusLabel: string | null;
  items: UatChecklistItem[];
  passedCount: number;
  pendingCount: number;
}

export interface UatChecklistSummary {
  total: number;
  passed: number;
  pending: number;
  untested: number;
  retest: number;
  deviceOnly: number;
  passRate: number;
}

export interface ParsedUatChecklist {
  logEntries: UatChecklistLogEntry[];
  sections: UatChecklistSection[];
  summary: UatChecklistSummary;
}

const normalizeStatus = (status: string) => status.trim().toLowerCase();

export const isPassedStatus = (status: string) => /^sudah diuji(?: \d{4}-\d{2}-\d{2})?$/i.test(status.trim());

export const isDeviceOnlyStatus = (status: string) => normalizeStatus(status).includes("khusus device nyata");

export const isRetestStatus = (status: string) => normalizeStatus(status).includes("perlu retest");

export const isUntestedStatus = (status: string) => normalizeStatus(status).includes("belum diuji");

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const parseInlineMetadata = (value: string) =>
  value.split("|").reduce<Record<string, string>>((accumulator, part) => {
    const [rawKey, ...rawValueParts] = part.split(":");
    if (!rawKey || rawValueParts.length === 0) {
      return accumulator;
    }

    const key = rawKey.trim().toLowerCase();
    const parsedValue = rawValueParts.join(":").trim();
    if (!key || !parsedValue) {
      return accumulator;
    }

    accumulator[key] = parsedValue;
    return accumulator;
  }, {});

export function parseUatChecklist(markdown: string): ParsedUatChecklist {
  const lines = markdown.split(/\r?\n/);
  const logEntries: UatChecklistLogEntry[] = [];
  const sections: UatChecklistSection[] = [];

  let currentSection: UatChecklistSection | null = null;
  let inLogTable = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line === "## Log Update yang Sudah Diuji") {
      inLogTable = true;
      continue;
    }

    if (inLogTable) {
      if (line.startsWith("## ") && line !== "## Log Update yang Sudah Diuji") {
        inLogTable = false;
      } else if (line.startsWith("|") && !line.includes("---") && !line.includes("Tanggal | Update")) {
        const columns = line
          .split("|")
          .map((column) => column.trim())
          .filter(Boolean);

        if (columns.length >= 5) {
          logEntries.push({
            tanggal: columns[0],
            update: columns[1],
            areaDiuji: columns[2],
            ringkasanHasil: columns[3],
            referensi: columns.slice(4).join(" | "),
          });
        }
      }
    }

    const sectionMatch = line.match(/^##\s+(\d+)\.\s+(.+)$/);
    if (sectionMatch) {
      const sectionNumber = sectionMatch[1];
      const sectionTitle = sectionMatch[2].trim();
      currentSection = {
        id: `${sectionNumber}-${slugify(sectionTitle)}`,
        title: `${sectionNumber}. ${sectionTitle}`,
        defaultPriority: null,
        defaultMethod: null,
        statusLabel: null,
        items: [],
        passedCount: 0,
        pendingCount: 0,
      };
      sections.push(currentSection);
      continue;
    }

    if (!currentSection) {
      continue;
    }

    const sectionStatusMatch = line.match(
      /^Status seksi:\s+`([^`]+)`\s+\|\s+Prioritas default:\s+`([^`]+)`\s+\|\s+Metode umum:\s+`([^`]+)`$/,
    );
    if (sectionStatusMatch) {
      currentSection.statusLabel = sectionStatusMatch[1].trim();
      currentSection.defaultPriority = sectionStatusMatch[2].trim();
      currentSection.defaultMethod = sectionStatusMatch[3].trim();
      continue;
    }

    const itemMatch = line.match(/^- \[[ x]\]\s+(.+?)\s+`([^`]+)`$/);
    if (!itemMatch) {
      continue;
    }

    const title = itemMatch[1].trim();
    const metadata = parseInlineMetadata(itemMatch[2]);
    const status = metadata.status?.trim();
    const priority = metadata.prioritas?.trim() ?? null;
    if (!status) {
      continue;
    }

    const isPassed = isPassedStatus(status);
    const item: UatChecklistItem = {
      id: `${currentSection.id}-${currentSection.items.length + 1}`,
      sectionId: currentSection.id,
      sectionTitle: currentSection.title,
      title,
      status,
      priority,
      isPassed,
      requiresAction: !isPassed,
    };

    currentSection.items.push(item);
    if (isPassed) {
      currentSection.passedCount += 1;
    } else {
      currentSection.pendingCount += 1;
    }
  }

  const allItems = sections.flatMap((section) => section.items);
  const passed = allItems.filter((item) => item.isPassed).length;
  const pending = allItems.length - passed;
  const untested = allItems.filter((item) => isUntestedStatus(item.status)).length;
  const retest = allItems.filter((item) => isRetestStatus(item.status)).length;
  const deviceOnly = allItems.filter((item) => isDeviceOnlyStatus(item.status)).length;
  const sortedLogEntries = [...logEntries].sort((a, b) => b.tanggal.localeCompare(a.tanggal));

  return {
    logEntries: sortedLogEntries,
    sections,
    summary: {
      total: allItems.length,
      passed,
      pending,
      untested,
      retest,
      deviceOnly,
      passRate: allItems.length > 0 ? Math.round((passed / allItems.length) * 100) : 0,
    },
  };
}
