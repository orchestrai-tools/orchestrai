import { Factory, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { TaskInfo } from "@/protocol";

import { relativeTime } from "./BacklogRow";
import type { WorkItem, WorkItemStatus } from "./types";

/**
 * The drawer's action bar: when the item was made and touched, and what to do
 * with it next.
 *
 * @param props.item The item the drawer shows.
 * @param props.status Its status as the drawer shows it, edits included.
 * @param props.linkedTask The task it became, when the daemon still has it.
 * @param props.onOpenTask Opens that task.
 * @param props.onStartTask Starts a task from the item.
 * @param props.onStartInFactory Opens New Task in Factory mode for the item.
 */
export function WorkItemFooter({
  item,
  status,
  linkedTask,
  onOpenTask,
  onStartTask,
  onStartInFactory,
}: {
  item: WorkItem;
  status: WorkItemStatus;
  linkedTask?: TaskInfo | null;
  onOpenTask?: (taskId: string) => void;
  onStartTask?: (item: WorkItem) => void;
  onStartInFactory?: (item: WorkItem) => void;
}) {
  return (
    <>
      {/* Timestamps ride in the footer rather than closing the description:
      they are the least-read thing here, and putting them on the action
      bar's empty half costs no vertical space at all. */}
      <footer className="flex h-14 shrink-0 items-center justify-between gap-4 border-t border-rule px-6">
        <dl className="flex min-w-0 flex-wrap items-baseline gap-x-4 text-[11px] text-muted-foreground">
          <div className="flex items-baseline gap-1.5">
            <dt>Created</dt>
            <dd className="tnum" title={new Date(item.createdAt).toLocaleString()}>
              {relativeTime(item.createdAt)}
            </dd>
          </div>
          <div className="flex items-baseline gap-1.5">
            <dt>Updated</dt>
            <dd className="tnum" title={new Date(item.updatedAt).toLocaleString()}>
              {relativeTime(item.updatedAt)}
            </dd>
          </div>
        </dl>
        <div className="flex items-center gap-2">
          {onStartInFactory && status !== "done" && status !== "cancelled" && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 gap-1.5"
              onClick={() => onStartInFactory(item)}
              title="A pipeline makes the change and can open a draft PR"
            >
              <Factory className="size-3.5" />
              Start in Factory
            </Button>
          )}
          {item.taskId && linkedTask ? (
            <Button
              type="button"
              size="sm"
              className="h-8"
              onClick={() => onOpenTask?.(item.taskId as string)}
              disabled={!onOpenTask}
            >
              Open task
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => onStartTask?.(item)}
              disabled={!onStartTask}
            >
              <Play className="size-3.5" />
              Start task
            </Button>
          )}
        </div>
      </footer>
    </>
  );
}
