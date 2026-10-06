import { settleableTasks } from "@warpforge/core/taskShelf";
import { daemon } from "@warpforge/daemon";
import { Button } from "@warpforge/ui/components/button";
import { ToggleGroup, ToggleGroupItem } from "@warpforge/ui/components/toggle-group";
import { cn } from "@warpforge/ui/lib/utils";
import { useState } from "react";
import { toast } from "sonner";

import { PageToolbar } from "../components/common/page-toolbar";
import { plural } from "../lib/plural";
import { usePrFeedback } from "../lib/pr-feedback";
import { useShell } from "../lib/shell-store";
import { useDaemon } from "../lib/use-daemon";
import { groupByColumn, visibleTasks } from "../model/tasks";
import { useTaskSelection } from "./board/task-card";
import { nowSec } from "./board/task-facts";
import { BoardColumns, TaskList } from "./board/task-views";

type View = "board" | "list";

/**
 * The project's board: agent work as one card per task (KLIDE, Antigravity).
 * Columns run in the order a person acts: what needs you first.
 */
export function Board() {
  const state = useDaemon();
  const project = useShell((shell) => shell.project);
  const toggle = useShell((shell) => shell.toggle);
  const handled = usePrFeedback((store) => store.handledByTask);
  const selection = useTaskSelection();
  const [view, setView] = useState<View>("board");
  const tasks = visibleTasks(state.snapshot.tasks, project);
  const grouped = groupByColumn(tasks, state.taskPullRequests ?? {}, handled, state.sessionUpdates);
  const running = tasks.filter((task) => task.status === "running").length;
  const finished = settleableTasks(tasks, nowSec());

  async function settleFinished() {
    try {
      await Promise.all(
        finished.map((task) => daemon.request("task.settle", { task_id: task.id })),
      );
      toast.success(`Settled ${finished.length} finished`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not settle the finished tasks");
    }
  }

  return (
    <div className={cn("flex min-h-full flex-col gap-4 p-4", view === "board" && "dot-grid")}>
      <PageToolbar title="Board" meta={`${plural(tasks.length, "task")} · ${running} running`}>
        {finished.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => void settleFinished()}>
            Settle {finished.length} finished
          </Button>
        )}
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          spacing={0}
          value={view}
          onValueChange={(next) => next && setView(next as View)}
          aria-label="View"
        >
          <ToggleGroupItem value="board" className="px-3 text-xs">
            Board
          </ToggleGroupItem>
          <ToggleGroupItem value="list" className="px-3 text-xs">
            List
          </ToggleGroupItem>
        </ToggleGroup>
      </PageToolbar>
      <div className="overflow-x-auto pb-2">
        {view === "board" ? (
          <BoardColumns
            grouped={grouped}
            {...selection}
            columnAction={(column) =>
              column === "done" &&
              grouped.done.length > 0 && (
                <Button
                  variant="link"
                  size="xs"
                  className="h-auto p-0 font-normal text-muted-foreground"
                  onClick={() => toggle("deleteDone")}
                >
                  Delete {grouped.done.length}…
                </Button>
              )
            }
          />
        ) : (
          <TaskList tasks={tasks} {...selection} />
        )}
      </div>
    </div>
  );
}
