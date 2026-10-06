import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@warpforge/ui/components/resizable";
import { SidebarInset, SidebarProvider } from "@warpforge/ui/components/sidebar";
import { TooltipProvider } from "@warpforge/ui/components/tooltip";
import type { CSSProperties, ReactNode } from "react";

import { useAppearance } from "../lib/appearance";
import { useShell } from "../lib/shell-store";
import { AppSidebar } from "./app-sidebar";
import { FocusEdge } from "./focus-edge";
import { HomeSidebar } from "./home-sidebar";
import { RightSidebar } from "./inspector/right-sidebar";
import { LayoutContextMenu } from "./layout-context-menu";
import { CommandPalette } from "./palette/command-palette";
import { RemoveProjectDialog } from "./remove-project-dialog";
import { TerminalPanel, TerminalStrip } from "./terminal-drawer";
import { TitleBar } from "./title-bar";

const TITLE_BAR_HEIGHT = "2.5rem";

/** The page itself, scrolling on its own. */
function Work({ page }: { page: ReactNode }) {
  return (
    <div data-region="work" className="h-full min-h-0 overflow-y-auto">
      {page}
    </div>
  );
}

/** Home keeps the same regions; its navigation is the projects and it has no project terminals. */
function HomeLayout({ page, focus }: { page: ReactNode; focus: boolean }) {
  return (
    <div className="flex min-h-0 flex-1">
      {!focus && <HomeSidebar className="top-(--header-height) h-auto!" />}
      <SidebarInset className="min-h-0 min-w-0">
        <div data-region="work" className="min-h-0 flex-1 overflow-y-auto">
          {page}
        </div>
      </SidebarInset>
      {!focus && <RightSidebar className="static h-auto" />}
    </div>
  );
}

function ProjectLayout({
  page,
  focus,
  terminalOpen,
}: {
  page: ReactNode;
  focus: boolean;
  terminalOpen: boolean;
}) {
  return (
    <div className="flex min-h-0 flex-1">
      {!focus && <AppSidebar className="top-(--header-height) h-auto!" />}
      <SidebarInset className="min-h-0 min-w-0">
        <ResizablePanelGroup orientation="vertical" className="min-h-0 flex-1">
          <ResizablePanel id="work" defaultSize="70%" minSize="30%">
            <Work page={page} />
          </ResizablePanel>
          {terminalOpen && !focus && (
            <>
              <ResizableHandle />
              <ResizablePanel id="terminal" defaultSize="30%" minSize="12%">
                <TerminalPanel />
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
        {!focus && <TerminalStrip />}
      </SidebarInset>
      {!focus && <RightSidebar className="static h-auto" />}
    </div>
  );
}

/**
 * The window: a title bar, then Home or one project. A fixed skeleton of
 * regions — sidebar (navigation), work (center), inspector (trailing), and
 * for a project the terminal drawer (bottom). Focus mode hides the chrome and
 * never the work.
 */
export function AppShell({ page, children }: { page: ReactNode; children?: ReactNode }) {
  const shell = useShell();
  const home = shell.home || !shell.project;
  const sidebarWidth = useAppearance((s) => s.sidebarWidth);

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex h-svh flex-col overflow-hidden">
        {!shell.focus && <TitleBar />}
        <SidebarProvider
          open={shell.sidebar}
          onOpenChange={(open) => useShell.setState({ sidebar: open })}
          keyboardShortcut={false}
          className="relative min-h-0 flex-1 flex-col data-resizing:cursor-col-resize data-resizing:select-none data-resizing:**:data-[slot=sidebar-container]:transition-none data-resizing:**:data-[slot=sidebar-gap]:transition-none"
          style={
            {
              "--header-height": shell.focus ? "0px" : TITLE_BAR_HEIGHT,
              "--sidebar-width": `${sidebarWidth}px`,
            } as CSSProperties
          }
        >
          <LayoutContextMenu>
            <div className="flex min-h-0 flex-1 flex-col">
              {home ? (
                <HomeLayout page={page} focus={shell.focus} />
              ) : (
                <ProjectLayout page={page} focus={shell.focus} terminalOpen={shell.terminal} />
              )}
            </div>
          </LayoutContextMenu>
          {shell.focus && <FocusEdge />}
          <CommandPalette />
          <RemoveProjectDialog />
          {children}
        </SidebarProvider>
      </div>
    </TooltipProvider>
  );
}
