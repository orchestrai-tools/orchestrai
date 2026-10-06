import { ProjectBadge } from "@/components/window/project-badge"
import { inboxFor } from "@/data/inbox"
import { tasksFor } from "@/data/tasks"
import { useAppActions } from "@/lib/app-instance"
import { PROJECTS } from "@/lib/projects"

/** On Home the inspector compares projects: what runs, what waits on you, what is in review. */
export function HomeSummary() {
  const { selectProject } = useAppActions()
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-muted-foreground">
          <th className="px-4 py-2 text-left font-normal">Project</th>
          <th className="py-2 text-right font-normal" title="Running">Run</th>
          <th className="py-2 text-right font-normal" title="Need you">You</th>
          <th className="py-2 pr-4 text-right font-normal" title="In review">Review</th>
        </tr>
      </thead>
      <tbody>
        {PROJECTS.map((project) => {
          const tasks = tasksFor(project.id)
          return (
            <tr key={project.id} className="cursor-pointer hover:bg-sidebar-accent" onClick={() => selectProject(project.id)}>
              <td className="px-4 py-(--row-py)">
                <span className="flex items-center gap-2">
                  <ProjectBadge project={project} />
                  <span className="truncate">{project.name}</span>
                </span>
              </td>
              <td className="py-(--row-py) text-right tabular-nums">{tasks.filter((task) => task.status === "running").length}</td>
              <td className="py-(--row-py) text-right text-amber-600 tabular-nums dark:text-amber-400">{inboxFor(project.id).length || ""}</td>
              <td className="py-(--row-py) pr-4 text-right tabular-nums">{tasks.filter((task) => task.status === "review").length}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
