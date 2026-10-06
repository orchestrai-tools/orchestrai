import type { Automation, AutomationRun } from "@warpforge/protocol";
import { Switch } from "@warpforge/ui/components/switch";
import { cn } from "@warpforge/ui/lib/utils";
import { SectionLabel } from "../../components/common/page-toolbar";
import { RUN_STATUS_META } from "../../lib/automation-run";
import { nextAt, nextLabel, triggerLine } from "./describe";
import { RunDot } from "./run-dot";
import { formatWhen } from "./schedule";

function Row({
  automation,
  last,
  showProject,
  selected,
  onSelect,
  onToggle,
}: {
  automation: Automation;
  last: AutomationRun | undefined;
  showProject: boolean;
  selected: boolean;
  onSelect: () => void;
  onToggle: (enabled: boolean) => void;
}) {
  const lastStatus = last?.status ?? automation.lastStatus;
  const lastAt = last ? (last.startedAt || last.scheduledFor) * 1000 : automation.lastRunAt ? automation.lastRunAt * 1000 : null;
  return (
    <li className={cn("flex items-center gap-3 rounded-md px-2 py-(--row-py) hover:bg-muted", selected && "bg-muted")}>
      <button
        type="button"
        aria-current={selected ? "true" : undefined}
        onClick={onSelect}
        className={cn(
          "flex min-w-0 flex-1 flex-col gap-0.5 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
          !automation.enabled && "opacity-60",
        )}
      >
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{automation.name}</span>
          <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">{nextLabel(automation)}</span>
        </span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="min-w-0 truncate">
            {showProject ? `${automation.project} · ` : ""}
            {triggerLine(automation)} → {automation.agent}
          </span>
          {lastStatus && lastAt ? (
            <span className="ml-auto flex shrink-0 items-center gap-1.5" title={last?.error ?? RUN_STATUS_META[lastStatus].hint}>
              <RunDot status={lastStatus} />
              {RUN_STATUS_META[lastStatus].label} · {formatWhen(lastAt)}
            </span>
          ) : (
            <span className="ml-auto shrink-0">Never run</span>
          )}
        </span>
      </button>
      <Switch
        size="sm"
        checked={automation.enabled}
        onCheckedChange={onToggle}
        aria-label={automation.enabled ? `Pause ${automation.name}` : `Resume ${automation.name}`}
      />
    </li>
  );
}

/** Schedules by when they fire next. Pausing dims a row; it never moves it out of its group. */
export function AutomationList({
  automations,
  runsOf,
  showProject,
  selectedId,
  onSelect,
  onToggle,
  className,
}: {
  automations: readonly Automation[];
  runsOf: (automation: Automation) => AutomationRun[];
  showProject: boolean;
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  onToggle: (automation: Automation, enabled: boolean) => void;
  className?: string;
}) {
  const scheduled = [...automations].sort(
    (a, b) => (nextAt(a) ?? Infinity) - (nextAt(b) ?? Infinity) || a.name.localeCompare(b.name),
  );
  return (
    <nav aria-label="Automations" className={cn("flex flex-col gap-4", className)}>
      <div>
        <SectionLabel className="px-2 pb-1">On a schedule</SectionLabel>
        <ul className="flex flex-col">
          {scheduled.map((automation) => (
            <Row
              key={automation.id}
              automation={automation}
              last={runsOf(automation)[0]}
              showProject={showProject}
              selected={automation.id === selectedId}
              onSelect={() => onSelect(automation.id)}
              onToggle={(enabled) => onToggle(automation, enabled)}
            />
          ))}
        </ul>
      </div>
    </nav>
  );
}
