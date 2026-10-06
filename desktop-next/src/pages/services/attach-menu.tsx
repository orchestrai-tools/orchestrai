import type { LogEntry } from "@warpforge/daemon/types";
import { isSettledTask } from "@warpforge/core/taskShelf";
import { Button } from "@warpforge/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@warpforge/ui/components/dropdown-menu";
import { ChevronDownIcon } from "lucide-react";
import { useDaemon } from "../../lib/use-daemon";
import { visibleTasks } from "../../model/tasks";
import { attachLogs, newTaskWithLogs, type RuntimeKind } from "./runtime-actions";

/** Hands log lines to an open task, or starts a new one with them, the way "Add to chat" attaches them with their seq range. */
export function AttachMenu({
  project,
  kind,
  name,
  entries,
  label = "Add to task",
  title,
}: {
  project: string;
  kind: RuntimeKind;
  name: string;
  entries: LogEntry[];
  label?: string;
  title?: string;
}) {
  const tasks = visibleTasks(useDaemon().snapshot.tasks, project).filter(
    (task) => !isSettledTask(task),
  );
  const count = entries.length;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="xs"
          className="-my-1 text-xs"
          disabled={count === 0}
          title={title}
        >
          {label}
          <ChevronDownIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>
          Attach {count} {count === 1 ? "line" : "lines"} with their seq range
        </DropdownMenuLabel>
        {tasks.map((task) => (
          <DropdownMenuItem
            key={task.id}
            onSelect={() => attachLogs(project, kind, name, entries, task.id)}
            className="text-xs"
          >
            <span className="truncate">{task.title || task.prompt}</span>
          </DropdownMenuItem>
        ))}
        {tasks.length > 0 && <DropdownMenuSeparator />}
        <DropdownMenuItem onSelect={() => newTaskWithLogs(kind, name, entries)} className="text-xs">
          New task with these lines…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
