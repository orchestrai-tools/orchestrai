import type { SymbolMatch } from "@warpforge/protocol";

function wordHit(line: string, query: string): boolean {
  const isWord = (char: string) => /[A-Za-z0-9_]/.test(char);
  let index = line.indexOf(query);
  while (index !== -1) {
    const before = index === 0 || !isWord(line[index - 1] ?? "");
    const after = index + query.length >= line.length || !isWord(line[index + query.length] ?? "");
    if (before && after) return true;
    index = line.indexOf(query, index + 1);
  }
  return false;
}

function sameExtension(matches: SymbolMatch[], currentPath: string): SymbolMatch[] {
  const ext = currentPath.split(".").pop()?.toLowerCase();
  if (!ext) return matches;
  const filtered = matches.filter((match) => match.path.toLowerCase().endsWith(`.${ext}`));
  return filtered.length > 0 ? filtered : matches;
}

function score(match: SymbolMatch, query: string): number {
  const needle = query.toLowerCase();
  let value = 0;
  const path = match.path.toLowerCase();
  const fileName = path.split("/").pop() ?? path;
  if (fileName.includes(needle)) {
    value += 100;
    if (fileName.split(".")[0] === needle) value += 50;
  } else if (path.includes(needle)) value += 20;
  const trimmed = match.text.trimStart();
  if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*") || trimmed.startsWith("#")) {
    value -= 80;
  }
  const lower = match.text.toLowerCase();
  if (lower.includes("export") && lower.includes(needle)) value += 60;
  else if (/(function|class |interface |const |let |type |struct |enum )/.test(lower) && lower.includes(needle)) value += 40;
  if (lower.includes(`<${needle}`)) value += 10;
  return value;
}

/** Rank `file.search` hits the way go-to-definition does: whole words, same kind of file, definitions first. */
export function rankSymbolMatches(matches: SymbolMatch[], query: string, currentPath: string): SymbolMatch[] {
  const words = matches.filter((match) => wordHit(match.text, query));
  const pool = words.length > 0 ? words : matches.filter((match) => match.text.includes(query));
  return sameExtension(pool, currentPath)
    .slice()
    .sort((left, right) => score(right, query) - score(left, query))
    .slice(0, 12);
}
