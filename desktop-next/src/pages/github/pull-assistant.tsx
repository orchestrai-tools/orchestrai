import { daemon } from "@warpforge/daemon";
import type { PullRequestDetails, PullRequestDiff, PullRequestSummary, TaskInfo } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import { useEffect, useState } from "react";
import { SelectMenu } from "../../components/common/select-menu";
import { latestCommands } from "../../lib/commands";
import { modelChoices } from "../../lib/new-task";
import { prAssistantPrompt } from "../../lib/pr-assistant-prompt";
import { assistantTask } from "../../lib/review-decision";
import { useShell } from "../../lib/shell-store";
import { useDaemon } from "../../lib/use-daemon";
import { agentTurnActive } from "../../model/factory";
import { Composer } from "../task/composer";
import { ContinueDialog } from "../task/continue-dialog";
import { Transcript } from "../task/transcript";
import { useTaskFiles } from "../task/use-task-files";
import { errorText } from "./pull-meta";
import { Section } from "./pull-sections";

/**
 * Asking about a change, in place. Explain walks it, Review looks for what is
 * wrong. It answers here: nothing is posted to GitHub.
 */
export function PullAssistant({
  pull,
  detail,
  diff,
}: {
  pull: PullRequestSummary;
  detail: PullRequestDetails | null;
  diff: PullRequestDiff | null;
}) {
  const state = useDaemon();
  const task = assistantTask(state.snapshot.tasks, pull);
  const savedAgent = useShell((shell) => shell.prAssistantAgentId);
  const modelPicks = useShell((shell) => shell.prAssistantModelByAgent);
  const enabled = (state.snapshot.agents ?? []).filter((item) => item.enabled);
  const agent = savedAgent || enabled[0]?.id || state.snapshot.agents?.[0]?.id || "";
  const choices = modelChoices(enabled.find((item) => item.id === agent)?.models ?? []);
  const model = agent ? (modelPicks[agent] ?? "") : "";
  const agentName = (state.snapshot.agents ?? []).find(
    (item) => item.id === (task?.agent ?? agent),
  )?.displayName;
  const [error, setError] = useState("");
  const [starting, setStarting] = useState<"explain" | "review" | null>(null);
  const [historyReady, setHistoryReady] = useState(false);

  useEffect(() => {
    if (!task) return;
    setHistoryReady(false);
    void daemon.loadSessionHistory(task.id).finally(() => setHistoryReady(true));
  }, [task?.id]);

  async function ask(intent: "explain" | "review") {
    if (starting) return;
    setError("");
    const text = prAssistantPrompt({ intent, pr: pull, details: detail, diff });
    if (!text) return;
    if (!task && !agent) {
      setError("Add an agent in Settings to ask about this pull request.");
      return;
    }
    setStarting(intent);
    try {
      if (task) {
        await daemon.request("session.prompt", { task_id: task.id, text, attachments: [] });
      } else {
        await daemon.taskCreate({
          project: pull.project,
          prompt: text,
          agent,
          defaultModel: model || undefined,
          origin: "pr-review",
          tags: ["pr-review", `pr:${pull.repo}#${pull.number}`],
          includeRuntimeContext: false,
          worktree: false,
        });
      }
    } catch (err) {
      setError(errorText(err, "Could not ask the assistant"));
    } finally {
      setStarting(null);
    }
  }

  return (
    <Section
      title={`Ask ${agentName ?? "an agent"} about this change`}
      aside={task ? `${task.status}` : "answers here, posts nothing"}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {!task && enabled.length > 0 && (
          <>
            <SelectMenu
              label="Assistant agent"
              value={agent}
              className="h-6 w-36 text-xs"
              options={enabled.map((item) => ({ value: item.id, label: item.displayName }))}
              onChange={(next) => useShell.getState().setPrAssistantAgent(next)}
            />
            <SelectMenu
              label="Assistant model"
              value={model}
              disabled={choices.length === 0}
              className="h-6 w-36 text-xs"
              options={[
                { value: "", label: "Agent default" },
                ...choices.map((choice) => ({ value: choice.value, label: choice.name })),
              ]}
              onChange={(next) => useShell.getState().setPrAssistantModel(agent, next)}
            />
          </>
        )}
        <Button
          variant="outline"
          size="xs"
          disabled={!!starting || (!task && !agent)}
          title="Walks you through the change, here in this tab"
          onClick={() => void ask("explain")}
        >
          Explain
        </Button>
        <Button
          variant="outline"
          size="xs"
          disabled={!!starting || (!task && !agent)}
          title="Looks for what is wrong with the change, here in this tab"
          onClick={() => void ask("review")}
        >
          Review
        </Button>
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      {starting && <p className="text-xs text-muted-foreground">Reading the pull request…</p>}
      {task ? (
        <AssistantThread task={task} agentName={agentName ?? task.agent} loading={!historyReady} />
      ) : (
        <p className="text-xs text-muted-foreground">
          {agent
            ? "Explain walks the change. Review looks for what is wrong with it. Both stay here."
            : "Add an agent in Settings to ask about this pull request."}
        </p>
      )}
    </Section>
  );
}

/** The assistant's conversation, with the same transcript and composer as the task page. */
function AssistantThread({ task, agentName, loading }: { task: TaskInfo; agentName: string; loading: boolean }) {
  const state = useDaemon();
  const updates = state.sessionUpdates[task.id] ?? [];
  const files = useTaskFiles(task.project, task.id);
  const running = agentTurnActive(task);
  const [branch, setBranch] = useState<{ agent: string; through: number } | null>(null);
  return (
    <div className="flex flex-col gap-2 rounded-md bg-muted/40 p-2">
      <Transcript
        updates={updates}
        project={task.project}
        agents={state.snapshot.agents ?? []}
        known={files.known}
        loading={loading}
        running={running}
        thinking={task.status === "running"}
        onContinue={(agent, through) => setBranch({ agent, through })}
      />
      <Composer
        task={task}
        agentName={agentName}
        running={running}
        commands={latestCommands(updates)}
        updates={updates}
        files={files}
      />
      {branch && (
        <ContinueDialog
          task={task}
          updates={updates}
          throughIndex={branch.through}
          targetAgent={branch.agent}
          onClose={() => setBranch(null)}
        />
      )}
    </div>
  );
}
