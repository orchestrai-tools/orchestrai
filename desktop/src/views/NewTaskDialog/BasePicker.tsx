import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, GitFork, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  pickableBranches,
  pickableRemotes,
  sameWorktreeBase,
  worktreeBaseLabel,
} from "@/lib/worktreeBase";

import { daemon } from "../../daemon";
import type { GitBranchList, WorktreeBase } from "../../protocol";
import { CHIP } from "./chips";

type Tab = "new" | "existing" | "pr";

const TABS: { id: Tab; label: string }[] = [
  { id: "new", label: "New branch" },
  { id: "existing", label: "Existing branch" },
  { id: "pr", label: "Pull request" },
];

interface Row {
  key: string;
  label: string;
  hint?: string;
  value: WorktreeBase | null;
  disabled?: boolean;
}

function tabOf(value: WorktreeBase | null): Tab {
  if (value?.kind === "existing") return "existing";
  if (value?.kind === "pullRequest") return "pr";
  return "new";
}

/**
 * Where the task's worktree starts: a new branch (from the current branch,
 * another local branch, or origin's latest), an existing branch, or a pull
 * request's branch. One control, so New Task keeps a single row of chips.
 */
export function BasePicker({
  branches,
  onChange,
  project,
  value,
}: {
  branches: GitBranchList | undefined;
  onChange: (next: WorktreeBase | null) => void;
  project: string;
  value: WorktreeBase | null;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>(tabOf(value));
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const current = branches?.current ?? null;

  const pulls = useQuery({
    enabled: open && tab === "pr" && !!project,
    queryFn: () => daemon.listPulls(project, { limit: 50 }),
    queryKey: ["pulls", "worktreeBase", project],
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!open) return;
    // The menu focuses itself on open; the search box has to win after that.
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open, tab]);

  const rows = useMemo<Row[]>(() => {
    const local = pickableBranches(branches);
    if (tab === "new") {
      return [
        {
          hint: current ?? undefined,
          key: "current",
          label: "Current branch",
          value: null,
        },
        {
          hint: "fetches first",
          key: "origin",
          label: "Latest from origin",
          value: { kind: "origin" },
        },
        ...local
          .filter((branch) => branch !== current)
          .map((branch) => ({
            key: "b:" + branch,
            label: branch,
            value: { kind: "branch", name: branch } as WorktreeBase,
          })),
      ];
    }
    if (tab === "existing") {
      return [
        ...local.map((branch) => ({
          disabled: branch === current,
          hint: branch === current ? "checked out in the project" : undefined,
          key: "e:" + branch,
          label: branch,
          value: { branch, kind: "existing" } as WorktreeBase,
        })),
        ...pickableRemotes(branches).map((ref) => ({
          key: "r:" + ref,
          label: ref,
          value: { branch: ref, kind: "existing" } as WorktreeBase,
        })),
      ];
    }
    return (pulls.data ?? []).map((pr) => ({
      hint: pr.headRefName,
      key: "pr:" + pr.number,
      label: "#" + pr.number + " " + pr.title,
      value: { kind: "pullRequest", number: pr.number } as WorktreeBase,
    }));
  }, [branches, current, pulls.data, tab]);

  const needle = search.trim().toLowerCase();
  const visible = needle
    ? rows.filter((row) => (row.label + " " + (row.hint ?? "")).toLowerCase().includes(needle))
    : rows;

  let empty = "No matches";
  if (tab === "pr" && pulls.isLoading) empty = "Loading pull requests…";
  else if (tab === "pr" && pulls.error) {
    empty = pulls.error instanceof Error ? pulls.error.message : String(pulls.error);
  } else if (!needle && rows.length === 0) {
    empty = tab === "pr" ? "No open pull requests" : "No other branches";
  }

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setTab(tabOf(value));
          setSearch("");
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Worktree base"
          title="Where the worktree starts"
          className={CHIP}
        >
          <GitFork aria-hidden className="size-3 shrink-0" />
          <span className="max-w-40 truncate">{worktreeBaseLabel(value, current)}</span>
          <ChevronDown aria-hidden className="size-3 shrink-0 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80 p-0">
        <div role="tablist" aria-label="Start from" className="flex gap-0.5 border-b p-1">
          {TABS.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              role="tab"
              aria-selected={tab === candidate.id}
              onClick={() => {
                setTab(candidate.id);
                setSearch("");
              }}
              className={cn(
                "h-6 flex-1 rounded px-1.5 text-[12px] transition-colors",
                tab === candidate.id
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {candidate.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 border-b px-2 py-1.5">
          <Search aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            // Typed letters would otherwise jump focus to a matching item.
            onKeyDown={(event) => {
              if (event.key !== "Escape") event.stopPropagation();
            }}
            placeholder={tab === "pr" ? "Search pull requests" : "Search branches"}
            aria-label="Search"
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
          />
        </label>
        <div className="max-h-72 overflow-y-auto p-1">
          {visible.length === 0 ? (
            <p className="px-2 py-1.5 text-[13px] text-muted-foreground">{empty}</p>
          ) : (
            visible.map((row) => (
              <DropdownMenuItem
                key={row.key}
                disabled={row.disabled}
                className="text-[13px]"
                onSelect={() => onChange(row.value)}
              >
                <Check
                  aria-hidden
                  className={cn(
                    "size-3.5 shrink-0",
                    sameWorktreeBase(row.value, value) ? "" : "opacity-0",
                  )}
                />
                <span className="min-w-0 flex-1 truncate">{row.label}</span>
                {row.hint && (
                  <span className="max-w-32 shrink-0 truncate text-[11px] text-muted-foreground">
                    {row.hint}
                  </span>
                )}
              </DropdownMenuItem>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
