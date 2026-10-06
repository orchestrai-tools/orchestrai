import type { PullRequestSummary } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@warpforge/ui/components/dropdown-menu";
import { cn } from "@warpforge/ui/lib/utils";
import { EllipsisIcon, ExternalLinkIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { runStatus, StatusDot, STATUS_LABEL } from "../../components/common/status-mark";
import { isTypingTarget, listStep } from "../../lib/editor-nav";
import { openExternalLink } from "../../lib/external-link";
import { isUnseen, useInboxSeen } from "../../lib/inbox-seen";
import { assistantMark, reviewDecisionLabel } from "../../lib/review-decision";
import { useShell } from "../../lib/shell-store";
import { useDaemon } from "../../lib/use-daemon";
import { FilterBar, FilterMenu, ListSkeletonRows, SearchField } from "./list-controls";
import { PullMenuItems, type PullHandlers } from "./pull-actions";
import { ago, checkDot, checkLabel, isLive, pullTask, stateLabel } from "./pull-meta";

type StateFilter = "open" | "merged" | "closed" | "all";
type Sort = "recent" | "oldest";

interface Filters {
  state: StateFilter;
  author: string;
  label: string;
  sort: Sort;
}

const IDLE: Filters = { state: "open", author: "anyone", label: "any", sort: "recent" };

function matches(pull: PullRequestSummary, filters: Filters): boolean {
  if (filters.state === "open" && pull.state !== "open") return false;
  if ((filters.state === "merged" || filters.state === "closed") && pull.state !== filters.state)
    return false;
  if (filters.author !== "anyone" && pull.author?.login !== filters.author) return false;
  if (filters.label !== "any" && !pull.labels.some((label) => label.name === filters.label))
    return false;
  return true;
}

/** Pull requests, the most recently moved first. J and K move the selection. */
export function PullList({
  pulls,
  loading,
  selected,
  onSelect,
  handlers,
}: {
  pulls: PullRequestSummary[];
  loading: boolean;
  selected?: number;
  onSelect: (pull: PullRequestSummary) => void;
  handlers: PullHandlers;
}) {
  const inbox = useShell((state) => state.inbox);
  const setInbox = useShell((state) => state.setInbox);
  const [filters, setFilters] = useState<Filters>(() => ({
    ...IDLE,
    state: inbox.state === "all" ? "all" : "open",
  }));
  const set = (patch: Partial<Filters>) => setFilters((current) => ({ ...current, ...patch }));
  const authors = [...new Set(pulls.flatMap((pull) => (pull.author ? [pull.author.login] : [])))];
  const labels = [
    ...new Set(pulls.flatMap((pull) => pull.labels.map((label) => label.name))),
  ].sort();
  const rows = useMemo(
    () =>
      pulls
        .filter((pull) => matches(pull, filters))
        .sort((a, b) =>
          filters.sort === "recent" ? b.updatedAt - a.updatedAt : a.updatedAt - b.updatedAt,
        ),
    [pulls, filters],
  );
  const narrowed =
    JSON.stringify({ ...filters, sort: IDLE.sort }) !== JSON.stringify(IDLE) ||
    inbox.search !== "" ||
    inbox.assignedToMe;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return;
      if (event.target instanceof HTMLElement && event.target.closest("[role=menu]")) return;
      const step = listStep(event.key);
      if (!step || rows.length === 0) return;
      event.preventDefault();
      const current = rows.findIndex((pull) => pull.number === selected);
      const next = rows[Math.min(rows.length - 1, Math.max(0, (current < 0 ? 0 : current) + step))];
      if (next) onSelect(next);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rows, selected, onSelect]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <FilterBar
        onReset={
          narrowed
            ? () => {
                setFilters({ ...IDLE, sort: filters.sort });
                setInbox({ assignedToMe: false, state: "open", search: "" });
              }
            : undefined
        }
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
          value={inbox.search}
          onChange={(search) => setInbox({ ...inbox, search })}
          placeholder="Search pull requests"
        />
        <FilterMenu
          label="State"
          idle="open"
          value={filters.state}
          onChange={(state) => {
            set({ state });
            setInbox({ ...inbox, state: state === "open" ? "open" : "all" });
          }}
          options={[
            { value: "open", label: "Open and draft" },
            { value: "merged", label: "Merged" },
            { value: "closed", label: "Closed" },
            { value: "all", label: "All" },
          ]}
        />
        <FilterMenu
          label="Assignee"
          idle="anyone"
          value={inbox.assignedToMe ? "me" : "anyone"}
          onChange={(value) => setInbox({ ...inbox, assignedToMe: value === "me" })}
          options={[
            { value: "anyone", label: "Anyone" },
            { value: "me", label: "Assigned to me" },
          ]}
        />
        <FilterMenu
          label="Author"
          idle="anyone"
          value={filters.author}
          onChange={(author) => set({ author })}
          options={[
            { value: "anyone", label: "Anyone" },
            ...(authors.length ? ["separator" as const] : []),
            ...authors.map((login) => ({ value: login, label: login })),
          ]}
        />
        <FilterMenu
          label="Label"
          idle="any"
          value={filters.label}
          onChange={(label) => set({ label })}
          options={[
            { value: "any", label: "Any label" },
            ...labels.map((label) => ({ value: label, label })),
          ]}
        />
      </FilterBar>

      <div
        role="list"
        aria-label="Pull requests, J and K move"
        className="@container min-h-0 flex-1 overflow-y-auto px-2 pb-4"
      >
        {loading && pulls.length === 0 && <ListSkeletonRows label="Loading pull requests" />}
        {!loading && rows.length === 0 && (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            {pulls.length === 0 && !narrowed
              ? "No open pull requests."
              : "No pull request matches these filters."}
          </p>
        )}
        {rows.map((pull) => (
          <PullRow
            key={pull.number}
            pull={pull}
            selected={pull.number === selected}
            onSelect={() => onSelect(pull)}
            handlers={handlers}
          />
        ))}
      </div>
    </div>
  );
}

function PullRow({
  pull,
  selected,
  onSelect,
  handlers,
}: {
  pull: PullRequestSummary;
  selected: boolean;
  onSelect: () => void;
  handlers: PullHandlers;
}) {
  useInboxSeen((state) => state.tick);
  const state = useDaemon();
  const linked = pullTask(pull, state.snapshot.tasks, state.taskPullRequests);
  const assistant = assistantMark(state.snapshot.tasks, pull);
  const review = reviewDecisionLabel(pull.reviewDecision);
  const unseen = isUnseen(pull);
  const live = isLive(pull);
  const checks = linked?.link.checks;
  const taskStatus = linked ? runStatus(linked.task, true) : null;

  return (
    <div
      role="listitem"
      aria-current={selected || undefined}
      onClick={onSelect}
      className={cn(
        "group/row flex cursor-default items-center gap-3 rounded-sm px-2 py-(--row-py)",
        selected ? "bg-muted" : "hover:bg-muted/50",
      )}
    >
      <span
        aria-label={unseen ? "Updated since you last looked" : undefined}
        className={cn("size-1.5 shrink-0 rounded-full", unseen && "bg-sky-500")}
      />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-2">
          <button
            type="button"
            onClick={onSelect}
            className={cn(
              "truncate text-left text-sm",
              unseen ? "font-semibold" : "font-medium",
              !live && "text-muted-foreground",
            )}
          >
            {pull.title}
          </button>
          <span className="hidden shrink-0 gap-1 @3xl:flex">
            {pull.labels.map((label) => (
              <span
                key={label.name}
                className="rounded-sm border px-1 text-xs text-muted-foreground"
              >
                {label.name}
              </span>
            ))}
          </span>
        </div>
        <p className="truncate text-xs text-muted-foreground">
          #{pull.number} · {stateLabel(pull)} · {pull.author?.login ?? "someone"} ·{" "}
          <span className="font-mono">{pull.headRefName}</span> → {pull.baseRefName}
          {typeof pull.additions === "number" && (
            <>
              {" · "}
              <span className="text-emerald-600 dark:text-emerald-400">+{pull.additions}</span>{" "}
              <span className="text-red-600 dark:text-red-400">−{pull.deletions ?? 0}</span>
            </>
          )}
        </p>
      </div>
      <span
        className="hidden w-28 shrink-0 items-center gap-1.5 text-xs @xl:flex"
        title={checks ? `Checks: ${checkLabel(checks)}` : undefined}
      >
        {checks && (
          <>
            <span aria-hidden className={cn("size-2 shrink-0 rounded-full", checkDot(checks))} />
            <span className={checks === "failing" ? "text-foreground" : "text-muted-foreground"}>
              {checkLabel(checks)}
            </span>
          </>
        )}
      </span>
      <span
        className={cn(
          "hidden w-32 shrink-0 truncate text-xs @2xl:block",
          pull.reviewDecision === "CHANGES_REQUESTED" ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {assistant === "running"
          ? "Assistant working"
          : live || review === "Approved"
            ? (review ?? "")
            : ""}
      </span>
      <span className="hidden w-32 shrink-0 @4xl:block">
        {linked && taskStatus ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              handlers.openTask(linked.task.id);
            }}
            className="flex max-w-full items-center gap-1.5 text-xs hover:underline"
            title={`${STATUS_LABEL[taskStatus]} · ${linked.task.title || linked.task.prompt}`}
          >
            <StatusDot status={taskStatus} />
            <span className="truncate">{linked.task.title || linked.task.prompt}</span>
          </button>
        ) : (
          <span className="text-xs text-muted-foreground/60">No task</span>
        )}
      </span>
      <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">
        {ago(pull.updatedAt)}
      </span>
      <span
        className="flex w-14 shrink-0 justify-end gap-0.5 opacity-0 group-hover/row:opacity-100 focus-within:opacity-100"
        onClick={(event) => event.stopPropagation()}
      >
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Open #${pull.number} on GitHub`}
          onClick={() => void openExternalLink(pull.url)}
        >
          <ExternalLinkIcon />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-xs" aria-label={`More for #${pull.number}`}>
              <EllipsisIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <PullMenuItems pull={pull} handlers={handlers} taskId={linked?.task.id} />
          </DropdownMenuContent>
        </DropdownMenu>
      </span>
    </div>
  );
}
