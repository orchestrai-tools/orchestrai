import { Button } from "@warpforge/ui/components/button";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@warpforge/ui/components/command";
import { Popover, PopoverContent, PopoverTrigger } from "@warpforge/ui/components/popover";
import { cn } from "@warpforge/ui/lib/utils";
import {
  ArrowLeftIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  GitBranchIcon,
  Loader2Icon,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  branchRows,
  buildBranchTree,
  defaultOpenFolders,
  type BranchRow,
} from "../../lib/branch-tree";
import { branchActions, type BranchAction, type BranchContext } from "./branch-actions";
import { RowSkeletons } from "./row-skeletons";

interface Props {
  ctx: BranchContext;
  local: string[];
  remotes: string[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  /** The git action in flight; every other action waits until it settles. */
  pending: string | null;
  /** Actions above the branch list, searched along with the branches. */
  actions: BranchAction[];
}

type Page = { branch: string; remote: boolean; query: string };

/** Searchable branches grouped into `/` folders, local then remote; picking one lists what can be done with it. */
export function BranchPicker({
  ctx,
  local,
  remotes,
  loading,
  error,
  onRetry,
  pending,
  actions,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState<Page | null>(null);
  const [openLocal, setOpenLocal] = useState<Set<string> | null>(null);
  const [openRemote, setOpenRemote] = useState<Set<string> | null>(null);
  const localOpen = useMemo(
    () => openLocal ?? defaultOpenFolders(buildBranchTree(local)),
    [openLocal, local],
  );
  const remoteOpen = useMemo(
    () => openRemote ?? defaultOpenFolders(buildBranchTree(remotes)),
    [openRemote, remotes],
  );
  const localRows = useMemo(() => branchRows(local, query, localOpen), [local, query, localOpen]);
  const remoteRows = useMemo(
    () => branchRows(remotes, query, remoteOpen),
    [remotes, query, remoteOpen],
  );
  const needle = query.trim().toLowerCase();
  const matches = (label: string) => !needle || label.toLowerCase().includes(needle);

  function close() {
    setOpen(false);
    setQuery("");
    setPage(null);
  }
  function back() {
    setQuery(page?.query ?? "");
    setPage(null);
  }
  function openBranch(branch: string, remote: boolean) {
    setPage({ branch, remote, query });
    setQuery("");
  }
  function pick(action: BranchAction) {
    close();
    action.run();
  }
  const toggle = (remote: boolean, key: string) => {
    const set = remote ? setOpenRemote : setOpenLocal;
    const next = new Set(remote ? remoteOpen : localOpen);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    set(next);
  };

  const shownActions = actions.filter((action) => matches(action.label));
  const rowActions = page
    ? branchActions(ctx, page.branch, page.remote).filter((action) => matches(action.label))
    : [];
  const nothing =
    !loading && !error && needle && !shownActions.length && !localRows.length && !remoteRows.length;

  return (
    <Popover open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="xs"
          className="-ml-2 font-mono text-foreground"
          title={pending ? `${pending}…` : "Branches and git actions"}
        >
          {pending ? <Loader2Icon className="animate-spin" /> : <GitBranchIcon />}
          {ctx.current || "No branch"}
          <ChevronDownIcon className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(420px,calc(100vw-1rem))] gap-0 p-0"
        onEscapeKeyDown={(event) => {
          if (!page) return;
          event.preventDefault();
          back();
        }}
      >
        <Command shouldFilter={false} loop>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={page ? `Actions for ${page.branch}` : "Search branches and actions"}
            onKeyDown={(event) => {
              if (event.key !== "Backspace" || query || !page) return;
              event.preventDefault();
              back();
            }}
          />
          {pending && (
            <p className="flex items-center gap-2 border-b px-3 py-1.5 text-xs text-muted-foreground">
              <Loader2Icon className="size-3 animate-spin" />
              {pending}… other git actions wait for it.
            </p>
          )}
          <CommandList className="max-h-[min(480px,calc(100vh-8rem))]">
            {page ? (
              <CommandGroup heading={<span className="font-mono">{page.branch}</span>}>
                <CommandItem value="back" onSelect={back}>
                  <ArrowLeftIcon />
                  All branches
                </CommandItem>
                {rowActions.map((action) => (
                  <CommandItem
                    key={action.id}
                    value={action.id}
                    disabled={action.disabled || (Boolean(pending) && action.id !== "copy")}
                    onSelect={() => pick(action)}
                    className={cn(action.destructive && "text-red-600 dark:text-red-400")}
                  >
                    {action.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : (
              <>
                {shownActions.length > 0 && (
                  <>
                    <CommandGroup heading="Actions">
                      {shownActions.map((action) => (
                        <CommandItem
                          key={action.id}
                          value={`action:${action.id}`}
                          disabled={action.disabled || (Boolean(pending) && action.id !== "copy")}
                          onSelect={() => pick(action)}
                        >
                          {action.label}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                    <CommandSeparator />
                  </>
                )}
                {error ? (
                  <div className="flex flex-col gap-2 px-3 py-2 text-xs">
                    <p className="text-red-600 dark:text-red-400">Branches did not load: {error}</p>
                    <Button
                      variant="outline"
                      size="xs"
                      className="self-start"
                      onClick={onRetry}
                      disabled={loading}
                    >
                      {loading ? "Retrying…" : "Retry"}
                    </Button>
                  </div>
                ) : loading && !local.length ? (
                  <RowSkeletons label="Loading branches" className="px-3 py-2" />
                ) : (
                  <>
                    <Section
                      title="Local branches"
                      rows={localRows}
                      current={ctx.current}
                      busy={ctx.busyBranches}
                      onToggle={(key) => toggle(false, key)}
                      onPick={(branch) => openBranch(branch, false)}
                    />
                    {remoteRows.length > 0 && (
                      <Section
                        title="Remote branches"
                        remote
                        rows={remoteRows}
                        current={ctx.current}
                        busy={[]}
                        onToggle={(key) => toggle(true, key)}
                        onPick={(branch) => openBranch(branch, true)}
                      />
                    )}
                  </>
                )}
                {nothing && (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No matching branches
                  </p>
                )}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function Section({
  title,
  rows,
  remote = false,
  current,
  busy,
  onToggle,
  onPick,
}: {
  title: string;
  rows: BranchRow[];
  remote?: boolean;
  current: string;
  busy: string[];
  onToggle: (key: string) => void;
  onPick: (branch: string) => void;
}) {
  if (!rows.length) return null;
  const section = remote ? "remote" : "local";
  return (
    <CommandGroup heading={title}>
      {rows.map((row) => {
        const indent = { paddingLeft: `${row.depth * 12 + 8}px` };
        if (!row.branch) {
          const isOpen = row.fKey ? !rowCollapsed(rows, row) : false;
          return (
            <CommandItem
              key={row.key}
              value={`${section}:${row.key}`}
              onSelect={() => row.fKey && onToggle(row.fKey)}
              className="text-muted-foreground"
              style={indent}
            >
              <ChevronRightIcon
                className={cn("size-3 transition-transform", isOpen && "rotate-90")}
              />
              <span className="truncate">{row.label}</span>
            </CommandItem>
          );
        }
        const isCurrent = !remote && row.branch === current;
        const taken = !remote && !isCurrent && busy.includes(row.branch);
        return (
          <CommandItem
            key={row.key}
            value={`${section}:${row.key}`}
            onSelect={() => onPick(row.branch!)}
            title={row.branch}
            className={cn("font-mono text-xs", isCurrent && "bg-accent/60")}
            style={indent}
          >
            {remote ? (
              <GitBranchIcon className="size-3.5" />
            ) : (
              <span className="size-3" aria-hidden />
            )}
            <span className="min-w-0 flex-1 truncate">{row.label}</span>
            {taken && <span className="font-sans text-muted-foreground">in a worktree</span>}
            {isCurrent && <CheckIcon className="size-3.5 text-foreground" />}
          </CommandItem>
        );
      })}
    </CommandGroup>
  );
}

/** A folder is open exactly when the row after it sits one level deeper. */
function rowCollapsed(rows: BranchRow[], row: BranchRow): boolean {
  const next = rows[rows.indexOf(row) + 1];
  return !next || next.depth <= row.depth;
}
