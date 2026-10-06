import type { TaskInfo } from "@warpforge/protocol";
import { useState } from "react";
import { latestCommands } from "../../lib/commands";
import { useDaemon } from "../../lib/use-daemon";
import { agentTurnActive } from "../../model/factory";
import { Composer } from "../task/composer";
import { ContinueDialog } from "../task/continue-dialog";
import { Transcript } from "../task/transcript";
import { useSessionHistory, useTaskFiles } from "../task/use-task-files";

/** The conversation on a pinned card: the same transcript and composer as the task page. */
export function PinChat({ task }: { task: TaskInfo }) {
  const state = useDaemon();
  const updates = state.sessionUpdates[task.id] ?? [];
  const loading = useSessionHistory(task.id, updates.length);
  const files = useTaskFiles(task.project, task.id);
  const agents = state.snapshot.agents ?? [];
  const agentName = agents.find((agent) => agent.id === task.agent)?.displayName ?? task.agent;
  const running = agentTurnActive(task);
  const [branch, setBranch] = useState<{ agent: string; through: number } | null>(null);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-3">
        <Transcript
          updates={updates}
          project={task.project}
          agents={agents}
          known={files.known}
          loading={loading}
          running={running}
          thinking={task.status === "running"}
          onContinue={(agent, through) => setBranch({ agent, through })}
        />
      </div>
      <div className="border-t p-2">
        <Composer
          task={task}
          agentName={agentName}
          running={running}
          commands={latestCommands(updates)}
          updates={updates}
          files={files}
        />
      </div>
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
