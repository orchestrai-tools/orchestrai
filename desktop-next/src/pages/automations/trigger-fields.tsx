import type { AutomationPreset } from "@warpforge/protocol";
import { Field, FieldDescription, FieldLabel } from "@warpforge/ui/components/field";
import { Input } from "@warpforge/ui/components/input";
import { ToggleGroup, ToggleGroupItem } from "@warpforge/ui/components/toggle-group";
import { useId } from "react";
import { SelectMenu } from "../../components/common/select-menu";
import {
  describeCron,
  formatInZone,
  localZone,
  nextOccurrences,
  parseCron,
  presetCron,
  WEEKDAYS,
  type ScheduleTime,
} from "./schedule";

const PRESETS: readonly { id: AutomationPreset; label: string }[] = [
  { id: "hourly", label: "Hourly" },
  { id: "every5", label: "Every 5 min" },
  { id: "daily", label: "Daily" },
  { id: "weekdays", label: "Weekdays" },
  { id: "weekly", label: "Weekly" },
  { id: "custom", label: "Custom cron" },
];

export function validZone(zone: string): boolean {
  if (!zone) return true;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

function SchedulePreview({ cron, timezone }: { cron: string; timezone: string }) {
  if (!parseCron(cron)) {
    return (
      <p className="text-xs text-destructive">
        Not a cron the scheduler can fire: 5 fields, minute hour day-of-month month day-of-week.
      </p>
    );
  }
  if (!validZone(timezone)) return <p className="text-xs text-destructive">{timezone} is not a time zone this computer knows.</p>;
  const zone = timezone || localZone();
  const upcoming = nextOccurrences(cron, zone, undefined, 3);
  return (
    <div className="rounded-md bg-muted/50 px-3 py-2 text-xs">
      <p>
        {describeCron(cron)} <span className="text-muted-foreground">· {zone}</span>
      </p>
      <p className="text-muted-foreground tabular-nums">
        {upcoming.length ? `Next: ${upcoming.map((at) => formatInZone(at, zone)).join(" · ")}` : "No occurrence in the next year."}
      </p>
    </div>
  );
}

/** A schedule: a preset and its time, or a cron, in a time zone, with the next runs it gives. */
export function TriggerFields({
  preset,
  cron,
  timezone,
  time,
  onChange,
}: {
  preset: AutomationPreset;
  cron: string;
  timezone: string;
  time: ScheduleTime;
  onChange: (change: { preset?: AutomationPreset; cron?: string; timezone?: string; time?: ScheduleTime }) => void;
}) {
  const id = useId();
  const setTime = (next: ScheduleTime) =>
    onChange(preset === "custom" ? { time: next } : { time: next, cron: presetCron(preset, next) });
  const clock = `${String(time.hour).padStart(2, "0")}:${String(time.minute).padStart(2, "0")}`;

  return (
    <div className="flex flex-col gap-4">
      <ToggleGroup
        type="single"
        size="sm"
        spacing={1}
        value={preset}
        aria-label="Repeats"
        onValueChange={(next) => {
          if (!next) return;
          const chosen = next as AutomationPreset;
          onChange({ preset: chosen, cron: chosen === "custom" ? cron : presetCron(chosen, time) });
        }}
        className="flex-wrap"
      >
        {PRESETS.map((entry) => (
          <ToggleGroupItem key={entry.id} value={entry.id}>
            {entry.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <div className="flex flex-wrap items-end gap-3">
        {preset === "custom" ? (
          <Field className="min-w-56 flex-1">
            <FieldLabel htmlFor={`${id}-cron`}>Cron</FieldLabel>
            <Input
              id={`${id}-cron`}
              spellCheck={false}
              className="font-mono"
              value={cron}
              onChange={(event) => onChange({ cron: event.target.value })}
            />
          </Field>
        ) : preset === "hourly" ? (
          <Field className="w-32">
            <FieldLabel htmlFor={`${id}-minute`}>Minute</FieldLabel>
            <Input
              id={`${id}-minute`}
              inputMode="numeric"
              value={time.minute}
              onChange={(event) => setTime({ ...time, minute: Math.min(59, Math.max(0, Number(event.target.value) || 0)) })}
            />
          </Field>
        ) : preset !== "every5" ? (
          <Field className="w-32">
            <FieldLabel htmlFor={`${id}-time`}>Time</FieldLabel>
            <Input
              id={`${id}-time`}
              type="time"
              value={clock}
              onChange={(event) => {
                const [hour, minute] = event.target.value.split(":").map(Number);
                setTime({ ...time, hour: hour || 0, minute: minute || 0 });
              }}
            />
          </Field>
        ) : null}
        {preset === "weekly" && (
          <Field className="w-40">
            <FieldLabel>Day</FieldLabel>
            <SelectMenu
              label="Day"
              value={String(time.weekday)}
              options={WEEKDAYS.map((day, index) => ({ value: String(index), label: day }))}
              onChange={(value) => setTime({ ...time, weekday: Number(value) })}
            />
          </Field>
        )}
        <Field className="w-56">
          <FieldLabel htmlFor={`${id}-zone`}>Time zone</FieldLabel>
          <Input
            id={`${id}-zone`}
            spellCheck={false}
            placeholder={localZone()}
            value={timezone}
            onChange={(event) => onChange({ timezone: event.target.value.trim() })}
          />
        </Field>
      </div>
      <FieldDescription className="text-xs">An IANA zone such as Europe/Lisbon. Empty uses this computer's zone.</FieldDescription>
      <SchedulePreview cron={cron} timezone={timezone} />
    </div>
  );
}
