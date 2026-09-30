import { ArrowDown, ArrowUp, Play, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";

import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { daemon } from "@/daemon";
import { runAgain, useFactoryEntry } from "@/hooks/useRunner";
import { canRunAgain, queuedOrder } from "@/lib/factory";
import type { TaskInfo } from "@/protocol";

async function act(what: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (error) {
    toast.error(`Could not ${what}`, {
      description: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * The Factory part of a task row's menu: a queued task can start now, move
 * in the queue or be removed; a failed or stopped one can run again.
 * @param props.task A Factory task.
 */
export function FactoryMenuItems({ task }: { task: TaskInfo }) {
  const { entry, status } = useFactoryEntry(task);
  if (entry?.state === "queued" && status) {
    const order = queuedOrder(status.entries);
    const index = order.indexOf(task.id);
    const move = (by: number) => {
      const next = [...order];
      next.splice(index, 1);
      next.splice(index + by, 0, task.id);
      void act("reorder the queue", () => daemon.runnerReorder(task.project, next));
    };
    return (
      <>
        <DropdownMenuItem
          onSelect={() =>
            void act("start the task", () => daemon.runnerStartNow(task.project, task.id))
          }
        >
          <Play className="size-3.5 opacity-70" />
          Start now
        </DropdownMenuItem>
        <DropdownMenuItem disabled={index <= 0} onSelect={() => move(-1)}>
          <ArrowUp className="size-3.5 opacity-70" />
          Move up
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={index < 0 || index >= order.length - 1}
          onSelect={() => move(1)}
        >
          <ArrowDown className="size-3.5 opacity-70" />
          Move down
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() =>
            void act("remove the task", () => daemon.runnerDequeue(task.project, task.id))
          }
        >
          <X className="size-3.5 opacity-70" />
          Remove from queue
        </DropdownMenuItem>
        <DropdownMenuSeparator />
      </>
    );
  }
  if (!entry && canRunAgain(task)) {
    return (
      <>
        <DropdownMenuItem onSelect={() => void runAgain(task)}>
          <RotateCcw className="size-3.5 opacity-70" />
          Run again
        </DropdownMenuItem>
        <DropdownMenuSeparator />
      </>
    );
  }
  return null;
}
