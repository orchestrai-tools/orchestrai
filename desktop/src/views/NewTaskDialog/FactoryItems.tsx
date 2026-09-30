import type { ReactNode } from "react";

import { SOURCE_LABEL, STATUS_META } from "@/components/backlog/labels";
import type { WorkItemSource, WorkItemStatus } from "@/components/backlog/types";
import { WORK_ITEM_STATUSES } from "@/components/backlog/types";
import { cn } from "@/lib/utils";

import type { BatchFilter, FactoryBatch } from "./useFactoryBatch";

const SOURCES: WorkItemSource[] = ["github", "linear", "local"];

const FIELD =
  "h-8 rounded-md border border-border bg-transparent px-2 text-[13px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/**
 * In place of the prompt, when the dialog starts several backlog items: the
 * items themselves, or the batch form's filter, with how many it covers.
 * Each item becomes its own Factory task with the configuration below.
 * @param props.batch The batch's scope and filter.
 * @param props.toolbar The harness and model controls, as under a prompt.
 */
export function FactoryItems({ batch, toolbar }: { batch: FactoryBatch; toolbar: ReactNode }) {
  const canPickSelected = batch.selected.length > 0;
  return (
    <section
      aria-label="Backlog items to start"
      className="flex flex-col gap-3 rounded-xl bg-card p-3"
    >
      <div
        role="radiogroup"
        aria-label="Which items"
        className="flex flex-wrap items-center gap-3 text-[13px]"
      >
        <label className="flex items-center gap-1.5">
          <input
            type="radio"
            name="factory-scope"
            checked={batch.scope === "filter"}
            onChange={() => batch.setScope("filter")}
          />
          Items that match
        </label>
        <label
          className={cn("flex items-center gap-1.5", !canPickSelected && "opacity-50")}
          title={canPickSelected ? undefined : "Select items in the backlog first"}
        >
          <input
            type="radio"
            name="factory-scope"
            disabled={!canPickSelected}
            checked={batch.scope === "selected"}
            onChange={() => batch.setScope("selected")}
          />
          Selected items ({batch.selected.length})
        </label>
        <span className="tnum ml-auto text-[11px] text-muted-foreground" aria-live="polite">
          {batch.count === null
            ? "Counting…"
            : `${batch.count} item${batch.count === 1 ? "" : "s"} ${batch.scope === "filter" ? "match" : "selected"}`}
        </span>
      </div>

      {batch.scope === "filter" ? (
        <Filter filter={batch.filter} onChange={batch.patchFilter} />
      ) : (
        <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto text-[13px]">
          {batch.selected.map((item) => (
            <li key={item.id} className="flex min-w-0 gap-2">
              <span className="tnum shrink-0 text-muted-foreground">{item.number || "·"}</span>
              <span className="truncate">{item.title}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-muted-foreground">
        Each item becomes its own Factory task with the settings below, working from the item's
        text. Items that already have a Factory task are skipped.
      </p>
      <div className="flex flex-wrap items-center gap-1.5">{toolbar}</div>
    </section>
  );
}

function Filter({
  filter,
  onChange,
}: {
  filter: BatchFilter;
  onChange: (next: Partial<BatchFilter>) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor="factory-batch-status">
        Status
      </label>
      <select
        id="factory-batch-status"
        className={FIELD}
        value={filter.status}
        onChange={(event) => onChange({ status: event.target.value as WorkItemStatus | "all" })}
      >
        <option value="all">Any status</option>
        {WORK_ITEM_STATUSES.map((status) => (
          <option key={status} value={status}>
            {STATUS_META[status].label}
          </option>
        ))}
      </select>
      <label className="sr-only" htmlFor="factory-batch-source">
        Source
      </label>
      <select
        id="factory-batch-source"
        className={FIELD}
        value={filter.source}
        onChange={(event) => onChange({ source: event.target.value as WorkItemSource | "all" })}
      >
        <option value="all">All sources</option>
        {SOURCES.map((source) => (
          <option key={source} value={source}>
            {SOURCE_LABEL[source]}
          </option>
        ))}
      </select>
      <input
        aria-label="Search items"
        className={cn(FIELD, "min-w-40 flex-1")}
        placeholder="Search"
        value={filter.search}
        onChange={(event) => onChange({ search: event.target.value })}
      />
    </div>
  );
}
