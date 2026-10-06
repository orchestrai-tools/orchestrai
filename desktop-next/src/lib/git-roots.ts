import type { FileDiff, GitRoot } from "@warpforge/protocol";

/** Files owned by each git root. One root, or none, stays a single list. */
export function filesByRoot(files: FileDiff[], roots: GitRoot[]): { root: GitRoot; files: FileDiff[] }[] | null {
  if (roots.length <= 1) return null;
  const [primary, ...nested] = roots;
  const groups = new Map<string, FileDiff[]>(roots.map((root) => [root.path, []]));
  for (const file of files) {
    const owner = nested
      .filter((root) => file.path === root.name || file.path.startsWith(`${root.name}/`))
      .sort((a, b) => b.name.length - a.name.length)[0];
    groups.get((owner ?? primary).path)?.push(file);
  }
  return roots
    .map((root) => ({ files: groups.get(root.path) ?? [], root }))
    .filter((group) => group.files.length > 0);
}

/** Parent directory of each file. Files at the checkout root share an empty directory. */
export function groupFilesByDirectory(files: FileDiff[]): { directory: string; files: FileDiff[] }[] {
  const groups = new Map<string, FileDiff[]>();
  for (const file of files) {
    const slash = file.path.lastIndexOf("/");
    const directory = slash === -1 ? "" : file.path.slice(0, slash);
    const list = groups.get(directory) ?? [];
    list.push(file);
    groups.set(directory, list);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([directory, items]) => ({ directory, files: items }));
}

export function rootLabel(root: GitRoot): string {
  return root.branch ? `${root.name} [${root.branch}]` : root.name;
}
