import type { ProjectFile } from "@warpforge/protocol";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@warpforge/ui/components/context-menu";
import { Skeleton } from "@warpforge/ui/components/skeleton";
import { cn } from "@warpforge/ui/lib/utils";
import { ChevronRightIcon, FileIcon, FolderIcon, FolderOpenIcon } from "lucide-react";
import { useMemo } from "react";
import { buildFileTree, type FileTreeNode } from "../../lib/file-tree";
import { FILE_REF_MIME } from "../../lib/mention-path";
import { revealPath } from "../../lib/reveal-path";
import { copyText } from "../changes/file-ops";
import { folderOf, type NameRequest } from "./name-dialog";
import { useTreeState, visibleNodes } from "./use-tree-state";

interface Props {
  files: ProjectFile[];
  loading: boolean;
  error: string | null;
  selected: string | null;
  root: string | undefined;
  taskId: string;
  project: string;
  worktree: string | undefined;
  onOpen: (path: string) => void;
  onRefresh: () => void;
  onName: (request: NameRequest) => void;
  onDelete: (path: string) => void;
}

/**
 * The project's files as a collapsible tree. Folders holding a change start
 * open and carry a dot; drag a file into a composer to mention it.
 */
export function FileTreePanel({
  files,
  loading,
  error,
  selected,
  root,
  taskId,
  project,
  worktree,
  onOpen,
  onRefresh,
  onName,
  onDelete,
}: Props) {
  const nodes = useMemo(() => buildFileTree(files), [files]);
  const tree = useTreeState(nodes, taskId, project, worktree);
  const rows = useMemo(() => visibleNodes(nodes, tree.closed), [nodes, tree.closed]);

  if (error) {
    return (
      <p className="px-3 py-2 text-xs text-red-600 dark:text-red-400">
        {error}{" "}
        <button type="button" className="underline" onClick={onRefresh}>
          Retry
        </button>
      </p>
    );
  }
  if (loading && files.length === 0) {
    return (
      <div className="flex flex-col gap-1.5 px-3 py-2" aria-label="Loading files">
        {[70, 55, 80, 45, 65].map((width) => (
          <Skeleton key={width} className="h-4" style={{ width: `${width}%` }} />
        ))}
      </div>
    );
  }

  const menu = (node: FileTreeNode, shown: boolean) => (
    <ContextMenuContent className="w-52">
      {node.directory ? (
        <ContextMenuItem onSelect={() => tree.toggle(node.path, shown)}>{shown ? "Collapse" : "Expand"}</ContextMenuItem>
      ) : (
        <ContextMenuItem onSelect={() => onOpen(node.path)}>Open</ContextMenuItem>
      )}
      <ContextMenuItem onSelect={() => copyText(node.path, "path")}>Copy path</ContextMenuItem>
      <ContextMenuItem onSelect={() => void revealPath(node.path, root, true)}>Reveal in Finder</ContextMenuItem>
      <ContextMenuItem onSelect={() => void revealPath(node.path, root, false)}>Open in default app</ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onSelect={() => onName({ kind: "file", path: folderOf(node.path, node.directory) })}>
        New file…
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => onName({ kind: "folder", path: folderOf(node.path, node.directory) })}>
        New folder…
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => onName({ kind: "rename", path: node.path })}>Rename…</ContextMenuItem>
      <ContextMenuItem onSelect={onRefresh}>Refresh</ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem variant="destructive" onSelect={() => onDelete(node.path)}>
        Delete…
      </ContextMenuItem>
    </ContextMenuContent>
  );

  return (
    <div
      ref={tree.list}
      role="tree"
      aria-label="Project files"
      onScroll={tree.onScroll}
      className="min-h-0 flex-1 overflow-auto px-1.5 pb-2"
    >
      {rows.length === 0 && <p className="px-2 py-2 text-xs text-muted-foreground">No files.</p>}
      {rows.map(({ node, depth, shown }) => (
        <ContextMenu key={node.path}>
          <ContextMenuTrigger asChild>
            <button
              type="button"
              role="treeitem"
              aria-selected={node.path === selected}
              aria-expanded={node.directory ? shown : undefined}
              title={node.path}
              draggable={!node.directory}
              onDragStart={(event) => {
                event.dataTransfer.setData(FILE_REF_MIME, node.path);
                event.dataTransfer.setData("text/plain", node.path);
                event.dataTransfer.effectAllowed = "copy";
              }}
              onClick={() => (node.directory ? tree.toggle(node.path, shown) : onOpen(node.path))}
              style={{ paddingLeft: `${depth * 12 + 6}px` }}
              className={cn(
                "flex w-full items-center gap-1.5 rounded-sm py-(--row-py) pr-2 text-left text-sm",
                node.path === selected ? "bg-muted" : "hover:bg-muted/50",
                node.directory && "text-muted-foreground hover:text-foreground",
              )}
            >
              {node.directory ? (
                <>
                  <ChevronRightIcon className={cn("size-3.5 shrink-0 transition-transform", shown && "rotate-90")} />
                  {shown ? <FolderOpenIcon className="size-3.5 shrink-0" /> : <FolderIcon className="size-3.5 shrink-0" />}
                </>
              ) : (
                <FileIcon className="ml-5 size-3.5 shrink-0 text-muted-foreground" />
              )}
              <span className="truncate">{node.name}</span>
              {node.changed && (
                <span className="ml-auto size-1.5 shrink-0 rounded-full bg-amber-500" aria-label="Changed" />
              )}
            </button>
          </ContextMenuTrigger>
          {menu(node, shown)}
        </ContextMenu>
      ))}
    </div>
  );
}
