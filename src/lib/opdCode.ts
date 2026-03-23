export function extractOpdInitials(name: string): string {
  const words = (name || "").toUpperCase().match(/[A-Z0-9]+/g) ?? [];
  return words.map((word) => word[0]).join("");
}

export function buildOpdCodeFromName(name: string): string {
  return extractOpdInitials(name);
}

export function normalizeOpdCode(rawCode: string): string {
  return (rawCode || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}
