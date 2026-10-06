import type { TaskInfo, TaskPullRequest } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@warpforge/ui/components/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@warpforge/ui/components/tooltip";
import { cn } from "@warpforge/ui/lib/utils";
import { GitPullRequestIcon, NetworkIcon, SparklesIcon } from "lucide-react";
import { agentFamily, isLead, memberLabel } from "../../lib/agent-family";
import { openExternalLink } from "../../lib/external-link";
import { useShell } from "../../lib/shell-store";
import { pullCheckLabel, pullStateLabel } from "../../lib/task-pull";

const CHECK_TONE: Record<string, string> = {
  failing: "bg-red-500",
  passing: "bg-emerald-500",
  pending: "bg-amber-500",
};

/** The task's pull request, its state and checks; opens it on the forge. */
export function PullButton({ pull }: { pull: TaskPullRequest | undefined }) {
  if (!pull) return null;
  const checks = pullCheckLabel(pull);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline" size="sm" onClick={() => void openExternalLink(pull.url)}>
          <GitPullRequestIcon />#{pull.number}
          <span className="text-muted-foreground">{pullStateLabel(pull)}</span>
          {checks && (
            <span
              aria-label={checks}
              className={cn(
                "size-1.5 rounded-full",
                CHECK_TONE[pull.checks ?? ""] ?? "bg-muted-foreground/40",
              )}
            />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {pull.title}
        {checks ? ` · ${checks}` : ""}
      </TooltipContent>
    </Tooltip>
  );
}

/** The advisor this task's agent may consult, and how often it has. Opens the advisor's own conversation. */
export function AdvisorButton({ task }: { task: TaskInfo }) {
  const advisor = task.advisor;
  if (!advisor) return null;
  const asked =
    advisor.consultations === 0
      ? "Not consulted yet"
      : `Consulted ${advisor.consultations} time${advisor.consultations === 1 ? "" : "s"}`;
  const advisorTask = advisor.taskId;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={!advisorTask}
          aria-label={`Open advisor conversation (${advisor.agent})`}
          onClick={() => advisorTask && useShell.getState().openTask(advisorTask, task.project)}
        >
          <SparklesIcon />
          {advisor.agent}
          {advisor.consultations > 0 && (
            <span className="text-muted-foreground tabular-nums">{advisor.consultations}</span>
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {advisorTask ? `${asked}. Open the advisor's conversation` : asked}
      </TooltipContent>
    </Tooltip>
  );
}

/** For an orchestrator and its workers: one menu to move between their sessions. */
export function AgentSwitchMenu({ task, tasks }: { task: TaskInfo; tasks: TaskInfo[] }) {
  const family = agentFamily(task.id, tasks);
  const root = family[0];
  if (!root || !isLead(root, family.length - 1)) return null;
  if (family.length <= 1) {
    return (
      <>
        <span aria-hidden>·</span>
        <span className="inline-flex items-center gap-1">
          <NetworkIcon aria-hidden className="size-3" />
          Orchestrator
        </span>
      </>
    );
  }
  return (
    <>
      <span aria-hidden>·</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Switch agent session"
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            <NetworkIcon aria-hidden className="size-3" />
            {family.length - 1} workers
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            Sessions in this run
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={task.id}
            onValueChange={(id) => useShell.getState().openTask(id, task.project)}
          >
            {family.map((member, index) => (
              <DropdownMenuRadioItem key={member.id} value={member.id}>
                <span className="min-w-0 flex-1 truncate">{memberLabel(member, index, root)}</span>
                <span className="text-xs text-muted-foreground">{member.status}</span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
