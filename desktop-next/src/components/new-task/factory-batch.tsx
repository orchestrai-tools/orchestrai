import { daemon } from "@warpforge/daemon";
import type { BacklogItem } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import { Checkbox } from "@warpforge/ui/components/checkbox";
import { Input } from "@warpforge/ui/components/input";
import { Switch } from "@warpforge/ui/components/switch";
import { useEffect, useId, useState } from "react";
import { SelectMenu } from "../common/select-menu";

export interface BatchScope {
  all: boolean;
  total: number;
  search: string;
  status: string;
  source: string;
}

const STATUS = [
  { value: "todo", label: "To do" },
  { value: "in_progress", label: "In progress" },
  { value: "all", label: "Any status" },
];
const SOURCE = [
  { value: "all", label: "Any source" },
  { value: "local", label: "Local" },
  { value: "github", label: "GitHub" },
  { value: "linear", label: "Linear" },
];

/** Backlog items a Factory task can start together, or every item matching the filter. */
export function FactoryBatch({
  project,
  picked,
  onPicked,
  onScope,
}: {
  project: string;
  picked: string[];
  onPicked: (ids: string[]) => void;
  onScope: (scope: BatchScope) => void;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("todo");
  const [source, setSource] = useState("all");
  const [all, setAll] = useState(false);
  const [rows, setRows] = useState<BacklogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const allId = useId();

  useEffect(() => {
    let cancelled = false;
    void daemon
      .listBacklog({
        project,
        page: 0,
        pageSize: 20,
        search,
        status: status === "all" ? undefined : status,
        source: source === "all" ? undefined : source,
        sortBy: "priority",
        sortDesc: true,
      })
      .then((page) => {
        if (cancelled) return;
        if (!page || !Array.isArray(page.items)) throw new Error("Could not load the backlog");
        setRows(page.items);
        setTotal(page.total);
        setError(null);
        onScope({ all, total: page.total, search, status, source });
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load the backlog");
      });
    return () => {
      cancelled = true;
    };
  }, [project, search, status, source, all, onScope, reload]);

  function toggle(id: string) {
    onPicked(picked.includes(id) ? picked.filter((item) => item !== id) : [...picked, id]);
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border p-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="Search backlog"
          value={search}
          placeholder="Search the backlog"
          onChange={(event) => setSearch(event.target.value)}
          className="h-7 min-w-0 flex-1 text-xs md:text-xs"
        />
        <SelectMenu
          label="Backlog status"
          value={status}
          options={STATUS}
          onChange={setStatus}
          className="h-7 text-xs"
        />
        <SelectMenu
          label="Backlog source"
          value={source}
          options={SOURCE}
          onChange={setSource}
          className="h-7 text-xs"
        />
      </div>
      <div className="flex items-center gap-2 text-xs">
        <Switch id={allId} checked={all} onCheckedChange={setAll} size="sm" />
        <label htmlFor={allId} className="font-medium">
          Queue every match
        </label>
        <span className="ml-auto text-muted-foreground tabular-nums">
          {all ? `${total} match` : `${picked.length} selected · ${total} match`}
        </span>
      </div>
      {error && (
        <p className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
          {error}
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => setReload((count) => count + 1)}
          >
            Retry
          </Button>
        </p>
      )}
      {!all && (
        <ul className="max-h-40 overflow-y-auto">
          {rows.map((item) => (
            <li key={item.id}>
              <label className="flex items-center gap-2 rounded-sm px-1 py-1 text-xs hover:bg-muted/50">
                <Checkbox
                  checked={picked.includes(item.id)}
                  onCheckedChange={() => toggle(item.id)}
                />
                <span className="truncate">{item.title}</span>
              </label>
            </li>
          ))}
          {rows.length === 0 && !error && (
            <li className="px-1 py-1 text-xs text-muted-foreground">
              Nothing in the backlog matches.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
