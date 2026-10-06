import type { FileDiff, GitRoot } from "@warpforge/protocol";
import { filesByRoot, rootLabel } from "../../lib/git-roots";

export type Status = "M" | "A" | "D" | "R" | "U";

/** A changed file as the staging tree shows it. */
export interface ChangedFile {
  path: string;
  status: Status;
  additions: number;
  deletions: number;
  untracked: boolean;
  diff: FileDiff;
}

export type TreeRow =
  | { kind: "section"; key: string; depth: number; label: string; paths: string[]; untracked: boolean }
  | { kind: "folder"; key: string; depth: number; label: string; paths: string[]; untracked: boolean }
  | { kind: "file"; key: string; depth: number; label: string; file: ChangedFile };

interface Folder {
  folders: Map<string, Folder>;
  files: ChangedFile[];
}

const LETTER: Record<FileDiff["status"], Status> = {
  modified: "M",
  added: "A",
  deleted: "D",
  renamed: "R",
};

export const STATUS_WORD: Record<Status, string> = {
  M: "Modified",
  A: "Added",
  D: "Deleted",
  R: "Renamed",
  U: "Untracked",
};

export const STATUS_TONE: Record<Status, string> = {
  M: "text-amber-600 dark:text-amber-400",
  A: "text-emerald-600 dark:text-emerald-400",
  D: "text-red-600 dark:text-red-400",
  R: "text-sky-600 dark:text-sky-400",
  U: "text-muted-foreground",
};

/** Letter for a status word the daemon sends elsewhere (push and stash previews). */
export function statusLetter(status: string): Status {
  const word = status.toLowerCase();
  if (word.startsWith("a")) return "A";
  if (word.startsWith("d")) return "D";
  if (word.startsWith("r")) return "R";
  if (word.startsWith("u") || word === "?") return "U";
  return "M";
}

export function changedFile(diff: FileDiff, untracked: boolean): ChangedFile {
  let additions = 0;
  let deletions = 0;
  for (const hunk of diff.hunks) {
    for (const line of hunk.lines) {
      if (line.startsWith("+")) additions += 1;
      else if (line.startsWith("-")) deletions += 1;
    }
  }
  return { path: diff.path, status: untracked ? "U" : LETTER[diff.status], additions, deletions, untracked, diff };
}

const emptyFolder = (): Folder => ({ folders: new Map(), files: [] });
const byName = (a: string, b: string) => a.localeCompare(b);

function build(files: ChangedFile[]): Folder {
  const root = emptyFolder();
  for (const entry of files) {
    let folder = root;
    for (const part of entry.path.split("/").slice(0, -1)) {
      if (!folder.folders.has(part)) folder.folders.set(part, emptyFolder());
      folder = folder.folders.get(part)!;
    }
    folder.files.push(entry);
  }
  return root;
}

function paths(folder: Folder): string[] {
  return [...folder.files.map((entry) => entry.path), ...[...folder.folders.values()].flatMap(paths)];
}

/** A folder with one subfolder and no files of its own reads as one row (`desktop/src/views`). */
function compact(name: string, folder: Folder): [string, Folder] {
  let label = name;
  let current = folder;
  while (current.files.length === 0 && current.folders.size === 1) {
    const [childName, child] = [...current.folders.entries()][0]!;
    label = `${label}/${childName}`;
    current = child;
  }
  return [label, current];
}

function children(folder: Folder, prefix: string) {
  return [...folder.folders.keys()].sort(byName).map((name) => {
    const [label, inner] = compact(name, folder.folders.get(name)!);
    return { key: `${prefix}/${label}`, label, inner };
  });
}

function walk(folder: Folder, prefix: string, depth: number, untracked: boolean, collapsed: ReadonlySet<string>, out: TreeRow[]) {
  for (const { key, label, inner } of children(folder, prefix)) {
    out.push({ kind: "folder", key, depth, label, paths: paths(inner), untracked });
    if (!collapsed.has(key)) walk(inner, key, depth + 1, untracked, collapsed, out);
  }
  for (const entry of [...folder.files].sort((a, b) => byName(a.path, b.path))) {
    out.push({ kind: "file", key: entry.path, depth, label: entry.path.split("/").at(-1)!, file: entry });
  }
}

interface Section {
  key: string;
  label: string;
  files: ChangedFile[];
  untracked: boolean;
  depth: number;
  /** A checkout heading: its files are listed by the sections under it. */
  heading?: boolean;
  parent?: string;
}

/** Tracked changes, then files git does not track yet; one group per checkout when the project nests repositories. */
function sections(files: ChangedFile[], roots: GitRoot[]): Section[] {
  const split = (prefix: string, items: ChangedFile[], depth: number, parent?: string): Section[] =>
    [
      { key: `${prefix}tracked`, label: "Changes", files: items.filter((entry) => !entry.untracked), untracked: false, depth, parent },
      { key: `${prefix}untracked`, label: "Untracked files", files: items.filter((entry) => entry.untracked), untracked: true, depth, parent },
    ].filter((section) => section.files.length > 0);
  const groups = filesByRoot(
    files.map((entry) => entry.diff),
    roots,
  );
  if (!groups) return split("", files, 0);
  return groups.flatMap((group) => {
    const here = new Set(group.files.map((file) => file.path));
    const items = files.filter((entry) => here.has(entry.path));
    const key = `root:${group.root.path}`;
    const heading: Section = {
      key,
      label: rootLabel(group.root),
      files: items,
      untracked: items.every((entry) => entry.untracked),
      depth: 0,
      heading: true,
    };
    return [heading, ...split(`${key}/`, items, 1, key)];
  });
}

/** The staging tree as rows. A collapsed key hides that row's children. */
export function treeRows(files: ChangedFile[], roots: GitRoot[], flat: boolean, collapsed: ReadonlySet<string>): TreeRow[] {
  const out: TreeRow[] = [];
  for (const section of sections(files, roots)) {
    if (section.parent && collapsed.has(section.parent)) continue;
    out.push({
      kind: "section",
      key: section.key,
      depth: section.depth,
      label: section.label,
      paths: section.files.map((entry) => entry.path),
      untracked: section.untracked,
    });
    if (collapsed.has(section.key) || section.heading) continue;
    if (flat) {
      for (const entry of [...section.files].sort((a, b) => byName(a.path, b.path))) {
        out.push({ kind: "file", key: entry.path, depth: section.depth + 1, label: entry.path, file: entry });
      }
    } else {
      walk(build(section.files), section.key, section.depth + 1, section.untracked, collapsed, out);
    }
  }
  return out;
}

/** Every section and folder key, for Collapse all. */
export function groupKeys(files: ChangedFile[], roots: GitRoot[]): string[] {
  const keysOf = (folder: Folder, prefix: string): string[] =>
    children(folder, prefix).flatMap(({ key, inner }) => [key, ...keysOf(inner, key)]);
  return sections(files, roots).flatMap((section) => [section.key, ...keysOf(build(section.files), section.key)]);
}

/** Checked state of a group: all, none, or some of its files. */
export function groupState(paths: string[], checked: ReadonlySet<string>): boolean | "indeterminate" {
  const on = paths.filter((path) => checked.has(path)).length;
  if (on === 0) return false;
  return on === paths.length ? true : "indeterminate";
}

export function splitPath(path: string) {
  const index = path.lastIndexOf("/");
  return index === -1 ? { dir: "", name: path } : { dir: path.slice(0, index + 1), name: path.slice(index + 1) };
}

export const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
