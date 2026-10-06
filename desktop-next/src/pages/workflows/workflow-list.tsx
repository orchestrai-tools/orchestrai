import type { TaskInfo, WorkflowMeta } from "@warpforge/protocol";
import { cn } from "@warpforge/ui/lib/utils";
import { SectionLabel } from "../../components/common/page-toolbar";
import { runStatus, StatusDot, type RunStatus } from "../../components/common/status-mark";

const ATTENTION: readonly RunStatus[] = ["needs-you", "stopped", "failed"];

function Row({
  workflow,
  runs,
  selected,
  onSelect,
}: {
  workflow: WorkflowMeta;
  runs: TaskInfo[];
  selected: boolean;
  onSelect: () => void;
}) {
  const statuses = runs.map((task) => runStatus(task));
  const live = statuses.find((status) => ATTENTION.includes(status)) ?? statuses.find((status) => status === "running");
  const count = runs.length;
  return (
    <li>
      <button
        type="button"
        aria-current={selected ? "true" : undefined}
        onClick={onSelect}
        className={cn(
          "flex w-full flex-col gap-0.5 rounded-md px-2 py-(--row-py) text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
          selected && "bg-muted",
        )}
      >
        <span className="flex items-center gap-2">
          <span className={cn("truncate text-sm font-medium", !workflow.valid && "text-muted-foreground")}>{workflow.name}</span>
          {live && <StatusDot status={live} />}
          <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
            {count === 0 ? "No runs" : `${count} run${count === 1 ? "" : "s"}`}
          </span>
        </span>
        <span className={cn("truncate text-xs", workflow.valid ? "text-muted-foreground" : "text-destructive")}>
          {workflow.valid ? (workflow.stages ?? []).join(" → ") : "Can't load the file"}
        </span>
      </button>
    </li>
  );
}

/** Project files first; built-ins after them, as the daemon lists them. */
export function WorkflowList({
  workflows,
  runsOf,
  selectedId,
  onSelect,
  className,
}: {
  workflows: WorkflowMeta[];
  runsOf: (id: string) => TaskInfo[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  className?: string;
}) {
  const groups = [
    { label: "In this project", items: workflows.filter((workflow) => workflow.source === "project") },
    { label: "Built in", items: workflows.filter((workflow) => workflow.source === "builtin") },
  ].filter((group) => group.items.length > 0);

  return (
    <nav aria-label="Workflows" className={cn("flex flex-col gap-4", className)}>
      {groups.map((group) => (
        <div key={group.label}>
          <SectionLabel className="px-2 pb-1">{group.label}</SectionLabel>
          <ul className="flex flex-col">
            {group.items.map((workflow) => (
              <Row
                key={`${workflow.source}-${workflow.id}`}
                workflow={workflow}
                runs={runsOf(workflow.id)}
                selected={workflow.id === selectedId}
                onSelect={() => onSelect(workflow.id)}
              />
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
