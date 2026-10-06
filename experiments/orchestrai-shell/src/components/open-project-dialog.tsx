import { FolderOpenIcon, GitBranchPlusIcon } from "lucide-react"

import { ProjectBadge, ProjectStatus } from "@/components/window/project-badge"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command"
import { useAppActions, useAppSession } from "@/lib/app-instance"
import { useDialog } from "@/lib/dialog-store"
import { PROJECTS } from "@/lib/projects"

/**
 * The title bar's + opens this: every project you have, then adding one from
 * disk or a clone URL. Picking a project opens it as a tab (or switches to it).
 */
export function OpenProjectDialog() {
  const { current, close } = useDialog()
  const open = useAppSession((session) => session.openProjects)
  const { selectProject } = useAppActions()

  return (
    <CommandDialog
      open={current === "open-project"}
      onOpenChange={(next) => !next && close()}
      title="Open project"
      description="Open a project as a tab, or add one."
    >
      <CommandInput placeholder="Open a project…" />
      <CommandList>
        <CommandEmpty>No project by that name.</CommandEmpty>
        <CommandGroup heading="Projects">
          {PROJECTS.map((project) => (
            <CommandItem
              key={project.id}
              value={`${project.name} ${project.repo}`}
              onSelect={() => {
                close()
                selectProject(project.id)
              }}
            >
              <ProjectBadge project={project} />
              <span className="font-medium">{project.name}</span>
              <span className="truncate text-xs text-muted-foreground">{project.repo}</span>
              <ProjectStatus project={project} className="ml-auto text-xs" />
              {open.includes(project.id) && <CommandShortcut>Open</CommandShortcut>}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Add">
          <CommandItem value="add from disk folder" onSelect={close}>
            <FolderOpenIcon />
            Add a folder from disk…
          </CommandItem>
          <CommandItem value="clone repository url" onSelect={close}>
            <GitBranchPlusIcon />
            Clone from a URL…
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
