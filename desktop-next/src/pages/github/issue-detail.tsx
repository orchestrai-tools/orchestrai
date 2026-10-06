import type { BacklogItem } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import { ExternalLinkIcon, XIcon } from "lucide-react";
import { runStatus, StatusMark } from "../../components/common/status-mark";
import { Markdown } from "../../components/markdown";
import { openExternalLink } from "../../lib/external-link";
import { useDaemon } from "../../lib/use-daemon";
import { issueClosed, issueColumn, issueTask } from "./issue-meta";
import { ago } from "./pull-meta";
import { Section } from "./pull-sections";

/** One issue beside the list, with the one action it usually needs: a task that closes it. */
export function IssueDetail({
  issue,
  started,
  onStart,
  onOpenTask,
  onOpenBacklog,
  onClose,
}: {
  issue: BacklogItem;
  started: Record<string, string>;
  onStart: () => void;
  onOpenTask: (id: string) => void;
  onOpenBacklog: () => void;
  onClose: () => void;
}) {
  const tasks = useDaemon().snapshot.tasks;
  const link = issueTask(issue, tasks, started);
  const open = !issueClosed(issue);
  return (
    <aside aria-label={`Issue #${issue.number}`} className="flex h-full min-h-0 flex-col">
      <header className="flex flex-col gap-1.5 border-b px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="truncate">
            #{issue.number} · {open ? "Open" : "Closed"} · updated {ago(issue.updatedAt)}
          </span>
          <div className="ml-auto flex shrink-0">
            {issue.url && (
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Open on GitHub"
                onClick={() => void openExternalLink(issue.url ?? "")}
              >
                <ExternalLinkIcon />
              </Button>
            )}
            <Button variant="ghost" size="icon-xs" aria-label="Close the detail" onClick={onClose}>
              <XIcon />
            </Button>
          </div>
        </div>
        <h2 className="text-sm leading-snug font-semibold">{issue.title}</h2>
        {open && (
          <div className="flex gap-1.5 pt-1">
            {link ? (
              <Button size="xs" variant="outline" onClick={() => onOpenTask(link.id)}>
                Open task
              </Button>
            ) : (
              <Button size="xs" onClick={onStart}>
                Start task from #{issue.number}…
              </Button>
            )}
          </div>
        )}
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-3">
        {link && (
          <Section title="Task">
            <button
              type="button"
              onClick={() => onOpenTask(link.id)}
              className="flex min-w-0 items-center gap-2 text-left text-xs hover:underline"
            >
              {link.task ? (
                <>
                  <StatusMark status={runStatus(link.task)} />
                  <span className="truncate">{link.task.title || link.task.prompt}</span>
                  <span className="shrink-0 text-muted-foreground">{link.task.agent}</span>
                </>
              ) : (
                <span className="text-muted-foreground">
                  Queued; it starts when a slot frees up.
                </span>
              )}
            </button>
          </Section>
        )}
        <dl className="grid grid-cols-[6rem_1fr] gap-x-2 gap-y-1.5 text-xs">
          <dt className="text-muted-foreground">Backlog</dt>
          <dd>
            <Button
              variant="link"
              size="xs"
              className="h-auto px-0 text-xs"
              onClick={onOpenBacklog}
            >
              {issueColumn(issue.status)} · set its priority there
            </Button>
          </dd>
          <dt className="text-muted-foreground">Priority</dt>
          <dd>{issue.priority === "none" ? "None" : issue.priority}</dd>
          <dt className="text-muted-foreground">Assignee</dt>
          <dd>{issue.assignee ?? "Nobody"}</dd>
        </dl>
        <Section title="Description">
          <Markdown allowHtml className="text-sm">
            {issue.body || "_No description._"}
          </Markdown>
        </Section>
      </div>
    </aside>
  );
}
