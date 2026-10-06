import { SectionLabel } from "@/components/common/page-toolbar"
import { Switch } from "@/components/ui/switch"
import { OUTCOME, type Automation, type AutomationRun } from "@/data/automations"
import { cn } from "@/lib/utils"
import { nextLabel, nextRunAt, triggerLine } from "@/pages/automations/describe"
import { RunDot } from "@/pages/automations/run-dot"
import { formatWhen, parseLocal } from "@/pages/automations/schedule"

function Row({
  automation,
  last,
  selected,
  onSelect,
  onToggle,
}: {
  automation: Automation
  last: AutomationRun | undefined
  selected: boolean
  onSelect: () => void
  onToggle: (enabled: boolean) => void
}) {
  return (
    <li className={cn("flex items-center gap-3 rounded-md px-2 py-(--row-py) hover:bg-muted", selected && "bg-muted")}>
      <button
        type="button"
        aria-current={selected ? "true" : undefined}
        onClick={onSelect}
        className={cn("flex min-w-0 flex-1 flex-col gap-0.5 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring", !automation.enabled && "opacity-60")}
      >
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{automation.name}</span>
          <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">{nextLabel(automation)}</span>
        </span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="min-w-0 truncate">
            {triggerLine(automation.trigger)} → {automation.workflow}
          </span>
          {last ? (
            <span className="ml-auto flex shrink-0 items-center gap-1.5" title={last.error ?? OUTCOME[last.status].hint}>
              <RunDot status={last.status} />
              {OUTCOME[last.status].label} · {formatWhen(parseLocal(last.at))}
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
  )
}

/** Schedules by when they fire next, GitHub watches by when they last fired. Pausing dims a row; it never moves it. */
export function AutomationList({
  automations,
  runsOf,
  selectedId,
  onSelect,
  onToggle,
  className,
}: {
  automations: readonly Automation[]
  runsOf: (automation: Automation) => AutomationRun[]
  selectedId: string | undefined
  onSelect: (id: string) => void
  onToggle: (automation: Automation, enabled: boolean) => void
  className?: string
}) {
  const scheduled = automations
    .filter((automation) => automation.trigger.kind === "schedule")
    .sort((a, b) => (nextRunAt(a) ?? Infinity) - (nextRunAt(b) ?? Infinity))
  const lastAt = (automation: Automation) => {
    const last = runsOf(automation)[0]
    return last ? parseLocal(last.at) : 0
  }
  const watching = automations.filter((automation) => automation.trigger.kind !== "schedule").sort((a, b) => lastAt(b) - lastAt(a))
  const groups = [
    { label: "On a schedule", items: scheduled },
    { label: "On GitHub", items: watching },
  ].filter((group) => group.items.length > 0)

  return (
    <nav aria-label="Automations" className={cn("flex flex-col gap-4", className)}>
      {groups.map((group) => (
        <div key={group.label}>
          <SectionLabel className="px-2 pb-1">{group.label}</SectionLabel>
          <ul className="flex flex-col">
            {group.items.map((automation) => (
              <Row
                key={automation.id}
                automation={automation}
                last={runsOf(automation)[0]}
                selected={automation.id === selectedId}
                onSelect={() => onSelect(automation.id)}
                onToggle={(enabled) => onToggle(automation, enabled)}
              />
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}
