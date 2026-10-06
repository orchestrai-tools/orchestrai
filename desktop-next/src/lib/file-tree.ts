import type { ProjectFile } from "@warpforge/protocol";

export interface FileTreeNode {
  name: string;
  path: string;
  directory: boolean;
  changed: boolean;
  children: FileTreeNode[];
}

/** Nest project files under their parent directories. Directories come first. */
export function buildFileTree(files: readonly ProjectFile[]): FileTreeNode[] {
  const root: FileTreeNode = { name: "", path: "", directory: true, changed: false, children: [] };
  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    let cursor = root;
    for (let index = 0; index < parts.length; index++) {
      const name = parts[index] ?? "";
      const path = parts.slice(0, index + 1).join("/");
      const directory = index < parts.length - 1;
      let child = cursor.children.find((item) => item.path === path);
      if (!child) {
        child = { name, path, directory, changed: false, children: [] };
        cursor.children.push(child);
      }
      if (!directory) child.changed = file.changed;
      cursor = child;
    }
  }
  markChanged(root);
  sortNode(root);
  return root.children;
}

/** Closed overrides that make the tree match a saved list of open folders. */
export function closedFromExpanded(
  nodes: readonly FileTreeNode[],
  expanded: readonly string[],
): Record<string, boolean> {
  const open = new Set(expanded);
  const closed: Record<string, boolean> = {};
  function walk(list: readonly FileTreeNode[]) {
    for (const node of list) {
      if (!node.directory) continue;
      if (open.has(node.path) !== node.changed) closed[node.path] = !open.has(node.path);
      walk(node.children);
    }
  }
  walk(nodes);
  return closed;
}

/** Marks a tree the user collapsed completely, so an empty list is not "never saved". */
const COLLAPSED_TREE = "\0";

/** A tree with nothing to scroll must not replace a saved offset with zero. */
export function treeScrollToStore(
  top: number,
  left: number,
  room: number,
): { treeScrollTop: number; treeScrollLeft: number } | null {
  if (room <= 1 && top === 0 && left === 0) return null;
  return { treeScrollTop: top, treeScrollLeft: left };
}

/** What to store. Collapsing every folder is a choice, not an unsaved tree. */
export function savedExpanded(open: readonly string[]): string[] {
  return open.length === 0 ? [COLLAPSED_TREE] : [...open];
}

/** Null when this tree has never been saved. */
export function readExpanded(stored: readonly string[]): string[] | null {
  if (stored.length === 0) return null;
  return stored.filter((dir) => dir !== COLLAPSED_TREE);
}

/** Folders that are open, including changed folders the user has not collapsed. */
export function expandedFromClosed(
  nodes: readonly FileTreeNode[],
  closed: Readonly<Record<string, boolean>>,
): string[] {
  const open: string[] = [];
  function walk(list: readonly FileTreeNode[]) {
    for (const node of list) {
      if (!node.directory) continue;
      const shown = node.path in closed ? !closed[node.path] : node.changed;
      if (shown) open.push(node.path);
      walk(node.children);
    }
  }
  walk(nodes);
  return open;
}

function markChanged(node: FileTreeNode): boolean {
  if (!node.directory) return node.changed;
  const childChanged = node.children.map((child) => markChanged(child));
  node.changed = childChanged.some(Boolean);
  return node.changed;
}

function sortNode(node: FileTreeNode): void {
  node.children.sort((left, right) => {
    if (left.directory !== right.directory) return left.directory ? -1 : 1;
    return left.name.localeCompare(right.name);
  });
  for (const child of node.children) sortNode(child);
}
