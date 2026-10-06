import { useShell } from "../lib/shell-store";
import { useDaemon } from "../lib/use-daemon";
import { columnOf, needsPerson, visibleTasks } from "../model/tasks";
import { ProjectBadge } from "./project-badge";

/** On Home the inspector compares projects: what runs, what waits on you, what is in review. */
export function HomeSummary() {
  const openProject = useShell((state) => state.openProject);
  const state = useDaemon();
  const pulls = state.taskPullRequests ?? {};
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-muted-foreground">
          <th className="px-4 py-2 text-left font-normal">Project</th>
          <th className="py-2 text-right font-normal" title="Running">
            Run
          </th>
          <th className="py-2 text-right font-normal" title="Need you">
            You
          </th>
          <th className="py-2 pr-4 text-right font-normal" title="In review">
            Review
          </th>
        </tr>
      </thead>
      <tbody>
        {state.snapshot.projects.map((project) => {
          const tasks = visibleTasks(state.snapshot.tasks, project.name);
          const waiting = tasks.filter(needsPerson).length;
          return (
            <tr
              key={project.name}
              className="cursor-pointer hover:bg-sidebar-accent"
              onClick={() => openProject(project.name)}
            >
              <td className="px-4 py-(--row-py)">
                <span className="flex items-center gap-2">
                  <ProjectBadge name={project.name} />
                  <span className="truncate">{project.name}</span>
                </span>
              </td>
              <td className="py-(--row-py) text-right tabular-nums">
                {tasks.filter((task) => task.status === "running").length}
              </td>
              <td className="py-(--row-py) text-right text-amber-600 tabular-nums dark:text-amber-400">
                {waiting || ""}
              </td>
              <td className="py-(--row-py) pr-4 text-right tabular-nums">
                {tasks.filter((task) => columnOf(task, Boolean(pulls[task.id])) === "review").length}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
