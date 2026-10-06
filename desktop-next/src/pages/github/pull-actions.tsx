import { daemon } from "@warpforge/daemon";
import type { PullRequestDetails, PullRequestSummary } from "@warpforge/protocol";
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@warpforge/ui/components/dropdown-menu";
import { toast } from "sonner";
import { openExternalLink } from "../../lib/external-link";
import { inboxTaskPrompt, type InboxTaskIntent } from "../../lib/inbox-task-prompt";
import { useTaskDraft } from "../../lib/new-task";
import { copyText, errorText, isLive } from "./pull-meta";

/** What a pull request offers, wherever it is shown: its row menu and its detail share one list. */
export interface PullHandlers {
  openTask: (id: string) => void;
  sendToAgent: (pull: PullRequestSummary, intent: InboxTaskIntent) => void;
}

/** Why Address review comments is or is not available. */
export function commentHandoffHint(unresolved: number | null): string {
  if (unresolved === 0) return "Nothing unresolved on this pull request";
  return "Starts a task on this branch to fix them, commit and push";
}

/** Why the assistant conversation can or cannot move into a task. */
export function assistantHandoffHint(hasTask: boolean): string {
  return hasTask
    ? "Moves the Assistant's conversation into its own task, away from this pull request"
    : "Ask the Assistant something first";
}

/** Open the new-task dialog with a prompt built from the pull request, its conversation and its files. */
export async function sendPullToAgent(
  pull: PullRequestSummary,
  intent: InboxTaskIntent,
  details: PullRequestDetails | null,
): Promise<void> {
  try {
    const [loaded, thread, files] = await Promise.all([
      details ?? daemon.pullDetails(pull.project, pull.number).catch(() => null),
      daemon.pullThread(pull.project, pull.number).catch((err: unknown) => {
        toast.error(errorText(err, "Could not load the conversation"));
        return null;
      }),
      daemon
        .pullDiff(pull.project, pull.number)
        .then((next) => next.files)
        .catch((err: unknown) => {
          toast.error(errorText(err, "Could not load the diff"));
          return null;
        }),
    ]);
    useTaskDraft
      .getState()
      .open(inboxTaskPrompt({ intent, pr: pull, details: loaded, thread, files }));
  } catch (err) {
    toast.error(errorText(err, "Could not prepare the task"));
  }
}

export function SendToAgentItems({
  pull,
  handlers,
  unresolved,
}: {
  pull: PullRequestSummary;
  handlers: PullHandlers;
  /** Unresolved review comments, when the conversation has loaded. */
  unresolved?: number | null;
}) {
  return (
    <>
      <DropdownMenuLabel>Hand the work to an agent, as a task on the board</DropdownMenuLabel>
      <DropdownMenuItem
        className="flex-col items-start gap-0"
        disabled={unresolved === 0}
        onSelect={() => handlers.sendToAgent(pull, "comments")}
      >
        <span>
          Address review comments
          {unresolved ? (
            <span className="ml-1.5 text-muted-foreground tabular-nums">{unresolved}</span>
          ) : null}
        </span>
        <span className="text-xs text-muted-foreground">
          {commentHandoffHint(unresolved ?? null)}
        </span>
      </DropdownMenuItem>
      <DropdownMenuItem
        className="flex-col items-start gap-0"
        onSelect={() => handlers.sendToAgent(pull, "branch")}
      >
        <span>Work on this branch</span>
        <span className="text-xs text-muted-foreground">
          Starts a task that picks the change up where it left off
        </span>
      </DropdownMenuItem>
    </>
  );
}

/** The ⋯ menu: the most used first, copying next. */
export function PullMenuItems({
  pull,
  handlers,
  taskId,
}: {
  pull: PullRequestSummary;
  handlers: PullHandlers;
  taskId?: string;
}) {
  return (
    <>
      {taskId && (
        <DropdownMenuItem onSelect={() => handlers.openTask(taskId)}>
          Open task <span className="font-mono">{taskId}</span>
        </DropdownMenuItem>
      )}
      <DropdownMenuItem onSelect={() => void openExternalLink(pull.url)}>
        Open on GitHub
      </DropdownMenuItem>
      {isLive(pull) && (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Send to agent</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-80">
            <SendToAgentItems pull={pull} handlers={handlers} />
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      )}
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => copyText(pull.url, "link")}>Copy link</DropdownMenuItem>
      <DropdownMenuItem onSelect={() => copyText(pull.headRefName, "branch name")}>
        Copy branch name
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => copyText(pull.baseRefName, "base branch")}>
        Copy base branch
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={() => copyText(`[${pull.title}](${pull.url})`, "title as a link")}
      >
        Copy title as a link
      </DropdownMenuItem>
    </>
  );
}
