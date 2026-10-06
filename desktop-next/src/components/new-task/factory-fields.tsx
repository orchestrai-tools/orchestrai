import type { EntryRunLocation, WorkflowMeta } from "@warpforge/protocol";
import { Field, FieldDescription, FieldLabel } from "@warpforge/ui/components/field";
import { Switch } from "@warpforge/ui/components/switch";
import { Toggle } from "@warpforge/ui/components/toggle";
import { useId } from "react";
import { canTestInApp, testingWorkflow } from "../../lib/factory-batch";
import { SelectMenu } from "../common/select-menu";
import { FactoryBatch, type BatchScope } from "./factory-batch";

const LOCATIONS: { value: EntryRunLocation; label: string; hint: string }[] = [
  { value: "default", label: "Automatic", hint: "The project's Factory setting" },
  { value: "worktree", label: "Background copy", hint: "A worktree of its own" },
  { value: "checkout", label: "Your project folder", hint: "Where the services run" },
];

/** The Factory mode's own fields: workflow, delivery, where it runs, and a backlog batch. */
export function FactoryFields({
  project,
  workflows,
  workflow,
  onWorkflow,
  deliver,
  onDeliver,
  location,
  onLocation,
  batch,
  onBatch,
  onScope,
}: {
  project: string;
  workflows: WorkflowMeta[];
  workflow: string;
  onWorkflow: (id: string) => void;
  deliver: boolean;
  onDeliver: (on: boolean) => void;
  location: EntryRunLocation;
  onLocation: (location: EntryRunLocation) => void;
  batch: string[];
  onBatch: (ids: string[]) => void;
  onScope: (scope: BatchScope) => void;
}) {
  const deliverId = useId();
  const selected = workflows.find((item) => item.id === workflow) ?? null;
  const testing = selected?.verifyRequired != null;
  const verifyBlocked = location === "worktree" && selected?.verifyRequired === true;
  const options = [
    { value: "", label: "No workflow", hint: "One agent session, no stages" },
    ...workflows.map((item) => ({
      value: item.id,
      label: item.name,
      hint: item.valid
        ? (item.stages ?? []).join(" → ") || undefined
        : `Does not load: ${item.error ?? "invalid"}`,
      disabled: !item.valid,
    })),
  ];

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Field>
          <FieldLabel>Workflow</FieldLabel>
          <SelectMenu
            label="Workflow"
            value={workflow}
            options={options}
            onChange={onWorkflow}
            className="w-full"
          />
        </Field>
        <Field>
          <FieldLabel>Where it runs</FieldLabel>
          <SelectMenu
            label="Where it runs"
            value={location}
            options={LOCATIONS}
            onChange={(next) => onLocation(next as EntryRunLocation)}
            className="w-full"
          />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label htmlFor={deliverId} className="flex items-center gap-2 text-sm">
          <Switch id={deliverId} checked={deliver} onCheckedChange={onDeliver} />
          Open a draft PR when done
        </label>
        {canTestInApp(workflows) && (
          <Toggle
            variant="outline"
            size="sm"
            pressed={testing}
            onPressedChange={(on) => {
              const next = testingWorkflow(workflows, on);
              if (next) onWorkflow(next);
            }}
            className="ml-auto text-xs"
          >
            Test in the running app
          </Toggle>
        )}
      </div>
      {verifyBlocked && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          This template tests the running app, which only works in your project folder. In a
          background copy it stops at the test and waits for you.
        </p>
      )}
      {deliver && (
        <Field>
          <FieldLabel>Backlog batch</FieldLabel>
          <FactoryBatch project={project} picked={batch} onPicked={onBatch} onScope={onScope} />
          <FieldDescription>
            Pick items to queue one Factory task each, or leave empty to run the goal.
          </FieldDescription>
        </Field>
      )}
    </>
  );
}
