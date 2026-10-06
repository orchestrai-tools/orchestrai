import type { ChangedFile } from "@/data/git"

export type GroupBy = "folder" | "flat"

export type TreeRow =
  | { kind: "section"; key: string; depth: number; label: string; paths: string[] }
  | { kind: "folder"; key: string; depth: number; label: string; paths: string[] }
  | { kind: "file"; key: string; depth: number; label: string; file: ChangedFile }

interface Folder {
  folders: Map<string, Folder>
  files: ChangedFile[]
}

const emptyFolder = (): Folder => ({ folders: new Map(), files: [] })
const byName = (a: string, b: string) => a.localeCompare(b)

function build(files: ChangedFile[]): Folder {
  const root = emptyFolder()
  for (const entry of files) {
    let folder = root
    for (const part of entry.path.split("/").slice(0, -1)) {
      if (!folder.folders.has(part)) folder.folders.set(part, emptyFolder())
      folder = folder.folders.get(part)!
    }
    folder.files.push(entry)
  }
  return root
}

function paths(folder: Folder): string[] {
  return [...folder.files.map((entry) => entry.path), ...[...folder.folders.values()].flatMap(paths)]
}

/** A folder with one subfolder and no files of its own reads as one row (`desktop/src/views/docs`). */
function compact(name: string, folder: Folder): [string, Folder] {
  let label = name
  let current = folder
  while (current.files.length === 0 && current.folders.size === 1) {
    const [childName, child] = [...current.folders.entries()][0]
    label = `${label}/${childName}`
    current = child
  }
  return [label, current]
}

function children(folder: Folder, prefix: string) {
  return [...folder.folders.keys()].sort(byName).map((name) => {
    const [label, inner] = compact(name, folder.folders.get(name)!)
    return { key: `${prefix}/${label}`, label, inner }
  })
}

function walk(folder: Folder, prefix: string, depth: number, collapsed: ReadonlySet<string>, out: TreeRow[]) {
  for (const { key, label, inner } of children(folder, prefix)) {
    out.push({ kind: "folder", key, depth, label, paths: paths(inner) })
    if (!collapsed.has(key)) walk(inner, key, depth + 1, collapsed, out)
  }
  for (const entry of [...folder.files].sort((a, b) => byName(a.path, b.path))) {
    out.push({ kind: "file", key: entry.path, depth, label: entry.path.split("/").at(-1)!, file: entry })
  }
}

function sections(files: ChangedFile[]) {
  return [
    { key: "tracked", label: "Changes", files: files.filter((entry) => entry.status !== "U") },
    { key: "untracked", label: "Untracked files", files: files.filter((entry) => entry.status === "U") },
  ].filter((section) => section.files.length > 0)
}

/**
 * The staging tree as rows: tracked changes, then files git does not track
 * yet, each a section with its folders. A collapsed key hides that row's children.
 */
export function treeRows(files: ChangedFile[], groupBy: GroupBy, collapsed: ReadonlySet<string>): TreeRow[] {
  const out: TreeRow[] = []
  for (const section of sections(files)) {
    out.push({ kind: "section", key: section.key, depth: 0, label: section.label, paths: section.files.map((entry) => entry.path) })
    if (collapsed.has(section.key)) continue
    if (groupBy === "flat") {
      for (const entry of [...section.files].sort((a, b) => byName(a.path, b.path))) {
        out.push({ kind: "file", key: entry.path, depth: 1, label: entry.path, file: entry })
      }
    } else {
      walk(build(section.files), section.key, 1, collapsed, out)
    }
  }
  return out
}

/** Every section and folder key, for Collapse all. */
export function groupKeys(files: ChangedFile[]): string[] {
  const keysOf = (folder: Folder, prefix: string): string[] =>
    children(folder, prefix).flatMap(({ key, inner }) => [key, ...keysOf(inner, key)])
  return sections(files).flatMap((section) => [section.key, ...keysOf(build(section.files), section.key)])
}

/** Checked state of a group: all, none, or some of its files. */
export function groupState(paths: string[], checked: ReadonlySet<string>): boolean | "indeterminate" {
  const on = paths.filter((path) => checked.has(path)).length
  if (on === 0) return false
  return on === paths.length ? true : "indeterminate"
}

export const STATUS_WORD = { M: "Modified", A: "Added", D: "Deleted", R: "Renamed", U: "Untracked" } as const

export const STATUS_TONE = {
  M: "text-amber-600 dark:text-amber-400",
  A: "text-emerald-600 dark:text-emerald-400",
  D: "text-red-600 dark:text-red-400",
  R: "text-sky-600 dark:text-sky-400",
  U: "text-muted-foreground",
} as const

export function splitPath(path: string) {
  const index = path.lastIndexOf("/")
  return index === -1 ? { dir: "", name: path } : { dir: path.slice(0, index + 1), name: path.slice(index + 1) }
}
