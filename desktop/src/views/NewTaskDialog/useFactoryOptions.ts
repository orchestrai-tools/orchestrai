import { useState } from "react";

import { sourceAvailable, useProjectSources } from "@/components/backlog/use-tracker";
import { locationNote, resolveLocation, type ResolvedLocation } from "@/lib/factory";
import type { EntryRunLocation, RunLocation, RunnerSettings, WorkflowMeta } from "@/protocol";

const FROM_SETTING: Record<RunLocation, EntryRunLocation> = {
  auto: "default",
  checkout: "checkout",
  worktree: "worktree",
};

export interface FactoryOptions {
  /** Open a draft PR when the run succeeds. */
  deliver: boolean;
  setDeliver: (deliver: boolean) => void;
  /** What the person picked; `default` is Automatic. */
  location: EntryRunLocation;
  setLocation: (location: EntryRunLocation) => void;
  /** Where it will actually run. */
  resolved: ResolvedLocation;
  note: string;
  /** Whether the selected template tests the running app. */
  testing: boolean;
  /** Whether the project has a template that tests the running app. */
  canTest: boolean;
  setTesting: (on: boolean) => void;
  /** A required browser check in a background copy stops and waits for you. */
  verifyBlocked: boolean;
}

function prefer(templates: WorkflowMeta[], ...ids: (string | undefined)[]) {
  return ids.map((id) => templates.find((t) => t.id === id)).find(Boolean) ?? templates[0];
}

/**
 * The Factory choices of the New Task dialog: where it runs, whether it
 * opens a draft PR, and the "Test in the running app" switch between
 * templates. A choice nobody touched follows the project.
 * @param props.project The selected project.
 * @param props.settings The project's Factory settings, once loaded.
 * @param props.workflows The project's templates.
 * @param props.selected The selected template.
 * @param props.onWorkflow Selects a template.
 * @returns The options and their setters.
 */
export function useFactoryOptions({
  project,
  settings,
  workflows,
  selected,
  onWorkflow,
}: {
  project: string;
  settings: RunnerSettings | undefined;
  workflows: WorkflowMeta[];
  selected: WorkflowMeta | null;
  onWorkflow: (id: string) => void;
}): FactoryOptions {
  const sources = useProjectSources(project);
  const [picks, setPicks] = useState<{
    project: string;
    deliver: boolean | null;
    location: EntryRunLocation | null;
  }>({ deliver: null, location: null, project });
  const current = picks.project === project ? picks : { deliver: null, location: null, project };
  const deliver = current.deliver ?? sourceAvailable(sources.data, "github");
  const location = current.location ?? FROM_SETTING[settings?.runLocation ?? "auto"];
  const testing = selected?.verifyRequired != null;
  const resolved = resolveLocation(settings?.runLocation ?? "auto", location, selected);
  const valid = workflows.filter((template) => template.valid);
  const tests = valid.filter((template) => template.verifyRequired != null);
  const plain = valid.filter((template) => template.verifyRequired == null);

  return {
    canTest: tests.length > 0,
    deliver,
    location,
    note: locationNote(resolved, location, testing),
    resolved,
    setDeliver: (next) => setPicks({ ...current, deliver: next }),
    setLocation: (next) => setPicks({ ...current, location: next }),
    setTesting: (on) => {
      const pick = on
        ? prefer(tests, "verify-review-loop", settings?.workflow)
        : prefer(plain, settings?.workflow, "review-loop");
      if (pick) onWorkflow(pick.id);
    },
    testing,
    verifyBlocked: resolved === "worktree" && selected?.verifyRequired === true,
  };
}
