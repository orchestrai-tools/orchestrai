import type { SessionUpdate, TaskInfo } from "@warpforge/protocol";
import { cn } from "@warpforge/ui/lib/utils";

import { editLine } from "../../lib/editor-nav";
import {
  attachmentNames,
  includedServices,
  latestVerification,
  serviceLineUrl,
} from "../../lib/inspector-context";
import { plural } from "../../lib/plural";
import { commentHeading } from "../../lib/pull-thread";
import { useShell } from "../../lib/shell-store";
import { useDaemon } from "../../lib/use-daemon";
import { Empty, LinkText, Port, Row, Rows } from "./rows";

const NO_UPDATES: SessionUpdate[] = [];

/** The open task, when the page shows one. */
function useOpenTask(): { task: TaskInfo | undefined; updates: SessionUpdate[] } {
  const shell = useShell();
  const state = useDaemon();
  const task = state.snapshot.tasks.find(
    (item) => item.id === shell.taskId && item.project === shell.project,
  );
  return { task, updates: task ? (state.sessionUpdates[task.id] ?? NO_UPDATES) : NO_UPDATES };
}

type FileEdit = Extract<SessionUpdate, { kind: "file_edit" }>;

export function ChangesPanel() {
  const { task, updates } = useOpenTask();
  if (!task) return <Empty>Open a task to see the files it changed.</Empty>;
  const edits = new Map<string, FileEdit>();
  for (const update of updates) if (update.kind === "file_edit") edits.set(update.path, update);
  if (edits.size === 0)
    return (
      <Empty>{plural(task.filesChanged, "file")} changed. Open Changes to see the diff.</Empty>
    );
  return (
    <ul className="px-2 py-2">
      {[...edits.values()].map((edit) => (
        <li key={edit.path}>
          <button
            type="button"
            onClick={() =>
              useShell.getState().setFileJump({ path: edit.path, line: editLine(edit.hunks) })
            }
            className="flex w-full items-center gap-2 rounded-sm px-2 py-(--row-py) text-left text-xs hover:bg-sidebar-accent"
          >
            <span className="min-w-0 truncate font-mono" title={edit.path}>
              {edit.path.split("/").at(-1)}
            </span>
            <span className="ml-auto shrink-0 tabular-nums">
              <span className="text-emerald-600 dark:text-emerald-400">+{edit.additions ?? 0}</span>{" "}
              <span className="text-red-600 dark:text-red-400">−{edit.deletions ?? 0}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function ChecksPanel() {
  const { task } = useOpenTask();
  const pulls = useDaemon().taskPullRequests;
  if (!task) return <Empty>Open a task to see its checks.</Empty>;
  const pull = pulls?.[task.id];
  const verification = latestVerification(task.workflowRun?.verifications);
  if (!pull && !verification)
    return <Empty>No pull request or verification on this task yet.</Empty>;
  return (
    <div className="px-4 py-2 text-xs">
      {pull && (
        <dl>
          <Row label="Pull request">
            <LinkText url={pull.url}>
              #{pull.number} · {pull.state}
            </LinkText>
          </Row>
          {pull.checks && <Row label="Checks">{pull.checks}</Row>}
        </dl>
      )}
      {(pull?.failedChecks ?? []).length > 0 && (
        <ul className="py-1">
          {(pull?.failedChecks ?? []).map((check) => (
            <li key={check.name} className="flex items-center gap-2 py-(--row-py)">
              <span className="w-14 shrink-0 text-red-600 dark:text-red-400">failing</span>
              {check.url ? (
                <LinkText url={check.url}>
                  <span className="font-mono">{check.name}</span>
                </LinkText>
              ) : (
                <span className="min-w-0 truncate font-mono">{check.name}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {(pull?.openComments ?? []).slice(0, 6).map((comment) => (
        <p key={comment.id} className="truncate py-(--row-py) text-muted-foreground">
          {comment.url ? (
            <LinkText url={comment.url}>{commentHeading(comment)}</LinkText>
          ) : (
            commentHeading(comment)
          )}
          {comment.body.trim() ? ` — ${comment.body.trim().split("\n")[0]}` : ""}
        </p>
      ))}
      {verification && (
        <div className="pt-2">
          <p className="pb-1 text-muted-foreground">
            Verification {verification.verdict ?? "testing"} · attempt {verification.attempt}
          </p>
          {verification.summary && <p className="pb-1">{verification.summary}</p>}
          <ul>
            {verification.checklist.map((item) => (
              <li key={`${item.status}:${item.step}`} className="flex gap-2 py-(--row-py)">
                <span
                  className={cn(
                    "w-14 shrink-0",
                    item.status === "pass" && "text-emerald-600 dark:text-emerald-400",
                    item.status === "fail" && "text-red-600 dark:text-red-400",
                  )}
                >
                  {item.status}
                </span>
                <span className="min-w-0">{item.step}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ServiceLine({ line }: { line: string }) {
  const url = serviceLineUrl(line);
  if (!url) return <>{line}</>;
  const [before, after] = line.split(url);
  return (
    <>
      {before}
      <LinkText url={url}>{url}</LinkText>
      {after}
    </>
  );
}

export function ContextPanel() {
  const { task, updates } = useOpenTask();
  const services = useDaemon().snapshot.services;
  if (!task)
    return <Empty>Open a task to see which files, services, and branch it received.</Empty>;
  const first = updates.find((update) => update.kind === "user_message");
  const included = first && first.kind === "user_message" ? includedServices(first.text) : [];
  const live = services.filter(
    (service) =>
      service.project === task.project &&
      service.allocatedPort > 0 &&
      (service.status === "running" || service.status === "starting"),
  );
  const files = attachmentNames(updates);
  return (
    <Rows>
      <Row label="Worktree">
        <span className="font-mono">{task.worktree ?? "checkout"}</span>
      </Row>
      <Row label="Base">
        <span className="font-mono">{task.baseBranch ?? "default"}</span>
      </Row>
      {files.length > 0 && <Row label="Attachments">{files.join(", ")}</Row>}
      {included.map((line) => (
        <Row key={line} label="Service">
          <ServiceLine line={line} />
        </Row>
      ))}
      {included.length === 0 &&
        live.map((service) => (
          <Row key={service.name} label={service.name}>
            <Port port={service.allocatedPort} running={service.status === "running"} />
            {service.status === "starting" ? " (starting)" : ""}
          </Row>
        ))}
      {task.tags.length > 0 && <Row label="Tags">{task.tags.join(", ")}</Row>}
    </Rows>
  );
}

const TOOL_TONE: Record<string, string> = {
  completed: "text-emerald-600 dark:text-emerald-400",
  failed: "text-red-600 dark:text-red-400",
};

export function ActivityPanel() {
  const { task, updates } = useOpenTask();
  if (!task) return <Empty>Open a task to see each action its agent took.</Empty>;
  const receipts = updates
    .filter((update) => update.kind === "tool_call" || update.kind === "file_edit")
    .slice(-40);
  if (receipts.length === 0) return <Empty>No tool calls yet.</Empty>;
  return (
    <ol className="px-2 py-2">
      {receipts.map((update, index) =>
        update.kind === "file_edit" ? (
          <li key={`edit-${index}`}>
            <button
              type="button"
              onClick={() =>
                useShell.getState().setFileJump({ path: update.path, line: editLine(update.hunks) })
              }
              className="flex w-full gap-2 rounded-sm px-2 py-(--row-py) text-left text-xs hover:bg-sidebar-accent"
            >
              <span className="w-14 shrink-0 text-muted-foreground">edit</span>
              <span className="min-w-0 truncate font-mono">{update.path}</span>
            </button>
          </li>
        ) : update.kind === "tool_call" ? (
          <li
            key={`tool-${index}`}
            className="flex gap-2 rounded-sm px-2 py-(--row-py) text-xs hover:bg-sidebar-accent"
          >
            <span
              className={cn("w-14 shrink-0", TOOL_TONE[update.status] ?? "text-muted-foreground")}
            >
              {update.status}
            </span>
            <span className="min-w-0 truncate">{update.title}</span>
          </li>
        ) : null,
      )}
    </ol>
  );
}
