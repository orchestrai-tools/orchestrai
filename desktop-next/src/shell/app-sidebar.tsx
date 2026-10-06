import { Kbd } from "@warpforge/ui/components/kbd";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@warpforge/ui/components/sidebar";
import { cn } from "@warpforge/ui/lib/utils";
import { PlusIcon, RotateCwIcon } from "lucide-react";
import type { ComponentProps } from "react";

import { currentPage, useShell } from "../lib/shell-store";
import { NAV_GROUPS, NAV_PAGES, pageShortcut, type NavGroup, type PageId } from "../model/pages";
import { CommandBar } from "./command-bar";
import { type NavBadges, useNavBadges } from "./nav-badges";
import { SidebarResizeRail } from "./sidebar-resize";
import { WorktreeSwitcher } from "./worktree-switcher";

const BADGE_TONE: Partial<Record<PageId, string>> = {
  inbox: "text-amber-600 dark:text-amber-400",
  agents: "text-emerald-600 dark:text-emerald-400",
  settings: "text-amber-600 dark:text-amber-400",
};

/** The pages of the current project, grouped by space and short labels rather than boxes. */
function NavProject({
  groups,
  badges,
  className,
}: {
  groups: readonly { id: NavGroup; label?: string }[];
  badges: NavBadges;
  className?: string;
}) {
  const shell = useShell();
  const page = currentPage(shell);
  // A task is opened from the board, so the board stays the highlighted place.
  const active: PageId = page === "task" ? "board" : page;

  return (
    <>
      {groups.map(({ id, label }) => (
        <SidebarGroup key={id} className={cn("py-1", className)}>
          {label && <SidebarGroupLabel>{label}</SidebarGroupLabel>}
          <SidebarMenu>
            {NAV_PAGES.filter((entry) => entry.group === id).map((entry) => {
              const Icon = entry.icon;
              const count = badges.counts[entry.id];
              const failed = badges.failed[entry.id];
              const hint = pageShortcut(entry);
              return (
                <SidebarMenuItem key={entry.id}>
                  <SidebarMenuButton
                    tooltip={hint ? `${entry.title} (${hint})` : entry.title}
                    isActive={active === entry.id}
                    onClick={() => shell.setPage(entry.id)}
                  >
                    <Icon />
                    <span>{entry.title}</span>
                  </SidebarMenuButton>
                  {failed ? (
                    <SidebarMenuAction
                      title={`Could not load the ${entry.title} count. Retry`}
                      aria-label={`Retry the ${entry.title} count`}
                      onClick={badges.retry}
                      className="text-muted-foreground"
                    >
                      <RotateCwIcon />
                    </SidebarMenuAction>
                  ) : count ? (
                    <SidebarMenuBadge className={BADGE_TONE[entry.id] ?? "text-muted-foreground"}>
                      {count}
                    </SidebarMenuBadge>
                  ) : null}
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      ))}
    </>
  );
}

/**
 * Navigation for the current project: which worktree, which page, and the
 * shell command bar. One primary action, New task, lives here on every page.
 */
export function AppSidebar(props: ComponentProps<typeof Sidebar>) {
  const toggle = useShell((state) => state.toggle);
  const project = useShell((state) => state.project);
  const badges = useNavBadges(project);
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <WorktreeSwitcher />
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="New task (⌘N)" onClick={() => toggle("newTask")}>
              <PlusIcon />
              <span>New task</span>
              <Kbd className="ml-auto group-data-[collapsible=icon]:hidden">⌘N</Kbd>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="gap-0">
        <NavProject groups={NAV_GROUPS} badges={badges} />
        <NavProject groups={[{ id: "footer" }]} badges={badges} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter className="pb-3">
        <CommandBar />
      </SidebarFooter>
      <SidebarResizeRail />
    </Sidebar>
  );
}
