import { Button } from "@warpforge/ui/components/button";
import { Checkbox } from "@warpforge/ui/components/checkbox";
import { cn } from "@warpforge/ui/lib/utils";
import { ChevronRightIcon, Trash2Icon, Undo2Icon } from "lucide-react";

import { groupState, STATUS_TONE, STATUS_WORD, type ChangedFile, type TreeRow } from "./tree";

/** One staging-tree row: a section, a folder, or a changed file with its checkbox. */
export function TreeRowView({
  row,
  checked,
  selected,
  collapsed,
  onToggle,
  onCheck,
  onSelect,
  onDiscard,
}: {
  row: TreeRow;
  checked: ReadonlySet<string>;
  selected: boolean;
  collapsed: boolean;
  onToggle: () => void;
  onCheck: (paths: string[], on: boolean) => void;
  onSelect: (path: string) => void;
  onDiscard: (paths: string[]) => void;
}) {
  const paths = row.kind === "file" ? [row.file.path] : row.paths;
  const state = groupState(paths, checked);
  return (
    <div
      role="treeitem"
      aria-selected={selected}
      aria-expanded={row.kind === "file" ? undefined : !collapsed}
      style={{ paddingLeft: `${row.depth * 12 + 6}px` }}
      className={cn(
        "group/row flex items-center gap-1.5 rounded-sm py-(--row-py) pr-1 text-sm",
        selected ? "bg-muted" : "hover:bg-muted/50",
      )}
    >
      <Checkbox
        aria-label={`${state === true ? "Uncheck" : "Check"} ${row.label}`}
        checked={state}
        onCheckedChange={() => onCheck(paths, state !== true)}
      />
      {row.kind === "file" ? (
        <FileLine
          file={row.file}
          label={row.label}
          onSelect={() => onSelect(row.file.path)}
          onDiscard={() => onDiscard(paths)}
        />
      ) : (
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-1 text-left",
            row.kind === "section" ? "font-medium" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <ChevronRightIcon
            className={cn("size-3.5 shrink-0 transition-transform", !collapsed && "rotate-90")}
          />
          <span className="truncate" title={row.label}>
            {row.label}
          </span>
          <span className="shrink-0 text-xs font-normal text-muted-foreground tabular-nums">
            {row.paths.length}
          </span>
        </button>
      )}
    </div>
  );
}

function FileLine({
  file,
  label,
  onSelect,
  onDiscard,
}: {
  file: ChangedFile;
  label: string;
  onSelect: () => void;
  onDiscard: () => void;
}) {
  const from = file.diff.oldPath && file.diff.oldPath !== file.path ? file.diff.oldPath : null;
  return (
    <>
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        title={from ? `${from} → ${file.path}` : file.path}
      >
        <span
          className={cn(
            "w-3 shrink-0 text-center font-mono text-xs font-medium",
            STATUS_TONE[file.status],
          )}
          title={STATUS_WORD[file.status]}
        >
          {file.status}
        </span>
        <span
          className={cn("truncate", file.status === "D" && "text-muted-foreground line-through")}
        >
          {label}
        </span>
        <span className="ml-auto shrink-0 pl-1 font-mono text-xs tabular-nums">
          {file.additions > 0 && (
            <span className="text-emerald-600 dark:text-emerald-400">+{file.additions}</span>
          )}
          {file.additions > 0 && file.deletions > 0 && " "}
          {file.deletions > 0 && (
            <span className="text-red-600 dark:text-red-400">−{file.deletions}</span>
          )}
        </span>
      </button>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={file.untracked ? `Delete ${label}…` : `Discard changes in ${label}…`}
        onClick={onDiscard}
        className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100"
      >
        {file.untracked ? <Trash2Icon /> : <Undo2Icon />}
      </Button>
    </>
  );
}
