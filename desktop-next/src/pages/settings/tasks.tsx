import { daemon } from "@warpforge/daemon";
import { PROJECT_DIR } from "@warpforge/protocol";
import type {
  RunLocation,
  RunnerSettings,
  RunnerSettingsPatch,
  WorkflowMeta,
} from "@warpforge/protocol";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { SelectMenu } from "../../components/common/select-menu";
import { configRole } from "../../lib/config-role";
import { useDaemon } from "../../lib/use-daemon";
import {
  ErrorLine,
  Group,
  Quiet,
  ROW_SELECT,
  Row,
  SectionHeader,
  Stepper,
  fail,
} from "./primitives";

type Limit = "maxConcurrent" | "maxOpenPrs" | "maxPerDay" | "minFreeGb" | "headroomPct";

const LIMITS: readonly {
  key: Limit;
  title: string;
  description: string;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
}[] = [
  {
    key: "maxConcurrent",
    title: "Tasks at the same time",
    description: "Only one of them runs in your project folder.",
    min: 1,
    max: 8,
  },
  {
    key: "maxOpenPrs",
    title: "Pause at open draft PRs",
    description: "New tasks wait while this many of their draft PRs are open.",
    min: 1,
    max: 50,
  },
  {
    key: "maxPerDay",
    title: "New tasks per 24 hours",
    description: "Factory tasks started in any 24 hours.",
    min: 1,
    max: 200,
  },
  {
    key: "minFreeGb",
    title: "Keep disk free",
    description: "New tasks wait below this much free space. 0 turns it off.",
    min: 0,
    max: 500,
    step: 5,
    suffix: " GB",
  },
  {
    key: "headroomPct",
    title: "Pause near quota",
    description:
      "New tasks wait while an agent's quota use is above this. Out of quota always waits.",
    min: 5,
    max: 100,
    step: 5,
    suffix: "%",
  },
];

const LOCATIONS: { value: RunLocation; label: string }[] = [
  { value: "auto", label: "Automatic (recommended)" },
  { value: "worktree", label: "A background copy" },
  { value: "checkout", label: "Your project folder" },
];

/** What a new Factory task starts with in this project, and the limits that hold new ones back. */
export function TasksSection({ project }: { project: string }) {
  const agents = (useDaemon().snapshot.agents ?? []).filter((agent) => agent.enabled);
  const [settings, setSettings] = useState<RunnerSettings | null>(null);
  const [workflows, setWorkflows] = useState<WorkflowMeta[]>([]);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setError(null);
    void Promise.all([daemon.runnerStatus(project), daemon.workflowList(project)])
      .then(([status, list]) => {
        setSettings(status.settings);
        setWorkflows(list);
      })
      .catch((err: unknown) => setError(fail(err, "Could not load Factory settings")));
  }

  useEffect(load, [project]);

  function save(patch: RunnerSettingsPatch) {
    if (!settings) return;
    setSettings({ ...settings, ...patch } as RunnerSettings);
    void daemon
      .runnerUpdateSettings(project, patch)
      .then((next) => setSettings(next.settings))
      .catch((err: unknown) => toast.error(fail(err, "Could not save the Factory settings")));
  }

  const modelOption = settings
    ? agents
        .find((agent) => agent.id === settings.agent)
        ?.models.find((option) => configRole(option) === "model")
    : undefined;

  return (
    <>
      <SectionHeader
        title="Tasks"
        scope="What a new Factory task starts with here. Stored by OrchestrAI on this Mac, not in the repository."
      />

      {error && <ErrorLine message={error} onRetry={load} />}
      {!error && !settings && <Quiet>Loading Factory settings…</Quiet>}
      {settings && (
        <>
          <Group title="New Factory tasks">
            <Row
              title="Workflow"
              description={`The recipe a task runs. Templates live in ${PROJECT_DIR}/workflows.`}
              control={
                <SelectMenu
                  label="Default template"
                  value={settings.workflow}
                  onChange={(workflow) => save({ workflow })}
                  options={workflows.map((workflow) => ({
                    value: workflow.id,
                    label: workflow.name,
                    hint: workflow.valid
                      ? (workflow.stages ?? []).join(" → ") || undefined
                      : `Does not load: ${workflow.error ?? "invalid"}`,
                    disabled: !workflow.valid,
                  }))}
                  className={ROW_SELECT}
                />
              }
            />
            <Row
              title="Lead agent"
              description="Runs every stage the workflow does not pin to another agent."
              control={
                <SelectMenu
                  label="Default lead agent"
                  value={settings.agent}
                  onChange={(agent) => save({ agent, model: "" })}
                  options={[
                    { value: "", label: "First enabled agent" },
                    ...agents.map((agent) => ({ value: agent.id, label: agent.displayName })),
                  ]}
                  className={ROW_SELECT}
                />
              }
            />
            <Row
              title="Model"
              description={
                modelOption
                  ? "Which of the lead agent's models it uses."
                  : "The model list fills after that agent has run once."
              }
              control={
                <SelectMenu
                  label="Default model"
                  value={settings.model ?? ""}
                  onChange={(model) => save({ model })}
                  disabled={!modelOption}
                  options={[
                    { value: "", label: "Agent default" },
                    ...(modelOption?.options ?? []).map((choice) => ({
                      value: choice.value,
                      label: choice.name,
                    })),
                  ]}
                  className={ROW_SELECT}
                />
              }
            />
            <Row
              title="Where it runs"
              description="Automatic uses your project folder when the task tests the running app, a background copy otherwise."
              control={
                <SelectMenu
                  label="Default place to run"
                  value={settings.runLocation}
                  onChange={(runLocation) => save({ runLocation: runLocation as RunLocation })}
                  options={LOCATIONS}
                  className={ROW_SELECT}
                />
              }
            />
          </Group>

          <Group
            title="Factory limits"
            note="Limits only hold back starting new Factory tasks and backlog batches, never a stage of a task already running."
          >
            {LIMITS.map((limit) => (
              <Row
                key={limit.key}
                title={limit.title}
                description={limit.description}
                control={
                  <Stepper
                    label={limit.title.toLowerCase()}
                    value={settings[limit.key]}
                    min={limit.min}
                    max={limit.max}
                    step={limit.step}
                    suffix={limit.suffix}
                    onChange={(value) => save({ [limit.key]: value })}
                  />
                }
              />
            ))}
          </Group>
        </>
      )}
    </>
  );
}
