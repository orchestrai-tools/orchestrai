import { useQueryClient } from "@tanstack/react-query";
import { Factory, Pause, Play, Settings2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { daemon } from "@/daemon";
import { runnerStatusKey, useRunner } from "@/hooks/useRunner";
import { cn } from "@/lib/utils";
import type { AgentConfig, TaskInfo } from "@/protocol";

import { FactoryQueue } from "./FactoryQueue";
import { FactoryRuns } from "./FactoryRuns";
import { FactorySettings } from "./FactorySettings";

interface FactorySurfaceProps {
  project: string;
  agents: AgentConfig[];
  tasks: TaskInfo[];
  onOpenTask: (taskId: string) => void;
}

/**
 * The project's Factory: queued backlog items run one pipeline each and come
 * back as draft pull requests. Start and Pause here; queue items from the
 * backlog with Run in Factory.
 *
 * @param props.project The project name.
 * @param props.agents Every configured agent, for the settings.
 * @param props.tasks Every task the daemon knows, to link runs to live ones.
 * @param props.onOpenTask Opens a pipeline task.
 */
export function FactorySurface({ project, agents, tasks, onOpenTask }: FactorySurfaceProps) {
  const queryClient = useQueryClient();
  const { runs, status } = useRunner(project);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const liveTaskIds = useMemo(() => new Set(tasks.map((task) => task.id)), [tasks]);
  const data = status.data;

  if (status.isError) {
    return (
      <p className="px-4 py-3 text-[13px] text-destructive">
        Could not load the Factory: {status.error.message}
      </p>
    );
  }
  if (!data) return null;
  const { settings } = data;

  const toggle = async () => {
    try {
      const next = await daemon.runnerUpdateSettings(project, { running: !settings.running });
      queryClient.setQueryData(runnerStatusKey(project), next);
    } catch (error) {
      toast.error(
        settings.running ? "Could not pause the Factory" : "Could not start the Factory",
        {
          description: error instanceof Error ? error.message : String(error),
        },
      );
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-4">
        <header className="flex flex-wrap items-center gap-3">
          <Factory className="size-4 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[13px]">
              <span className="font-medium">Factory</span>
              <span
                className={cn(
                  "rounded-full border px-2 py-px text-[11px]",
                  settings.running
                    ? "border-ok/40 bg-ok/10 text-ok"
                    : "border-border text-muted-foreground",
                )}
              >
                {settings.running ? "Running" : "Paused"}
              </span>
              <span className="tnum text-[11px] text-muted-foreground">
                {data.dispatchedToday}/{settings.maxPerDay} started today · workflow{" "}
                {settings.workflow}
              </span>
            </div>
            {data.hold && (
              <div className="truncate text-[11px] text-muted-foreground" title={data.hold}>
                Waiting: {data.hold}
              </div>
            )}
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 gap-1.5"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings2 className="size-3.5" />
            Settings
          </Button>
          <Button size="sm" className="h-8 gap-1.5" onClick={() => void toggle()}>
            {settings.running ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
            {settings.running ? "Pause" : "Start"}
          </Button>
        </header>
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          Each item runs through the workflow in a fresh worktree. When its review passes, the
          Factory commits the change, pushes it and opens a draft pull request for you to review.
          Merging the pull request marks the item done. Pausing lets running items finish.
        </p>
        <FactoryQueue project={project} entries={data.entries} onOpenTask={onOpenTask} />
        <FactoryRuns runs={runs.data ?? []} liveTaskIds={liveTaskIds} onOpenTask={onOpenTask} />
      </div>
      <FactorySettings
        open={settingsOpen}
        settings={settings}
        agents={agents}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}
