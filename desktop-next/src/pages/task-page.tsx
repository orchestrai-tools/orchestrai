import { Button } from "@warpforge/ui/components/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@warpforge/ui/components/tabs";
import { useState } from "react";
import { latestCommands } from "../lib/commands";
import { attachContext } from "../lib/composer-chips";
import { useChatAutoName } from "../lib/quick-chat";
import { isChat } from "../model/chat";
import { useShell } from "../lib/shell-store";
import { useOpenTaskPull } from "../lib/task-pull";
import { useDaemon } from "../lib/use-daemon";
import { agentTurnActive } from "../model/factory";
import { AttentionCard } from "./task/attention-card";
import { BrowserPane } from "./task/browser-pane";
import { Composer } from "./task/composer";
import { ContinueDialog } from "./task/continue-dialog";
import { latestPlan, PlanPane } from "./task/plan-pane";
import { QueuedPrompts } from "./task/queued-prompts";
import { StepsPane } from "./task/steps-pane";
import { TaskHeader } from "./task/task-header";
import { TaskNotices } from "./task/task-notices";
import { Transcript } from "./task/transcript";
import { useSessionHistory, useTaskFiles } from "./task/use-task-files";

function GoneTask({ picked }: { picked: boolean }) {
  const shell = useShell();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-sm font-medium">{picked ? "This task is gone" : "Pick a task"}</p>
      <p className="text-sm text-muted-foreground">
        {picked
          ? "It was deleted or archived."
          : "Open a task from the board to see its conversation."}
      </p>
      <Button
        variant="outline"
        onClick={() => {
          if (!shell.project) {
            shell.openHome();
            return;
          }
          shell.setFileContext(null);
          shell.openProject(shell.project);
          shell.setPage("board");
        }}
      >
        Back to the board
      </Button>
    </div>
  );
}

/** One agent conversation: header, notices, the transcript, plan, steps, browser, and the composer. */
export function TaskPage() {
  const shell = useShell();
  const state = useDaemon();
  const task = state.snapshot.tasks.find((item) => item.id === shell.taskId);
  useOpenTaskPull(task?.id, Boolean(task?.worktree));
  const updates = shell.taskId ? (state.sessionUpdates[shell.taskId] ?? []) : [];
  const loading = useSessionHistory(shell.taskId, updates.length);
  const files = useTaskFiles(task?.project, task?.id);
  const [branch, setBranch] = useState<{ agent: string; through: number } | null>(null);
  useChatAutoName(task);

  if (!task) return <GoneTask picked={Boolean(shell.taskId)} />;

  const agents = state.snapshot.agents ?? [];
  const agentName = agents.find((agent) => agent.id === task.agent)?.displayName ?? task.agent;
  const pull = state.taskPullRequests?.[task.id];
  const running = agentTurnActive(task);
  const plan = latestPlan(updates);
  const planDone = plan?.filter((entry) => entry.status === "completed").length ?? 0;
  const continueFromEnd = (agent: string) =>
    setBranch({ agent, through: Math.max(0, updates.length - 1) });

  const top = (
    <>
      <TaskHeader task={task} pull={pull} updates={updates} onContinue={continueFromEnd} />
      <TaskNotices
        task={task}
        agentName={agentName}
        pull={pull}
        canContinue={updates.length > 0}
        onContinue={() => continueFromEnd(task.agent)}
      />
      <AttentionCard task={task} updates={updates} agentName={agentName} pull={pull} />
      <TabsList>
        <TabsTrigger value="conversation">Conversation</TabsTrigger>
        <TabsTrigger value="plan">
          Plan
          {plan && plan.length > 0 && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {planDone}/{plan.length}
            </span>
          )}
        </TabsTrigger>
        <TabsTrigger value="steps">Steps</TabsTrigger>
        <TabsTrigger value="browser">Browser</TabsTrigger>
      </TabsList>
    </>
  );

  return (
    <Tabs
      value={shell.taskTab}
      onValueChange={(next) => shell.setTaskTab(next as typeof shell.taskTab)}
      className="flex h-full flex-col gap-0"
    >
      <TabsContent value="conversation" className="min-h-0 flex-1">
        <Transcript
          updates={updates}
          project={task.project}
          agents={agents}
          known={files.known}
          loading={loading}
          running={running}
          thinking={task.status === "running"}
          onContinue={(agent, through) => setBranch({ agent, through })}
          header={top}
          emptyHint={
            isChat(task)
              ? `Ask ${agentName} anything about ${task.project}. The agent starts when you send.`
              : undefined
          }
        />
      </TabsContent>
      <TabsContent value="plan" className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex w-full flex-col gap-5 px-6 py-5">
          {top}
          <PlanPane updates={updates} report={task.workflowRun?.report} known={files.known} />
        </div>
      </TabsContent>
      <TabsContent value="steps" className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex w-full flex-col gap-5 px-6 py-5">
          {top}
          <StepsPane task={task} />
        </div>
      </TabsContent>
      <TabsContent value="browser" className="flex min-h-0 flex-1 flex-col gap-4 px-6 py-5">
        <div className="flex w-full shrink-0 flex-col gap-5">{top}</div>
        <BrowserPane
          key={task.id}
          taskId={task.id}
          project={task.project}
          className="flex-1"
          onPick={(text, label) => attachContext(task.project, label || "Browser element", text)}
        />
      </TabsContent>
      <div className="flex w-full shrink-0 flex-col gap-2 px-6 pb-4">
        {shell.taskTab === "conversation" && (
          <>
            <QueuedPrompts taskId={task.id} queued={task.queuedPrompts ?? []} />
            <Composer
              task={task}
              agentName={agentName}
              running={running}
              commands={latestCommands(updates)}
              updates={updates}
              files={files}
            />
          </>
        )}
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
    </Tabs>
  );
}
