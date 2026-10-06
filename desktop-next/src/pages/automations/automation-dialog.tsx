import { daemon } from "@warpforge/daemon";
import {
  DEFAULT_MISSED_RUN_GRACE_MINUTES,
  type Automation,
  type AutomationInput,
  type AutomationPreset,
  type WorktreeBase,
} from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@warpforge/ui/components/dialog";
import { Field, FieldDescription, FieldLabel } from "@warpforge/ui/components/field";
import { Input } from "@warpforge/ui/components/input";
import { Switch } from "@warpforge/ui/components/switch";
import { Textarea } from "@warpforge/ui/components/textarea";
import { useId, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { SectionLabel } from "../../components/common/page-toolbar";
import { SelectMenu } from "../../components/common/select-menu";
import { configRole } from "../../lib/config-role";
import { useDaemon } from "../../lib/use-daemon";
import { parseCron, timeOf } from "./schedule";
import { TriggerFields, validZone } from "./trigger-fields";

type Base = "head" | "origin" | "branch";

interface Draft {
  name: string;
  prompt: string;
  agent: string;
  model: string;
  preset: AutomationPreset;
  cron: string;
  timezone: string;
  precheck: string;
  grace: string;
  enabled: boolean;
  reuseSession: boolean;
  worktree: boolean;
  base: Base;
  branch: string;
}

function draftOf(automation: Automation | null, agent: string): Draft {
  if (!automation) {
    return {
      name: "",
      prompt: "",
      agent,
      model: "",
      preset: "weekdays",
      cron: "0 9 * * MON-FRI",
      timezone: "",
      precheck: "",
      grace: String(DEFAULT_MISSED_RUN_GRACE_MINUTES),
      enabled: true,
      reuseSession: false,
      worktree: false,
      base: "head",
      branch: "",
    };
  }
  const base = automation.worktreeBase;
  return {
    name: automation.name,
    prompt: automation.prompt,
    agent: automation.agent,
    model: automation.model ?? "",
    preset: automation.trigger.preset,
    cron: automation.trigger.cron,
    timezone: automation.timezone,
    precheck: automation.precheck ?? "",
    grace: String(automation.missedRunGraceMinutes),
    enabled: automation.enabled,
    reuseSession: automation.reuseSession,
    worktree: automation.worktree,
    base: base?.kind === "origin" ? "origin" : base?.kind === "branch" ? "branch" : "head",
    branch: base?.kind === "branch" ? base.name : "",
  };
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-start gap-3">
      <Switch checked={checked} onCheckedChange={onChange} className="mt-0.5" />
      <span className="flex flex-col">
        <span className="text-sm">{label}</span>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <SectionLabel>{title}</SectionLabel>
      {children}
    </section>
  );
}

function AutomationForm({
  project,
  initial,
  onClose,
  onSaved,
}: {
  project: string;
  initial: Automation | null;
  onClose: () => void;
  onSaved: (automation: Automation, runNow: boolean) => void;
}) {
  const agents = (useDaemon().snapshot.agents ?? []).filter((agent) => agent.enabled);
  const [draft, setDraft] = useState(() => draftOf(initial, agents[0]?.id ?? "claude"));
  const [time, setTime] = useState(() => timeOf(draft.cron));
  const [busy, setBusy] = useState(false);
  const id = useId();
  const patch = (change: Partial<Draft>) => setDraft((current) => ({ ...current, ...change }));
  const modelOption = agents.find((agent) => agent.id === draft.agent)?.models.find((option) => configRole(option) === "model");
  const grace = Number(draft.grace);
  const agentOptions = agents.map((agent) => ({ value: agent.id, label: agent.displayName }));
  if (!agentOptions.some((option) => option.value === draft.agent)) agentOptions.unshift({ value: draft.agent, label: draft.agent });

  const problems = [
    !draft.name.trim() && "Give it a name.",
    !draft.prompt.trim() && "Say what each run should do.",
    !parseCron(draft.cron) && "Fix the cron.",
    !validZone(draft.timezone) && "Fix the time zone.",
    !(/^\d+$/.test(draft.grace.trim()) && grace >= 1) && "The grace window is a whole number of minutes, at least 1.",
    draft.worktree && draft.base === "branch" && !draft.branch.trim() && "Name the branch each run starts from.",
  ].filter((problem): problem is string => Boolean(problem));

  const worktreeBase = (): WorktreeBase | null =>
    !draft.worktree || draft.base === "head"
      ? null
      : draft.base === "origin"
        ? { kind: "origin" }
        : { kind: "branch", name: draft.branch.trim() };

  async function save(runNow: boolean) {
    if (problems.length) return;
    setBusy(true);
    const fields = {
      name: draft.name.trim(),
      prompt: draft.prompt.trim(),
      agent: draft.agent,
      trigger: { preset: draft.preset, cron: draft.cron.trim() },
      timezone: draft.timezone,
      enabled: draft.enabled,
      missedRunGraceMinutes: grace,
      reuseSession: draft.reuseSession,
      worktree: draft.worktree,
      worktreeBase: worktreeBase(),
    };
    try {
      const saved = initial
        ? await daemon.updateAutomation(initial.id, {
            ...fields,
            precheck: draft.precheck.trim(),
            ...(draft.model ? { model: draft.model } : {}),
          })
        : await daemon.createAutomation({
            ...fields,
            project,
            precheck: draft.precheck.trim() || null,
            model: draft.model || null,
          } satisfies AutomationInput);
      toast.success(initial ? `Saved ${saved.name}` : `Created ${saved.name}`);
      onSaved(saved, runNow);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the automation");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{initial ? `Edit ${initial.name}` : "New automation"}</DialogTitle>
        <DialogDescription>
          A schedule that starts a task in {initial?.project ?? project}. It never talks to a model itself; the task it starts does.
        </DialogDescription>
      </DialogHeader>

      <Section title="What it starts">
        <Field>
          <FieldLabel htmlFor={`${id}-name`}>Name</FieldLabel>
          <Input
            id={`${id}-name`}
            autoFocus
            value={draft.name}
            placeholder="Nightly clippy sweep"
            onChange={(event) => patch({ name: event.target.value })}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel>Agent</FieldLabel>
            <SelectMenu label="Agent" value={draft.agent} options={agentOptions} onChange={(agent) => patch({ agent, model: "" })} />
          </Field>
          <Field>
            <FieldLabel>Model</FieldLabel>
            <SelectMenu
              label="Model"
              value={draft.model}
              disabled={!modelOption}
              options={[
                { value: "", label: "Agent default" },
                ...(modelOption?.options ?? []).map((choice) => ({ value: choice.value, label: choice.name })),
              ]}
              onChange={(model) => patch({ model })}
            />
            {initial?.model && !draft.model && (
              <FieldDescription className="text-xs">Saving keeps {initial.model}; pick another model to change it.</FieldDescription>
            )}
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor={`${id}-prompt`}>Prompt for each run</FieldLabel>
          <Textarea id={`${id}-prompt`} value={draft.prompt} rows={4} onChange={(event) => patch({ prompt: event.target.value })} />
        </Field>
      </Section>

      <Section title="When">
        <TriggerFields
          preset={draft.preset}
          cron={draft.cron}
          timezone={draft.timezone}
          time={time}
          onChange={({ time: nextTime, ...change }) => {
            if (nextTime) setTime(nextTime);
            patch(change);
          }}
        />
      </Section>

      <Section title="Where, and the guards around a run">
        <Toggle
          label="Same task every run"
          hint="Off: each run is a new task on the board. On: every run continues one task, so the board never fills up."
          checked={draft.reuseSession}
          onChange={(reuseSession) => patch({ reuseSession })}
        />
        <Toggle
          label="Isolated worktree"
          hint="Each new task codes in its own copy of the repo."
          checked={draft.worktree}
          onChange={(worktree) => patch({ worktree })}
        />
        {draft.worktree && (
          <div className="flex flex-wrap items-end gap-3">
            <Field className="w-64">
              <FieldLabel>Start each run from</FieldLabel>
              <SelectMenu
                label="Start each run from"
                value={draft.base}
                options={[
                  { value: "head", label: "Current branch" },
                  { value: "origin", label: "Latest from origin" },
                  { value: "branch", label: "A named branch" },
                ]}
                onChange={(base) => patch({ base: base as Base })}
              />
            </Field>
            {draft.base === "branch" && (
              <Field className="w-56">
                <FieldLabel htmlFor={`${id}-branch`}>Branch</FieldLabel>
                <Input id={`${id}-branch`} spellCheck={false} value={draft.branch} onChange={(event) => patch({ branch: event.target.value })} />
              </Field>
            )}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
          <Field>
            <FieldLabel htmlFor={`${id}-precheck`}>Precheck</FieldLabel>
            <Input
              id={`${id}-precheck`}
              spellCheck={false}
              className="font-mono text-xs md:text-xs"
              placeholder="git fetch --quiet"
              value={draft.precheck}
              onChange={(event) => patch({ precheck: event.target.value })}
            />
            <FieldDescription className="text-xs">Runs in the project folder before each scheduled run. A non-zero exit skips the run.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-grace`}>Missed-run grace</FieldLabel>
            <Input id={`${id}-grace`} inputMode="numeric" value={draft.grace} onChange={(event) => patch({ grace: event.target.value })} />
            <FieldDescription className="text-xs">Minutes late a missed run may still start.</FieldDescription>
          </Field>
        </div>
        <Toggle
          label="On"
          hint="A paused automation keeps its history and never fires."
          checked={draft.enabled}
          onChange={(enabled) => patch({ enabled })}
        />
      </Section>

      <DialogFooter className="items-center">
        {problems.length > 0 && <p className="mr-auto text-xs text-muted-foreground">{problems[0]}</p>}
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="outline"
          disabled={problems.length > 0 || busy}
          onClick={() => void save(true)}
          title="Saves, then runs once now; the schedule is untouched"
        >
          {initial ? "Save and run now" : "Create and run now"}
        </Button>
        <Button disabled={problems.length > 0 || busy} onClick={() => void save(false)}>
          {initial ? "Save" : "Create automation"}
        </Button>
      </DialogFooter>
    </>
  );
}

/** Create or edit an automation. Every field the daemon stores is here. */
export function AutomationDialog({
  project,
  open,
  editing,
  onClose,
  onSaved,
}: {
  project: string;
  open: boolean;
  editing: Automation | null;
  onClose: () => void;
  onSaved: (automation: Automation, runNow: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-6 overflow-y-auto sm:max-w-xl">
        {open && <AutomationForm key={editing?.id ?? "new"} project={project} initial={editing} onClose={onClose} onSaved={onSaved} />}
      </DialogContent>
    </Dialog>
  );
}
