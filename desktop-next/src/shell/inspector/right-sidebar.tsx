import { Button } from "@warpforge/ui/components/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@warpforge/ui/components/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@warpforge/ui/components/tooltip";
import { cn } from "@warpforge/ui/lib/utils";
import {
  BookMarkedIcon,
  FileDiffIcon,
  InfoIcon,
  ListChecksIcon,
  ReceiptTextIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react";
import type { ComponentType } from "react";
import { useShell, type InspectorId } from "../../lib/shell-store";
import { HomeSummary } from "../home-summary";
import { LayoutConfig } from "../layout-config";
import { DetailsPanel } from "./details-panel";
import { ActivityPanel, ChangesPanel, ChecksPanel, ContextPanel } from "./task-panels";

interface InspectorPanel {
  id: InspectorId;
  title: string;
  icon: LucideIcon;
  Content: ComponentType;
}

export const INSPECTOR_PANELS: readonly InspectorPanel[] = [
  { id: "details", title: "Details", icon: InfoIcon, Content: DetailsPanel },
  { id: "changes", title: "Changes", icon: FileDiffIcon, Content: ChangesPanel },
  { id: "checks", title: "Checks", icon: ListChecksIcon, Content: ChecksPanel },
  { id: "context", title: "Context", icon: BookMarkedIcon, Content: ContextPanel },
  { id: "activity", title: "Receipts", icon: ReceiptTextIcon, Content: ActivityPanel },
];

/**
 * The inspector: a fixed icon rail on the trailing edge with a panel beside
 * it. Picking an icon swaps the panel, and picking the open one closes it.
 */
export function RightSidebar({ className }: { className?: string }) {
  const shell = useShell();
  const open = shell.inspector;
  const panel = INSPECTOR_PANELS.find((candidate) => candidate.id === shell.inspectorPanel) ?? INSPECTOR_PANELS[0];

  return (
    <aside
      data-region="inspector"
      data-state={open ? "open" : "closed"}
      className={cn("flex shrink-0 border-l bg-sidebar", className)}
    >
      <div
        aria-hidden={!open}
        inert={!open}
        className={cn("overflow-hidden transition-[width] duration-200 ease-linear", open ? "w-72" : "w-0")}
      >
        <Sidebar collapsible="none" className="h-full w-72 border-r">
          <SidebarHeader className="h-10 flex-row items-center justify-between border-b px-4 py-0">
            <span className="text-sm font-medium">{panel.title}</span>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => shell.toggle("inspector")}
              aria-label={`Close ${panel.title}`}
            >
              <XIcon />
            </Button>
          </SidebarHeader>
          <SidebarContent>
            {!shell.home ? (
              <panel.Content />
            ) : panel.id === "details" ? (
              <HomeSummary />
            ) : (
              <p className="p-4 text-xs text-muted-foreground">
                Open a task from the board to see its {panel.title.toLowerCase()}.
              </p>
            )}
          </SidebarContent>
        </Sidebar>
      </div>

      <Sidebar collapsible="none" className="w-(--sidebar-width-icon)">
        <SidebarContent>
          <SidebarGroup className="px-1.5">
            <SidebarGroupContent>
              <SidebarMenu className="gap-1">
                {INSPECTOR_PANELS.map(({ id, title, icon: Icon }) => (
                  <SidebarMenuItem key={id}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <SidebarMenuButton
                          isActive={open && shell.inspectorPanel === id}
                          aria-pressed={open && shell.inspectorPanel === id}
                          aria-label={title}
                          onClick={() => shell.selectInspector(id)}
                          className="justify-center"
                        >
                          <Icon />
                        </SidebarMenuButton>
                      </TooltipTrigger>
                      <TooltipContent side="left">{title}</TooltipContent>
                    </Tooltip>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="px-1.5">
          <LayoutConfig />
        </SidebarFooter>
      </Sidebar>
    </aside>
  );
}
