import type { PullRequestFile } from "@warpforge/protocol";
import { Checkbox } from "@warpforge/ui/components/checkbox";
import { ToggleGroup, ToggleGroupItem } from "@warpforge/ui/components/toggle-group";
import { cn } from "@warpforge/ui/lib/utils";
import { ChevronRightIcon } from "lucide-react";
import { useState } from "react";
import { buildFileTree, type FileTreeNode } from "../../lib/file-tree";
import { groupPullFiles } from "../../lib/pull-file-groups";
import { patchCounts, patchFileLabel, type PatchFileBlock } from "../../lib/pull-diff";
import { readPullFileView, writePullFileView, type PullFileView } from "../../lib/pull-file-view";
import { SearchField } from "./list-controls";

interface FileProps {
  active: string;
  viewed: ReadonlySet<string>;
  onSelect: (path: string) => void;
  onViewed: (path: string, checked: boolean) => void;
}

/** The files in a pull request diff, as a list, by kind, or as folders, each with a Viewed tick. */
export function PullDiffFiles({ blocks, ...props }: FileProps & { blocks: PatchFileBlock[] }) {
  const [view, setView] = useState<PullFileView>(readPullFileView);
  const [filter, setFilter] = useState("");
  const needle = filter.trim().toLowerCase();
  const shown = needle
    ? blocks.filter((block) =>
        `${block.path} ${block.oldPath ?? ""}`.toLowerCase().includes(needle),
      )
    : blocks;
  const byPath = new Map(blocks.map((block) => [block.path, block]));
  const files: PullRequestFile[] = blocks.map((block) => ({
    path: block.path,
    ...patchCounts(block),
  }));
  const groups = groupPullFiles(files);
  const tree = buildFileTree(files.map((file) => ({ changed: true, path: file.path })));

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <SearchField value={filter} onChange={setFilter} placeholder="Filter changed files" />
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          spacing={0}
          value={view}
          onValueChange={(next) => {
            if (!next) return;
            setView(next as PullFileView);
            writePullFileView(next as PullFileView);
          }}
          aria-label="Show files as"
        >
          <ToggleGroupItem value="list" className="px-2 text-xs">
            List
          </ToggleGroupItem>
          <ToggleGroupItem value="groups" className="px-2 text-xs">
            Groups
          </ToggleGroupItem>
          <ToggleGroupItem value="tree" className="px-2 text-xs">
            Tree
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div className="max-h-56 overflow-y-auto rounded-md border p-1">
        {needle && shown.length === 0 && (
          <p className="px-2 py-1 text-xs text-muted-foreground">No matching files.</p>
        )}
        {(needle || view === "list") &&
          shown.map((block) => (
            <DiffFile
              key={block.path || block.hunks[0]?.id}
              block={block}
              label={patchFileLabel(block)}
              {...props}
            />
          ))}
        {!needle &&
          view === "groups" &&
          groups.map((group) => (
            <div key={group.id} className="flex flex-col">
              <p className="px-2 pt-1 text-xs font-medium text-muted-foreground">
                {group.label} · +{group.additions} −{group.deletions}
              </p>
              {group.files.map((file) => {
                const block = byPath.get(file.path);
                if (!block) return null;
                return (
                  <DiffFile
                    key={file.path}
                    block={block}
                    label={
                      block.oldPath && block.oldPath !== block.path
                        ? patchFileLabel(block)
                        : file.name
                    }
                    hint={file.dir}
                    {...props}
                  />
                );
              })}
            </div>
          ))}
        {!needle && view === "tree" && (
          <DiffTree nodes={tree} byPath={byPath} depth={0} {...props} />
        )}
      </div>
    </div>
  );
}

function DiffFile({
  block,
  active,
  viewed,
  label,
  hint,
  onSelect,
  onViewed,
}: FileProps & { block: PatchFileBlock; label: string; hint?: string }) {
  const { additions, deletions } = patchCounts(block);
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-2 rounded-sm px-2 py-0.5 text-xs",
        block.path === active ? "bg-muted" : "hover:bg-muted/50",
      )}
    >
      <Checkbox
        aria-label={`Viewed ${block.path || "patch"}`}
        checked={viewed.has(block.path)}
        onCheckedChange={(checked) => onViewed(block.path, checked === true)}
      />
      <button
        type="button"
        onClick={() => onSelect(block.path)}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2 text-left",
          viewed.has(block.path) && "text-muted-foreground",
        )}
        title={block.path}
      >
        <span className="truncate font-mono">{label}</span>
        {hint && <span className="truncate text-muted-foreground">{hint}</span>}
        <span className="ml-auto shrink-0 font-mono tabular-nums">
          {additions > 0 && (
            <span className="text-emerald-600 dark:text-emerald-400">+{additions}</span>
          )}{" "}
          {deletions > 0 && <span className="text-red-600 dark:text-red-400">−{deletions}</span>}
        </span>
      </button>
    </div>
  );
}

function DiffTree({
  nodes,
  byPath,
  depth,
  ...props
}: FileProps & { nodes: FileTreeNode[]; byPath: Map<string, PatchFileBlock>; depth: number }) {
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const toggle = (path: string) =>
    setClosed((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  return (
    <ul className={cn(depth > 0 && "pl-3")}>
      {nodes.map((node) => {
        const block = byPath.get(node.path);
        return node.directory ? (
          <li key={node.path}>
            <button
              type="button"
              aria-expanded={!closed.has(node.path)}
              onClick={() => toggle(node.path)}
              className="flex items-center gap-1 px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <ChevronRightIcon
                className={cn("size-3 transition-transform", !closed.has(node.path) && "rotate-90")}
              />
              {node.name}
            </button>
            {!closed.has(node.path) && (
              <DiffTree nodes={node.children} byPath={byPath} depth={depth + 1} {...props} />
            )}
          </li>
        ) : (
          <li key={node.path}>
            {block ? (
              <DiffFile block={block} label={node.name} {...props} />
            ) : (
              <span className="px-2 text-xs">{node.name}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
