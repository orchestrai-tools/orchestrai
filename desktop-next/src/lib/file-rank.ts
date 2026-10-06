import type { ProjectFile } from "@warpforge/protocol";

/** File-name matches first, then the rest of the path. A miss scores off the list. */
export function rankFiles(files: ProjectFile[], query: string): ProjectFile[] {
  const needle = query.toLowerCase();
  const score = (path: string) => {
    const full = path.toLowerCase();
    const base = full.split("/").pop() ?? full;
    if (base.startsWith(needle)) return 0;
    if (full.startsWith(needle)) return 1;
    if (base.includes(needle)) return 2;
    if (full.includes(needle)) return 3;
    return 4;
  };
  return files
    .map((file) => ({ file, score: score(file.path) }))
    .filter((entry) => entry.score < 4)
    .sort((left, right) => left.score - right.score || left.file.path.localeCompare(right.file.path))
    .map((entry) => entry.file);
}
