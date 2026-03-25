export const sanitizeOrKeyword = (value: string) =>
  value
    .trim()
    .replace(/[^a-zA-Z0-9\s@._-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

type PostgrestInFilter = {
  field: string;
  values: string[];
};

type BuildPostgrestOrClauseInput = {
  keyword: string;
  ilikeFields: string[];
  inFilters?: PostgrestInFilter[];
};

const sanitizeInFilterValue = (value: string) => value.trim().replace(/[^a-zA-Z0-9_-]/g, "");

export const buildPostgrestOrClause = ({
  keyword,
  ilikeFields,
  inFilters = [],
}: BuildPostgrestOrClauseInput): string | null => {
  const safeKeyword = sanitizeOrKeyword(keyword);
  if (!safeKeyword || ilikeFields.length === 0) return null;

  const parts = ilikeFields.map((field) => `${field}.ilike.%${safeKeyword}%`);
  for (const filter of inFilters) {
    if (!filter.field || filter.values.length === 0) continue;
    const safeValues = filter.values
      .map(sanitizeInFilterValue)
      .filter((value, index, values) => value.length > 0 && values.indexOf(value) === index);
    if (safeValues.length === 0) continue;
    parts.push(`${filter.field}.in.(${safeValues.join(",")})`);
  }

  return parts.join(",");
};
