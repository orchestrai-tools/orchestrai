import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@warpforge/ui/components/sidebar";
import { HouseIcon, PlusIcon, Settings2Icon } from "lucide-react";
import type { ComponentProps } from "react";

import { plural } from "../lib/plural";
import { useShell } from "../lib/shell-store";
import { useToolUpdateCounts } from "../lib/tool-updates";
import { ProjectBadge } from "./project-badge";
import { useProjectMarks } from "./project-marks";
import { SidebarResizeRail } from "./sidebar-resize";

/**
 * On Home the navigation is the projects themselves, each with the count that
 * matters most: what needs you, else what is running.
 */
export function HomeSidebar(props: ComponentProps<typeof Sidebar>) {
  const shell = useShell();
  const { projects, marks, waiting } = useProjectMarks();
  const updates = useToolUpdateCounts();

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              isActive={shell.homePage == null}
              tooltip="Home"
              onClick={shell.openHome}
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-md border bg-background">
                <HouseIcon className="size-4" />
              </div>
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate text-sm font-medium">All projects</span>
                <span className="truncate text-xs text-muted-foreground">
                  {plural(projects.length, "project")} · {waiting} need you
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Projects</SidebarGroupLabel>
          <SidebarMenu>
            {projects.map((project) => {
              const mark = marks.get(project.name) ?? { waiting: 0, running: 0 };
              const count = mark.waiting || mark.running;
              return (
                <SidebarMenuItem key={project.name}>
                  <SidebarMenuButton
                    tooltip={project.name}
                    onClick={() => shell.openProject(project.name)}
                  >
                    <ProjectBadge name={project.name} />
                    <span>{project.name}</span>
                  </SidebarMenuButton>
                  {count > 0 && (
                    <SidebarMenuBadge
                      title={mark.waiting ? `${mark.waiting} need you` : `${mark.running} running`}
                      className={
                        mark.waiting
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-muted-foreground"
                      }
                    >
                      {count}
                    </SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
              );
            })}
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Add project"
                onClick={() => shell.toggle("adding")}
                className="text-muted-foreground"
              >
                <PlusIcon />
                <span>Add project…</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
        <SidebarGroup className="mt-auto">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Settings (⌘,)"
                isActive={shell.homePage === "settings"}
                onClick={shell.openHomeSettings}
              >
                <Settings2Icon />
                <span>Settings</span>
              </SidebarMenuButton>
              {updates.total > 0 && (
                <SidebarMenuBadge
                  title={`${plural(updates.total, "update")} available`}
                  className="text-amber-600 dark:text-amber-400"
                >
                  {updates.total}
                </SidebarMenuBadge>
              )}
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarResizeRail />
    </Sidebar>
  );
}
