import { Button } from "@warpforge/ui/components/button";
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
} from "@warpforge/ui/components/dropdown-menu";
import { ChevronDownIcon, HouseIcon, PlusIcon } from "lucide-react";
import { useShell } from "../lib/shell-store";
import { ProjectBadge, ProjectStatus } from "./project-badge";
import { useProjectMarks } from "./project-marks";

const HOME = "\u0000home";
const IDLE = { waiting: 0, running: 0 };

/**
 * One button in the title bar names where you are, Home or a project, and
 * opens a menu of every project. Picking one swaps the window's content.
 */
export function ProjectSwitcher() {
  const shell = useShell();
  const { projects, marks, waiting } = useProjectMarks();
  const home = shell.home || !shell.project;
  const current = shell.project ?? "";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Switch project, current: ${home ? "Home" : current}`}
          className="h-7 gap-2 rounded-md px-2 text-[12px] hover:bg-foreground/5 data-[state=open]:bg-background data-[state=open]:shadow-xs data-[state=open]:ring-1 data-[state=open]:ring-border"
        >
          {home ? (
            <>
              <HouseIcon className="size-3.5" />
              <span className="font-medium">Home</span>
              <span className="text-muted-foreground">All projects</span>
            </>
          ) : (
            <>
              <ProjectBadge name={current} />
              <span className="font-medium">{current}</span>
              <ProjectStatus {...(marks.get(current) ?? IDLE)} />
            </>
          )}
          <ChevronDownIcon className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuRadioGroup
          value={home ? HOME : current}
          onValueChange={(id) => (id === HOME ? shell.openHome() : shell.openProject(id))}
        >
          <DropdownMenuRadioItem value={HOME} className="gap-2.5 py-1.5">
            <span className="flex size-6 items-center justify-center rounded-md border">
              <HouseIcon className="size-3.5" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-medium">Home</span>
              <span className="text-xs text-muted-foreground">
                Every project's tasks · {waiting} need you
              </span>
            </span>
            <DropdownMenuShortcut>⌃1</DropdownMenuShortcut>
          </DropdownMenuRadioItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Projects</DropdownMenuLabel>
          {projects.map((project, index) => (
            <DropdownMenuRadioItem key={project.name} value={project.name} className="gap-2.5 py-1.5">
              <ProjectBadge name={project.name} className="size-6 rounded-md text-xs" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-medium">{project.name}</span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="truncate">{project.path}</span>
                  <ProjectStatus {...(marks.get(project.name) ?? IDLE)} />
                </span>
              </span>
              {index < 8 && <DropdownMenuShortcut>⌃{index + 2}</DropdownMenuShortcut>}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => shell.toggle("adding")}>
          <PlusIcon />
          Add project…
          <DropdownMenuShortcut>⌘O</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
