import { daemon } from "@warpforge/daemon";
import type { RunLocation, RunnerSettings } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@warpforge/ui/components/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@warpforge/ui/components/field";
import { Input } from "@warpforge/ui/components/input";
import { ToggleGroup, ToggleGroupItem } from "@warpforge/ui/components/toggle-group";
import { useState } from "react";
import { toast } from "sonner";
import { SelectMenu } from "../../components/common/select-menu";
import { configRole } from "../../lib/config-role";
import { useFactoryChoices } from "./factory";
import type { Factory } from "./use-backlog";

const LOCATIONS: { value: RunLocation; label: string; hint: string }[] = [
  { value: "auto", label: "Automatic", hint: "Your project folder when the workflow tests the running app, a background copy otherwise." },
  { value: "worktree", label: "Background copy", hint: "Each task gets its own worktree; several can run at once." },
  { value: "checkout", label: "Your project folder", hint: "One at a time, so the running dev services serve the change. Only on a clean tree." },
];

type LimitKey = "maxConcurrent" | "maxOpenPrs" | "maxPerDay" | "minFreeGb" | "headroomPct";

const LIMITS: { key: LimitKey; label: string; hint: string }[] = [
  { key: "maxConcurrent", label: "Tasks at the same time", hint: "Only one of them runs in your project folder." },
  { key: "maxOpenPrs", label: "Pause at open draft PRs", hint: "Review is the real limit; new tasks wait while this many are open." },
  { key: "maxPerDay", label: "New tasks per 24 hours", hint: "A rolling day, counted from when each started." },
  { key: "minFreeGb", label: "Keep at least (GB free)", hint: "0 turns the disk check off." },
  { key: "headroomPct", label: "Pause when quota use passes (%)", hint: "Out of quota always waits. Never holds back a stage of a task already running." },
];

/** A project's Factory limits and the defaults a new Factory task starts with. */
export function FactorySettingsDialog({
  project,
  factory,
  open,
  onClose,
}: {
  project: string;
  factory: Factory;
  open: boolean;
  onClose: () => void;
}) {
  const settings = factory.status?.settings ?? null;
  const { agents, workflows } = useFactoryChoices(project, open);
  const [draft, setDraft] = useState<RunnerSettings | null>(settings);
  const [opened, setOpened] = useState(false);
  const [busy, setBusy] = useState(false);
  if (open !== opened) {
    setOpened(open);
    if (open) setDraft(settings);
  }
  if (open && !draft && settings) setDraft(settings);
  const modelOption = agents
    .find((agent) => agent.id === draft?.agent)
    ?.models.find((option) => configRole(option) === "model");

  async function save() {
    if (!draft) return;
    setBusy(true);
    try {
      const next = await daemon.runnerUpdateSettings(project, {
        agent: draft.agent,
        headroomPct: draft.headroomPct,
        maxConcurrent: draft.maxConcurrent,
        maxOpenPrs: draft.maxOpenPrs,
        maxPerDay: draft.maxPerDay,
        minFreeGb: draft.minFreeGb,
        model: draft.model ?? "",
        runLocation: draft.runLocation,
        workflow: draft.workflow,
      });
      factory.setStatus(next);
      toast.success("Factory settings saved");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the Factory settings");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Factory settings</DialogTitle>
          <DialogDescription>Limits hold back starting new Factory tasks, never a stage of one already running.</DialogDescription>
        </DialogHeader>
        {!draft ? (
          <p className="text-sm text-muted-foreground">
            {factory.error ?? "Loading the Factory settings…"}{" "}
            {factory.error && (
              <Button variant="outline" size="xs" onClick={factory.reload}>
                Retry
              </Button>
            )}
          </p>
        ) : (
          <FieldGroup className="gap-3">
            {LIMITS.map((limit) => (
              <Field key={limit.key} orientation="horizontal" className="items-start">
                <div className="flex flex-1 flex-col">
                  <FieldLabel htmlFor={`factory-${limit.key}`}>{limit.label}</FieldLabel>
                  <FieldDescription className="text-xs">{limit.hint}</FieldDescription>
                </div>
                <Input
                  id={`factory-${limit.key}`}
                  type="number"
                  min={limit.key === "minFreeGb" ? 0 : 1}
                  value={draft[limit.key]}
                  onChange={(event) => setDraft({ ...draft, [limit.key]: Number(event.target.value) })}
                  className="h-7 w-20 text-right"
                />
              </Field>
            ))}
            <Field>
              <FieldLabel>New tasks run in</FieldLabel>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                spacing={0}
                value={draft.runLocation}
                onValueChange={(next) => next && setDraft({ ...draft, runLocation: next as RunLocation })}
                className="w-full"
              >
                {LOCATIONS.map((location) => (
                  <ToggleGroupItem key={location.value} value={location.value} className="flex-1 text-xs">
                    {location.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <FieldDescription className="text-xs">
                {LOCATIONS.find((location) => location.value === draft.runLocation)?.hint}
              </FieldDescription>
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel>Workflow</FieldLabel>
                <SelectMenu
                  label="Default workflow"
                  value={draft.workflow}
                  onChange={(workflow) => setDraft({ ...draft, workflow })}
                  options={workflows.map((workflow) => ({
                    value: workflow.id,
                    label: workflow.name,
                    disabled: !workflow.valid,
                  }))}
                />
              </Field>
              <Field>
                <FieldLabel>Lead agent</FieldLabel>
                <SelectMenu
                  label="Default lead agent"
                  value={draft.agent}
                  onChange={(agent) => setDraft({ ...draft, agent, model: null })}
                  options={[
                    { value: "", label: "First enabled agent" },
                    ...agents.map((agent) => ({ value: agent.id, label: agent.displayName })),
                  ]}
                />
              </Field>
            </div>
            <Field>
              <FieldLabel>Model</FieldLabel>
              <SelectMenu
                label="Default model"
                value={draft.model ?? ""}
                disabled={!modelOption}
                onChange={(model) => setDraft({ ...draft, model: model || null })}
                options={[
                  { value: "", label: "Agent default" },
                  ...(modelOption?.options ?? []).map((choice) => ({ value: choice.value, label: choice.name })),
                ]}
              />
            </Field>
          </FieldGroup>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!draft || busy} onClick={() => void save()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
