import { ChevronDownIcon, PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ProjectBadge, ProjectStatus } from "@/components/window/project-badge"
import { useAppActions, useAppSession } from "@/lib/app-instance"
import { findProject, PROJECTS, type ProjectId } from "@/lib/projects"

/**
 * The second variant: one button in the title bar names the current
 * project and opens a menu of every project. Picking one swaps the window's
 * content in place, with no tabs to manage.
 */
export function ProjectSwitcher() {
  const current = findProject(useAppSession((session) => session.project))
  const { selectProject } = useAppActions()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Switch project, current: ${current.name}`}
          className="h-7 gap-2 rounded-md px-2 text-[12px] hover:bg-foreground/5 data-[state=open]:bg-background data-[state=open]:shadow-xs data-[state=open]:ring-1 data-[state=open]:ring-border"
        >
          <ProjectBadge project={current} />
          <span className="font-medium">{current.name}</span>
          <ProjectStatus project={current} />
          <ChevronDownIcon className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel>Projects</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={current.id}
          onValueChange={(id) => selectProject(id as ProjectId)}
        >
          {PROJECTS.map((project, index) => (
            <DropdownMenuRadioItem key={project.id} value={project.id} className="gap-2.5 py-1.5">
              <ProjectBadge project={project} className="size-6 rounded-md text-xs" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-medium">{project.name}</span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="truncate">{project.branch}</span>
                  <ProjectStatus project={project} />
                </span>
              </span>
              <DropdownMenuShortcut>⌃{index + 1}</DropdownMenuShortcut>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <PlusIcon />
          New Project…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
