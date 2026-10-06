import { useId } from "react"

import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { AutomationTrigger, SchedulePreset } from "@/data/automations"
import { ANYONE_FILTER, BOTS_FILTER, triggerOfKind } from "@/pages/automations/describe"
import { SelectMenu } from "@/components/common/select-menu"
import { describeCron, formatInZone, nextOccurrences, parseCron, presetCron, TIMEZONES, WEEKDAYS } from "@/pages/automations/schedule"

export interface ScheduleTime {
  hour: number
  minute: number
  weekday: number
}

const KINDS: readonly { id: AutomationTrigger["kind"]; label: string }[] = [
  { id: "schedule", label: "Schedule" },
  { id: "issue", label: "New issue" },
  { id: "label", label: "Label added" },
  { id: "review", label: "Changes requested" },
]

const PRESETS: readonly { id: SchedulePreset; label: string }[] = [
  { id: "hourly", label: "Hourly" },
  { id: "every5", label: "Every 5 min" },
  { id: "daily", label: "Daily" },
  { id: "weekdays", label: "Weekdays" },
  { id: "weekly", label: "Weekly" },
  { id: "custom", label: "Custom cron" },
]

function SchedulePreview({ cron, timezone }: { cron: string; timezone: string }) {
  if (!parseCron(cron)) {
    return <p className="text-xs text-destructive">Not a cron the scheduler can fire: 5 fields, minute hour day-of-month month day-of-week.</p>
  }
  const upcoming = nextOccurrences(cron, timezone, undefined, 3)
  return (
    <div className="rounded-md bg-muted/50 px-3 py-2 text-xs">
      <p>
        {describeCron(cron)} <span className="text-muted-foreground">· {timezone}</span>
      </p>
      <p className="text-muted-foreground tabular-nums">
        {upcoming.length ? `Next: ${upcoming.map((at) => formatInZone(at, timezone)).join(" · ")}` : "No occurrence in the next year."}
      </p>
    </div>
  )
}

export function TriggerFields({
  trigger,
  time,
  repo,
  onChange,
  onTime,
}: {
  trigger: AutomationTrigger
  time: ScheduleTime
  repo: string
  onChange: (trigger: AutomationTrigger) => void
  onTime: (time: ScheduleTime) => void
}) {
  const id = useId()
  const setTime = (next: ScheduleTime) => {
    onTime(next)
    if (trigger.kind === "schedule" && trigger.preset !== "custom") {
      onChange({ ...trigger, cron: presetCron(trigger.preset, next.hour, next.minute, next.weekday) })
    }
  }
  const clock = `${String(time.hour).padStart(2, "0")}:${String(time.minute).padStart(2, "0")}`

  return (
    <div className="flex flex-col gap-4">
      <ToggleGroup
        type="single"
        variant="outline"
        spacing={0}
        value={trigger.kind}
        onValueChange={(next) => next && onChange(triggerOfKind(next as AutomationTrigger["kind"], repo))}
        className="w-full"
      >
        {KINDS.map((kind) => (
          <ToggleGroupItem key={kind.id} value={kind.id} className="flex-1 text-xs">
            {kind.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {trigger.kind === "schedule" ? (
        <>
          <ToggleGroup
            type="single"
            size="sm"
            spacing={1}
            value={trigger.preset}
            aria-label="Repeats"
            onValueChange={(next) => {
              if (!next) return
              const preset = next as SchedulePreset
              onChange({ ...trigger, preset, cron: preset === "custom" ? trigger.cron : presetCron(preset, time.hour, time.minute, time.weekday) })
            }}
            className="flex-wrap"
          >
            {PRESETS.map((preset) => (
              <ToggleGroupItem key={preset.id} value={preset.id}>
                {preset.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <div className="flex flex-wrap items-end gap-3">
            {trigger.preset === "custom" ? (
              <Field className="min-w-56 flex-1">
                <FieldLabel htmlFor={`${id}-cron`}>Cron</FieldLabel>
                <Input id={`${id}-cron`} spellCheck={false} className="font-mono" value={trigger.cron} onChange={(event) => onChange({ ...trigger, cron: event.target.value })} />
              </Field>
            ) : trigger.preset === "hourly" ? (
              <Field className="w-32">
                <FieldLabel htmlFor={`${id}-minute`}>Minute</FieldLabel>
                <Input id={`${id}-minute`} inputMode="numeric" value={time.minute} onChange={(event) => setTime({ ...time, minute: Math.min(59, Math.max(0, Number(event.target.value) || 0)) })} />
              </Field>
            ) : trigger.preset !== "every5" ? (
              <Field className="w-32">
                <FieldLabel htmlFor={`${id}-time`}>Time</FieldLabel>
                <Input
                  id={`${id}-time`}
                  type="time"
                  value={clock}
                  onChange={(event) => {
                    const [hour, minute] = event.target.value.split(":").map(Number)
                    setTime({ ...time, hour: hour || 0, minute: minute || 0 })
                  }}
                />
              </Field>
            ) : null}
            {trigger.preset === "weekly" && (
              <Field className="w-40">
                <FieldLabel>Day</FieldLabel>
                <SelectMenu label="Day" value={String(time.weekday)} options={WEEKDAYS.map((day, index) => ({ value: String(index), label: day }))} onChange={(value) => setTime({ ...time, weekday: Number(value) })} />
              </Field>
            )}
            <Field className="w-52">
              <FieldLabel>Timezone</FieldLabel>
              <SelectMenu label="Timezone" value={trigger.timezone} options={TIMEZONES.map((zone) => ({ value: zone, label: zone }))} onChange={(timezone) => onChange({ ...trigger, timezone })} />
            </Field>
          </div>
          <SchedulePreview cron={trigger.cron} timezone={trigger.timezone} />
        </>
      ) : (
        <>
          <div className="flex flex-wrap gap-3">
            <Field className="min-w-56 flex-1">
              <FieldLabel htmlFor={`${id}-repo`}>Repository</FieldLabel>
              <Input id={`${id}-repo`} spellCheck={false} className="font-mono" value={trigger.repo} onChange={(event) => onChange({ ...trigger, repo: event.target.value })} />
            </Field>
            {trigger.kind === "label" && (
              <Field className="w-44">
                <FieldLabel htmlFor={`${id}-label`}>Label</FieldLabel>
                <Input id={`${id}-label`} spellCheck={false} value={trigger.label} onChange={(event) => onChange({ ...trigger, label: event.target.value })} />
              </Field>
            )}
            {trigger.kind === "review" && (
              <Field className="w-44">
                <FieldLabel htmlFor={`${id}-pr-label`}>Pull requests labeled</FieldLabel>
                <Input
                  id={`${id}-pr-label`}
                  spellCheck={false}
                  value={trigger.filter.split(" ").at(-1) ?? ""}
                  onChange={(event) => onChange({ ...trigger, filter: `Changes requested on a pull request labeled ${event.target.value}` })}
                />
              </Field>
            )}
          </div>
          {trigger.kind === "issue" && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={trigger.filter === BOTS_FILTER}
                onCheckedChange={(checked) => onChange({ ...trigger, filter: checked ? BOTS_FILTER : ANYONE_FILTER })}
              />
              Skip issues opened by bots
            </label>
          )}
          <FieldDescription className="text-xs">
            Checks GitHub every minute with your gh sign-in, and each matching event starts one task. The issue or review text reaches the
            agent marked as untrusted, as data and never as instructions.
          </FieldDescription>
        </>
      )}
    </div>
  )
}
