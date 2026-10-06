import { useMemo, useState, type ReactNode } from "react"
import { ChevronRightIcon, EllipsisIcon, FolderIcon, SlidersHorizontalIcon, Trash2Icon, Undo2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
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
} from "@/components/ui/dropdown-menu"
import { IGNORED, type ChangedFile } from "@/data/git"
import type { ProjectId } from "@/lib/projects"
import { cn } from "@/lib/utils"
import type { ConfirmRequest } from "@/components/common/confirm-dialog"
import type { GitActions, GitState } from "@/pages/changes/git-store"
import { patchText } from "@/pages/changes/patch"
import { groupKeys, groupState, STATUS_TONE, STATUS_WORD, treeRows, type GroupBy, type TreeRow } from "@/pages/changes/tree"

export type BundleMode = "shelf" | "stash"

interface Props {
  state: GitState
  project: ProjectId
  actions: GitActions
  selected?: string
  onSelect: (path: string) => void
  onBundle: (mode: BundleMode, paths: string[]) => void
  onConfirm: (request: ConfirmRequest) => void
  copy: (text: string, what: string) => void
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`

/**
 * Tracked changes and untracked files, grouped by folder, each with a
 * checkbox that decides what the next commit takes. Right-click any row for
 * everything else; discarding always asks first and names the files.
 */
export function StagingTree({ state, project, actions, selected, onSelect, onBundle, onConfirm, copy }: Props) {
  const [groupBy, setGroupBy] = useState<GroupBy>("folder")
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const [showIgnored, setShowIgnored] = useState(false)
  const checked = useMemo(() => new Set(state.checked), [state.checked])
  const rows = useMemo(() => treeRows(state.files, groupBy, collapsed), [state.files, groupBy, collapsed])
  const all = state.files.map((entry) => entry.path)
  const files = (paths: string[]) => state.files.filter((entry) => paths.includes(entry.path))

  const toggle = (key: string) =>
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const discard = (paths: string[]) => {
    const untracked = files(paths).filter((entry) => entry.status === "U").length
    onConfirm({
      title: paths.length === 1 ? `Discard changes in ${paths[0].split("/").at(-1)}?` : `Discard changes in ${plural(paths.length, "file")}?`,
      description: untracked
        ? `The edits are lost and ${plural(untracked, "untracked file")} ${untracked === 1 ? "is" : "are"} deleted from disk. This cannot be undone.`
        : "The files go back to the last commit. Your edits to them are lost; this cannot be undone.",
      items: paths,
      confirmLabel: paths.length === 1 ? "Discard changes" : `Discard ${plural(paths.length, "file")}`,
      destructive: true,
      onConfirm: () => actions.discard(paths),
    })
  }

  const menu = (row: TreeRow): ReactNode => {
    const paths = row.kind === "file" ? [row.file.path] : row.paths
    const untracked = files(paths).every((entry) => entry.status === "U")
    const on = groupState(paths, checked) === true
    return (
      <ContextMenuContent className="w-56">
        <ContextMenuItem onSelect={() => actions.check(paths, !on)}>{on ? "Uncheck" : "Check"}{row.kind === "file" ? "" : ` ${plural(paths.length, "file")}`}</ContextMenuItem>
        {row.kind === "file" && <ContextMenuItem onSelect={() => onSelect(row.file.path)}>Show diff</ContextMenuItem>}
        {untracked && (
          <>
            <ContextMenuItem onSelect={() => actions.addToGit(paths)}>Add to git</ContextMenuItem>
            <ContextMenuItem onSelect={() => actions.ignore(paths)}>Add to .gitignore</ContextMenuItem>
          </>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => onBundle("shelf", paths)}>Shelve…</ContextMenuItem>
        <ContextMenuItem onSelect={() => onBundle("stash", paths)}>Stash…</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => copy(paths.join("\n"), paths.length === 1 ? "path" : "paths")}>Copy {paths.length === 1 ? "path" : "paths"}</ContextMenuItem>
        {row.kind === "file" && <ContextMenuItem onSelect={() => copy(patchText(row.file), "patch")}>Copy as patch</ContextMenuItem>}
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onSelect={() => discard(paths)}>
          {untracked && row.kind === "file" ? "Delete file…" : row.kind === "file" ? "Discard changes…" : `Discard ${plural(paths.length, "file")}…`}
        </ContextMenuItem>
      </ContextMenuContent>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 px-3 pt-1 pb-1.5">
        <Checkbox
          aria-label="Check every file"
          disabled={!all.length}
          checked={all.length ? groupState(all, checked) : false}
          onCheckedChange={(value) => actions.check(all, value === true)}
        />
        <span className="text-xs text-muted-foreground tabular-nums">
          {all.length ? `${state.checked.length} of ${plural(all.length, "file")}` : "No changes"}
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
              <DropdownMenuRadioGroup value={groupBy} onValueChange={(value) => setGroupBy(value as GroupBy)}>
                <DropdownMenuRadioItem value="folder">Folder</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="flat">Flat list</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setCollapsed(new Set())}>Expand all</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setCollapsed(new Set(groupKeys(state.files)))}>Collapse all</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem checked={showIgnored} onCheckedChange={(value) => setShowIgnored(value === true)}>
                Show ignored files
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs" aria-label="Checked files" disabled={!state.checked.length}>
                <EllipsisIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>{plural(state.checked.length, "checked file")}</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => onBundle("shelf", state.checked)}>Shelve…</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onBundle("stash", state.checked)}>Stash…</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => discard(state.checked)}>
                Discard {plural(state.checked.length, "file")}…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div role="tree" aria-label="Changed files" className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
        {rows.map((row) => (
          <ContextMenu key={row.key}>
            <ContextMenuTrigger asChild>
              <div>
                <Row
                  row={row}
                  checked={checked}
                  selected={row.kind === "file" && row.file.path === selected}
                  collapsed={collapsed.has(row.key)}
                  onToggle={() => toggle(row.key)}
                  onCheck={(paths, on) => actions.check(paths, on)}
                  onSelect={onSelect}
                  onDiscard={discard}
                />
              </div>
            </ContextMenuTrigger>
            {menu(row)}
          </ContextMenu>
        ))}
        {showIgnored && <IgnoredList paths={IGNORED[project] ?? []} />}
      </div>
    </div>
  )
}

function Row({
  row,
  checked,
  selected,
  collapsed,
  onToggle,
  onCheck,
  onSelect,
  onDiscard,
}: {
  row: TreeRow
  checked: ReadonlySet<string>
  selected: boolean
  collapsed: boolean
  onToggle: () => void
  onCheck: (paths: string[], on: boolean) => void
  onSelect: (path: string) => void
  onDiscard: (paths: string[]) => void
}) {
  const paths = row.kind === "file" ? [row.file.path] : row.paths
  const state = groupState(paths, checked)
  return (
    <div
      role="treeitem"
      aria-selected={selected}
      aria-expanded={row.kind === "file" ? undefined : !collapsed}
      style={{ paddingLeft: `${row.depth * 12 + 6}px` }}
      className={cn("group/row flex items-center gap-1.5 rounded-sm py-(--row-py) pr-1 text-sm", selected ? "bg-muted" : "hover:bg-muted/50")}
    >
      <Checkbox
        aria-label={`${state === true ? "Uncheck" : "Check"} ${row.label}`}
        checked={state}
        onCheckedChange={() => onCheck(paths, state !== true)}
      />
      {row.kind === "file" ? (
        <FileLine file={row.file} label={row.label} onSelect={() => onSelect(row.file.path)} onDiscard={() => onDiscard(paths)} />
      ) : (
        <button type="button" onClick={onToggle} className={cn("flex min-w-0 flex-1 items-center gap-1 text-left", row.kind === "section" ? "font-medium" : "text-muted-foreground hover:text-foreground")}>
          <ChevronRightIcon className={cn("size-3.5 shrink-0 transition-transform", !collapsed && "rotate-90")} />
          <span className="truncate" title={row.label}>{row.label}</span>
          <span className="shrink-0 text-xs font-normal text-muted-foreground tabular-nums">{row.paths.length}</span>
        </button>
      )}
    </div>
  )
}

function FileLine({ file, label, onSelect, onDiscard }: { file: ChangedFile; label: string; onSelect: () => void; onDiscard: () => void }) {
  return (
    <>
      <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-1.5 text-left" title={file.from ? `${file.from} → ${file.path}` : file.path}>
        <span className={cn("w-3 shrink-0 text-center font-mono text-xs font-medium", STATUS_TONE[file.status])} title={STATUS_WORD[file.status]}>
          {file.status}
        </span>
        <span className={cn("truncate", file.status === "D" && "text-muted-foreground line-through")}>{label}</span>
        <span className="ml-auto shrink-0 pl-1 font-mono text-xs tabular-nums">
          {file.additions > 0 && <span className="text-emerald-600 dark:text-emerald-400">+{file.additions}</span>}
          {file.additions > 0 && file.deletions > 0 && " "}
          {file.deletions > 0 && <span className="text-red-600 dark:text-red-400">−{file.deletions}</span>}
        </span>
      </button>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={file.status === "U" ? `Delete ${label}…` : `Discard changes in ${label}…`}
        onClick={onDiscard}
        className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100"
      >
        {file.status === "U" ? <Trash2Icon /> : <Undo2Icon />}
      </Button>
    </>
  )
}

/** Ignored paths are listed, never checked: a commit cannot take them. Whole ignored folders are one row. */
function IgnoredList({ paths }: { paths: string[] }) {
  const folders = paths.filter((path) => path.endsWith("/")).length
  return (
    <div className="mt-2 border-t pt-2">
      <p className="px-2 pb-1 text-xs font-medium text-muted-foreground">
        Ignored · {plural(folders, "folder")}, {plural(paths.length - folders, "file")}
      </p>
      {paths.length === 0 && <p className="px-2 text-xs text-muted-foreground">Nothing is ignored here.</p>}
      {paths.map((path) => (
        <div key={path} className="flex items-center gap-1.5 rounded-sm px-2 py-(--row-py) text-sm text-muted-foreground" title={path.endsWith("/") ? `${path} is ignored as a whole` : path}>
          {path.endsWith("/") && <FolderIcon className="size-3.5 shrink-0" />}
          <span className="truncate font-mono text-xs">{path}</span>
        </div>
      ))}
    </div>
  )
}
