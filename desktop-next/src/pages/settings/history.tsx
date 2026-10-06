import { daemon } from "@warpforge/daemon";
import type { HistorySettings } from "@warpforge/protocol";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { SelectMenu } from "../../components/common/select-menu";
import { taskLifecycle } from "../../lib/history-notice";
import { modelChoices } from "../../lib/new-task";
import { useShell } from "../../lib/shell-store";
import { useDaemon } from "../../lib/use-daemon";
import {
  ErrorLine,
  Group,
  Quiet,
  ROW_SELECT,
  Row,
  SectionHeader,
  SwitchRow,
  fail,
} from "./primitives";

const KEEP = [
  { value: 15, label: "15 days" },
  { value: 30, label: "30 days" },
  { value: 60, label: "60 days" },
  { value: 0, label: "Forever" },
];
const SETTLE = [
  { value: 7, label: "7 days" },
  { value: 14, label: "14 days" },
  { value: 30, label: "30 days" },
  { value: 0, label: "Off" },
];
const REMOVE = [
  { value: 60, label: "60 days" },
  { value: 90, label: "90 days" },
  { value: 180, label: "180 days" },
  { value: 0, label: "Forever" },
];

/** A day select that still shows a value saved outside the usual choices. */
function DaySelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: number;
  options: { value: number; label: string }[];
  onChange: (value: number) => void;
}) {
  const choices = options.some((option) => option.value === value)
    ? options
    : [{ value, label: `${value} days` }, ...options];
  return (
    <SelectMenu
      label={label}
      value={String(value)}
      options={choices.map((option) => ({ value: String(option.value), label: option.label }))}
      onChange={(next) => onChange(Number(next))}
      className={ROW_SELECT}
    />
  );
}

/** Text the agents write for you, and how long finished tasks are kept. Every project. */
export function HistorySection() {
  const shell = useShell();
  const enabled = (useDaemon().snapshot.agents ?? []).filter((agent) => agent.enabled);
  const agentOptions = enabled.map((agent) => ({ value: agent.id, label: agent.displayName }));
  const gitModels = modelChoices(
    enabled.find((agent) => agent.id === shell.textGenAgentId)?.models ?? [],
  );
  const prAgent = shell.prAssistantAgentId;
  const prModels = modelChoices(enabled.find((agent) => agent.id === prAgent)?.models ?? []);
  const prModel = prAgent ? (shell.prAssistantModelByAgent[prAgent] ?? "") : "";
  const [settings, setSettings] = useState<HistorySettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    void daemon
      .historySettings()
      .then((next) => {
        if (!cancelled) setSettings(next);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(fail(err, "Could not load task history"));
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  function apply(patch: Partial<HistorySettings>) {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    void daemon
      .setHistorySettings(next)
      .then(setSettings)
      .catch((err: unknown) => toast.error(fail(err, "Could not save task history")));
  }

  return (
    <>
      <SectionHeader
        title="Tasks & history"
        scope="For every project. Pruning runs at start, once a day, and right after a change."
      />

      <Group
        title="Text the agents write for you"
        note="Model lists fill after that agent has run once."
      >
        <SwitchRow
          title="Name new tasks"
          description="Gives a new task a short title, once, right after it is created."
          checked={shell.autoNameTasks}
          onChange={shell.setAutoNameTasks}
        />
        <Row
          title="Commit messages and PR descriptions"
          description="Drafted from the diff when you ask. Never automatically."
          control={
            <SelectMenu
              label="Agent for git text"
              value={shell.textGenAgentId}
              options={[{ value: "", label: "None" }, ...agentOptions]}
              onChange={(id) => shell.setTextGen(id, "")}
              className={ROW_SELECT}
            />
          }
        />
        {shell.textGenAgentId && (
          <Row
            title="Model"
            description="Which of that agent's models writes it."
            control={
              <SelectMenu
                label="Model for git text"
                value={shell.textGenModel}
                options={[
                  { value: "", label: "Agent default" },
                  ...gitModels.map((choice) => ({ value: choice.value, label: choice.name })),
                ]}
                onChange={(model) => shell.setTextGen(shell.textGenAgentId, model)}
                disabled={gitModels.length === 0}
                className={ROW_SELECT}
              />
            }
          />
        )}
        <Row
          title="Pull request assistant"
          description="Explain and Review on a pull request use this agent."
          control={
            <SelectMenu
              label="Pull request assistant"
              value={prAgent}
              options={[{ value: "", label: "First available" }, ...agentOptions]}
              onChange={shell.setPrAssistantAgent}
              className={ROW_SELECT}
            />
          }
        />
        {prAgent && (
          <Row
            title="Assistant model"
            description="Remembered for this agent."
            control={
              <SelectMenu
                label="Model for the pull request assistant"
                value={prModel}
                options={[
                  { value: "", label: "Agent default" },
                  ...prModels.map((choice) => ({ value: choice.value, label: choice.name })),
                ]}
                onChange={(model) => shell.setPrAssistantModel(prAgent, model)}
                disabled={prModels.length === 0}
                className={ROW_SELECT}
              />
            }
          />
        )}
      </Group>

      <Group
        title="Task history"
        note={
          settings
            ? taskLifecycle(
                settings.settleIgnoredAfterDays,
                settings.retentionDays,
                settings.deleteClosedAfterDays,
              )
            : undefined
        }
      >
        {error && <ErrorLine message={error} onRetry={() => setAttempt((count) => count + 1)} />}
        {!error && !settings && <Quiet>Loading task history…</Quiet>}
        {settings && (
          <>
            <Row
              title="Keep conversations for"
              description="Only the chat is removed. The title, prompt, and diff stay."
              control={
                <DaySelect
                  label="Keep conversations"
                  value={settings.retentionDays}
                  options={KEEP}
                  onChange={(retentionDays) => apply({ retentionDays })}
                />
              }
            />
            <Row
              title="Settle ignored waiting tasks after"
              description="Only a finished turn with no changes. A task with changes is left alone."
              control={
                <DaySelect
                  label="Settle ignored waiting tasks"
                  value={settings.settleIgnoredAfterDays}
                  options={SETTLE}
                  onChange={(settleIgnoredAfterDays) => apply({ settleIgnoredAfterDays })}
                />
              }
            />
            <Row
              title="Delete closed tasks after"
              description="Commits stay in git. A task with unmerged changes is kept."
              control={
                <DaySelect
                  label="Delete closed tasks"
                  value={settings.deleteClosedAfterDays}
                  options={REMOVE}
                  onChange={(deleteClosedAfterDays) => apply({ deleteClosedAfterDays })}
                />
              }
            />
          </>
        )}
      </Group>
    </>
  );
}
