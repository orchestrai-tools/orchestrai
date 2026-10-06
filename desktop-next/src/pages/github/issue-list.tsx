import type { BacklogItem } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import { cn } from "@warpforge/ui/lib/utils";
import { ExternalLinkIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { runStatus, StatusDot, STATUS_LABEL } from "../../components/common/status-mark";
import { isTypingTarget, listStep } from "../../lib/editor-nav";
import { openExternalLink } from "../../lib/external-link";
import { useDaemon } from "../../lib/use-daemon";
import { issueClosed, issueColumn, issueTask } from "./issue-meta";
import { FilterBar, FilterMenu, ListSkeletonRows, SearchField } from "./list-controls";
import { ago } from "./pull-meta";

interface Filters {
  query: string;
  state: "open" | "closed" | "all";
  assignee: string;
  linked: "any" | "task" | "none";
  sort: "recent" | "oldest";
}

const IDLE: Filters = {
  query: "",
  state: "open",
  assignee: "anyone",
  linked: "any",
  sort: "recent",
};

interface Props {
  issues: BacklogItem[];
  loading: boolean;
  started: Record<string, string>;
  selected?: string;
  onSelect: (issue: BacklogItem) => void;
  onStart: (issue: BacklogItem) => void;
  onOpenTask: (id: string) => void;
}

/** GitHub issues the backlog imported. Any of them can become a task, and then each names the other. */
export function IssueList({
  issues,
  loading,
  started,
  selected,
  onSelect,
  onStart,
  onOpenTask,
}: Props) {
  const tasks = useDaemon().snapshot.tasks;
  const [filters, setFilters] = useState<Filters>(IDLE);
  const set = (patch: Partial<Filters>) => setFilters((current) => ({ ...current, ...patch }));
  const assignees = [
    ...new Set(issues.flatMap((issue) => (issue.assignee ? [issue.assignee] : []))),
  ].sort();
  const rows = useMemo(() => {
    const needle = filters.query.trim().toLowerCase();
    return issues
      .filter((issue) => {
        const closed = issueClosed(issue);
        const linked = Boolean(issue.taskId || started[issue.id]);
        if (filters.state === "open" && closed) return false;
        if (filters.state === "closed" && !closed) return false;
        if (filters.assignee === "none" && issue.assignee) return false;
        if (!["anyone", "none"].includes(filters.assignee) && issue.assignee !== filters.assignee)
          return false;
        if (filters.linked === "task" && !linked) return false;
        if (filters.linked === "none" && linked) return false;
        return (
          !needle ||
          [issue.title, `#${issue.number}`, issue.assignee ?? ""]
            .join(" ")
            .toLowerCase()
            .includes(needle)
        );
      })
      .sort((a, b) =>
        filters.sort === "recent" ? b.updatedAt - a.updatedAt : a.updatedAt - b.updatedAt,
      );
  }, [issues, filters, started]);
  const narrowed = JSON.stringify({ ...filters, sort: IDLE.sort }) !== JSON.stringify(IDLE);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return;
      if (event.target instanceof HTMLElement && event.target.closest("[role=menu]")) return;
      const step = listStep(event.key);
      if (!step || rows.length === 0) return;
      event.preventDefault();
      const index = rows.findIndex((issue) => issue.id === selected);
      const next = rows[Math.min(rows.length - 1, Math.max(0, (index < 0 ? 0 : index) + step))];
      if (next) onSelect(next);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rows, selected, onSelect]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <FilterBar
        onReset={narrowed ? () => setFilters({ ...IDLE, sort: filters.sort }) : undefined}
        sort={
          <FilterMenu
            label="Sort"
            idle="recent"
            value={filters.sort}
            onChange={(sort) => set({ sort })}
            options={[
              { value: "recent", label: "Recently updated" },
              { value: "oldest", label: "Least recently updated" },
            ]}
          />
        }
      >
        <SearchField
          value={filters.query}
          onChange={(query) => set({ query })}
          placeholder="Filter issues"
        />
        <FilterMenu
          label="State"
          idle="open"
          value={filters.state}
          onChange={(state) => set({ state })}
          options={[
            { value: "open", label: "Open" },
            { value: "closed", label: "Closed" },
            { value: "all", label: "All" },
          ]}
        />
        <FilterMenu
          label="Assignee"
          idle="anyone"
          value={filters.assignee}
          onChange={(assignee) => set({ assignee })}
          options={[
            { value: "anyone", label: "Anyone" },
            { value: "none", label: "Nobody" },
            ...(assignees.length ? ["separator" as const] : []),
            ...assignees.map((login) => ({ value: login, label: login })),
          ]}
        />
        <FilterMenu
          label="Task"
          idle="any"
          value={filters.linked}
          onChange={(linked) => set({ linked })}
          options={[
            { value: "any", label: "With or without" },
            { value: "task", label: "Has a task" },
            { value: "none", label: "No task yet" },
          ]}
        />
      </FilterBar>
      <div
        role="list"
        aria-label="Issues, J and K move"
        className="@container min-h-0 flex-1 overflow-y-auto px-2 pb-4"
      >
        {loading && issues.length === 0 && <ListSkeletonRows label="Loading issues" />}
        {!loading && rows.length === 0 && (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            {issues.length === 0
              ? "No GitHub issues in the backlog. Connect GitHub in Settings to import them."
              : "No issue matches these filters."}
          </p>
        )}
        {rows.map((issue) => {
          const link = issueTask(issue, tasks, started);
          const closed = issueClosed(issue);
          const status = link?.task ? runStatus(link.task) : null;
          return (
            <div
              key={issue.id}
              role="listitem"
              aria-current={issue.id === selected || undefined}
              onClick={() => onSelect(issue)}
              className={cn(
                "group/row flex cursor-default items-center gap-3 rounded-sm px-2 py-(--row-py)",
                issue.id === selected ? "bg-muted" : "hover:bg-muted/50",
              )}
            >
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => onSelect(issue)}
                  className={cn(
                    "block max-w-full truncate text-left text-sm font-medium",
                    closed && "text-muted-foreground",
                  )}
                >
                  {issue.title}
                </button>
                <p className="truncate text-xs text-muted-foreground">
                  #{issue.number} · {closed ? "Closed" : "Open"} · {issueColumn(issue.status)}
                </p>
              </div>
              <span className="hidden w-24 shrink-0 truncate text-xs text-muted-foreground @2xl:block">
                {issue.assignee ?? "Nobody"}
              </span>
              <span
                className="flex w-36 shrink-0 items-center text-xs"
                onClick={(event) => event.stopPropagation()}
              >
                {link ? (
                  <button
                    type="button"
                    onClick={() => onOpenTask(link.id)}
                    className="flex min-w-0 items-center gap-1.5 hover:underline"
                    title={
                      status && link.task
                        ? `${STATUS_LABEL[status]} · ${link.task.title || link.task.prompt}`
                        : "Task"
                    }
                  >
                    <StatusDot status={status ?? "queued"} />
                    <span className="truncate">
                      {link.task ? link.task.title || link.task.prompt : "Queued task"}
                    </span>
                  </button>
                ) : closed ? null : (
                  <Button
                    variant="ghost"
                    size="xs"
                    className="-ml-2 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100"
                    onClick={() => onStart(issue)}
                  >
                    Start task…
                  </Button>
                )}
              </span>
              <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">
                {ago(issue.updatedAt)}
              </span>
              {issue.url ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    void openExternalLink(issue.url ?? "");
                  }}
                  aria-label={`Open #${issue.number} on GitHub`}
                  className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 group-hover/row:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100"
                >
                  <ExternalLinkIcon className="size-3" />
                </button>
              ) : (
                <span className="size-6 shrink-0" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
