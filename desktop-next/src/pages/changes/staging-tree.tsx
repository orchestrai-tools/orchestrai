import type { GitRoot } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import { Checkbox } from "@warpforge/ui/components/checkbox";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@warpforge/ui/components/context-menu";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@warpforge/ui/components/dropdown-menu";
import { EllipsisIcon, SlidersHorizontalIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { ConfirmRequest } from "../../components/common/confirm-dialog";
import { useIgnoredFiles } from "../../components/ignored-files";
import { toUnifiedPatch } from "../../lib/file-patch";
import type { RepoTarget } from "../../lib/repo-target";
import { useDeleteFileAsk } from "../../lib/shelf-palette";
import { useShell } from "../../lib/shell-store";
import { copyText, discardRequest, trackPaths } from "./file-ops";
import { IgnoredList } from "./ignored-list";
import { groupKeys, groupState, plural, treeRows, type ChangedFile, type TreeRow } from "./tree";
import { TreeRowView } from "./tree-row";
import type { BundleMode } from "./use-changes";

interface Props {
  target: RepoTarget;
  files: ChangedFile[];
  roots: GitRoot[];
  checked: string[];
  flat: boolean;
  setFlat: (flat: boolean) => void;
  selected?: string;
  onSelect: (path: string) => void;
  onCheck: (paths: string[], on: boolean) => void;
  onBundle?: (mode: BundleMode, paths: string[]) => void;
  onConfirm: (request: ConfirmRequest) => void;
  onRefresh: () => void;
}

/**
 * Tracked changes and untracked files, grouped by folder, each with a
 * checkbox that decides what the next commit takes. Right-click any row for
 * everything else; discarding always asks first and names the files.
 */
export function StagingTree({
  target,
  files,
  roots,
  checked: checkedList,
  flat,
  setFlat,
  selected,
  onSelect,
  onCheck,
  onBundle,
  onConfirm,
  onRefresh,
}: Props) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const showIgnored = useIgnoredFiles((state) => state.open);
  const checked = useMemo(() => new Set(checkedList), [checkedList]);
  const rows = useMemo(
    () => treeRows(files, roots, flat, collapsed),
    [files, roots, flat, collapsed],
  );
  const all = files.map((entry) => entry.path);
  const entries = (paths: string[]) => files.filter((entry) => paths.includes(entry.path));
  const discard = (paths: string[]) => onConfirm(discardRequest(target, entries(paths), onRefresh));

  const askedDelete = useDeleteFileAsk((state) => state.path);
  useEffect(() => {
    if (!askedDelete) return;
    const entry = files.find((file) => file.path === askedDelete);
    if (entry) onConfirm(discardRequest(target, [entry], onRefresh));
    useDeleteFileAsk.getState().clear();
  }, [askedDelete, files, target, onConfirm, onRefresh]);

  const toggle = (key: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const menu = (row: TreeRow) => {
    const paths = row.kind === "file" ? [row.file.path] : row.paths;
    const untracked = entries(paths).every((entry) => entry.untracked);
    const on = groupState(paths, checked) === true;
    return (
      <ContextMenuContent className="w-56">
        <ContextMenuItem onSelect={() => onCheck(paths, !on)}>
          {on ? "Uncheck" : "Check"}
          {row.kind === "file" ? "" : ` ${plural(paths.length, "file")}`}
        </ContextMenuItem>
        {row.kind === "file" && (
          <>
            <ContextMenuItem onSelect={() => onSelect(row.file.path)}>Show diff</ContextMenuItem>
            <ContextMenuItem
              onSelect={() => useShell.getState().setFileJump({ path: row.file.path, line: 0 })}
            >
              Jump to source
            </ContextMenuItem>
          </>
        )}
        {untracked && (
          <>
            <ContextMenuItem onSelect={() => void trackPaths(target, paths, "git.add", onRefresh)}>
              Add to git
            </ContextMenuItem>
            <ContextMenuItem
              onSelect={() => void trackPaths(target, paths, "git.ignore", onRefresh)}
            >
              Add to .gitignore
            </ContextMenuItem>
          </>
        )}
        {onBundle && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => onBundle("shelf", paths)}>Shelve…</ContextMenuItem>
            <ContextMenuItem onSelect={() => onBundle("stash", paths)}>Stash…</ContextMenuItem>
          </>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={() => copyText(paths.join("\n"), paths.length === 1 ? "path" : "paths")}
        >
          Copy {paths.length === 1 ? "path" : "paths"}
        </ContextMenuItem>
        {row.kind === "file" && (
          <ContextMenuItem onSelect={() => copyText(toUnifiedPatch(row.file.diff), "patch")}>
            Copy as patch
          </ContextMenuItem>
        )}
        <ContextMenuItem onSelect={onRefresh}>Refresh</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onSelect={() => discard(paths)}>
          {untracked && row.kind === "file"
            ? "Delete file…"
            : row.kind === "file"
              ? "Discard changes…"
              : `Discard ${plural(paths.length, "file")}…`}
        </ContextMenuItem>
      </ContextMenuContent>
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 px-3 pt-1 pb-1.5">
        <Checkbox
          aria-label="Check every file"
          disabled={!all.length}
          checked={all.length ? groupState(all, checked) : false}
          onCheckedChange={(value) => onCheck(all, value === true)}
        />
        <span className="text-xs text-muted-foreground tabular-nums">
          {all.length ? `${checkedList.length} of ${plural(all.length, "file")}` : "No changes"}
        </span>
        <div className="ml-auto flex items-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs" aria-label="View options">
                <SlidersHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>Group by</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={flat ? "flat" : "folder"}
                onValueChange={(value) => setFlat(value === "flat")}
              >
                <DropdownMenuRadioItem value="folder">Folder</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="flat">Flat list</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setCollapsed(new Set())}>
                Expand all
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setCollapsed(new Set(groupKeys(files, roots)))}>
                Collapse all
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={showIgnored}
                onCheckedChange={(value) =>
                  value ? useIgnoredFiles.getState().show() : useIgnoredFiles.getState().hide()
                }
              >
                Show ignored files
              </DropdownMenuCheckboxItem>
              <DropdownMenuItem onSelect={onRefresh}>Refresh</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Checked files"
                disabled={!checkedList.length}
              >
                <EllipsisIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>{plural(checkedList.length, "checked file")}</DropdownMenuLabel>
              {onBundle && (
                <>
                  <DropdownMenuItem onSelect={() => onBundle("shelf", checkedList)}>
                    Shelve…
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onBundle("stash", checkedList)}>
                    Stash…
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem variant="destructive" onSelect={() => discard(checkedList)}>
                Discard {plural(checkedList.length, "file")}…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div
        role="tree"
        aria-label="Changed files"
        className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2"
      >
        {rows.map((row) => (
          <ContextMenu key={row.key}>
            <ContextMenuTrigger asChild>
              <div>
                <TreeRowView
                  row={row}
                  checked={checked}
                  selected={row.kind === "file" && row.file.path === selected}
                  collapsed={collapsed.has(row.key)}
                  onToggle={() => toggle(row.key)}
                  onCheck={onCheck}
                  onSelect={onSelect}
                  onDiscard={discard}
                />
              </div>
            </ContextMenuTrigger>
            {menu(row)}
          </ContextMenu>
        ))}
        {showIgnored && <IgnoredList target={target} />}
      </div>
    </div>
  );
}
