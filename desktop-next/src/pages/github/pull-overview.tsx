import type {
  PullCheckRun,
  PullRequestDetails,
  PullRequestDiff,
  PullRequestSummary,
} from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import { runStatus, StatusMark } from "../../components/common/status-mark";
import { Markdown } from "../../components/markdown";
import { PullThreadView } from "../../components/pull-thread";
import { assistantTask } from "../../lib/review-decision";
import { useDaemon } from "../../lib/use-daemon";
import { assistantHandoffHint, commentHandoffHint, type PullHandlers } from "./pull-actions";
import { copyText, pullTask } from "./pull-meta";
import { ChecksList, FilesChanged, Section } from "./pull-sections";

/** The pull request read top to bottom: its task, hand-offs, CI, review, branch and description. */
export function PullOverview({
  pull,
  detail,
  checks,
  checksError,
  diff,
  diffError,
  unresolved,
  handlers,
  onRetry,
  onOpenFile,
  onOpenDiff,
}: {
  pull: PullRequestSummary;
  detail: PullRequestDetails;
  checks: PullCheckRun[] | null;
  checksError: string | null;
  diff: PullRequestDiff | null;
  diffError: string | null;
  unresolved: number | null;
  handlers: PullHandlers;
  onRetry: () => void;
  onOpenFile: (path: string) => void;
  onOpenDiff: () => void;
}) {
  const state = useDaemon();
  const linked = pullTask(pull, state.snapshot.tasks, state.taskPullRequests);
  const assistant = assistantTask(state.snapshot.tasks, pull);
  const live = pull.state === "open";

  return (
    <div className="flex flex-col gap-5">
      {linked && (
        <Section title="Task">
          <button
            type="button"
            onClick={() => handlers.openTask(linked.task.id)}
            className="flex min-w-0 items-center gap-2 text-left text-xs hover:underline"
          >
            <StatusMark status={runStatus(linked.task, true)} />
            <span className="truncate">{linked.task.title || linked.task.prompt}</span>
            <span className="shrink-0 text-muted-foreground">{linked.task.agent}</span>
          </button>
        </Section>
      )}
      {live && (
        <Section title="Hand off">
          <div className="flex flex-wrap gap-1.5">
            <Button
              variant="outline"
              size="xs"
              disabled={unresolved === null || unresolved === 0}
              title={commentHandoffHint(unresolved)}
              onClick={() => handlers.sendToAgent(pull, "comments")}
            >
              {`Address review comments${unresolved ? ` ${unresolved}` : ""}`}
            </Button>
            <Button
              variant="outline"
              size="xs"
              title="Starts a task that picks the change up where it left off"
              onClick={() => handlers.sendToAgent(pull, "branch")}
            >
              Work on this branch
            </Button>
            <Button
              variant="outline"
              size="xs"
              disabled={!assistant}
              title={assistantHandoffHint(assistant !== null)}
              onClick={() => assistant && handlers.openTask(assistant.id)}
            >
              Continue in a task
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Each starts a task on the board. {commentHandoffHint(unresolved)}.
          </p>
        </Section>
      )}
      <Section title="Checks">
        <ChecksList checks={checks} error={checksError} onRetry={onRetry} />
      </Section>
      <PullThreadView
        project={pull.project}
        number={pull.number}
        requests={detail.reviewRequests}
        author={detail.author?.login ?? pull.author?.login}
        onOpenDiff={onOpenDiff}
      />
      <Section title="Branch">
        <p className="flex min-w-0 items-center gap-1.5 text-xs">
          <button
            type="button"
            onClick={() => copyText(detail.headRefName, "branch name")}
            className="truncate font-mono hover:underline"
            title="Copy branch name"
          >
            {detail.headRefName}
          </button>
          <span className="shrink-0 text-muted-foreground">into</span>
          <button
            type="button"
            onClick={() => copyText(detail.baseRefName, "base branch")}
            className="shrink-0 font-mono hover:underline"
            title="Copy base branch"
          >
            {detail.baseRefName}
          </button>
        </p>
      </Section>
      {pull.labels.length > 0 && (
        <Section title="Labels">
          <div className="flex flex-wrap gap-1">
            {pull.labels.map((label) => (
              <span
                key={label.name}
                className="inline-flex items-center gap-1 rounded-sm border px-1.5 text-xs text-muted-foreground"
              >
                {label.name}
              </span>
            ))}
          </div>
        </Section>
      )}
      {pull.assignees.length > 0 && (
        <Section title="Assignees">
          <p className="text-xs">{pull.assignees.join(", ")}</p>
        </Section>
      )}
      <Section title="Description">
        <Markdown allowHtml className="text-sm">
          {detail.body || "_No description._"}
        </Markdown>
      </Section>
      <FilesChanged
        files={diff?.files ?? null}
        error={diffError}
        additions={detail.additions}
        deletions={detail.deletions}
        onOpenFile={onOpenFile}
      />
    </div>
  );
}
