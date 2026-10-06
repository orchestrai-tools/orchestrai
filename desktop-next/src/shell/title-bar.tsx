import { daemon } from "@warpforge/daemon";
import { Kbd } from "@warpforge/ui/components/kbd";
import { cn } from "@warpforge/ui/lib/utils";
import {
  ArrowUpCircleIcon,
  LoaderIcon,
  PanelLeftIcon,
  SearchIcon,
  WifiOffIcon,
} from "lucide-react";
import { openSettingsAt, toggleSidebar } from "../lib/actions";
import { gitActivityLabel, useGitActivity } from "../lib/git-activity";
import { plural } from "../lib/plural";
import { useToolUpdateCounts } from "../lib/tool-updates";
import { useShell } from "../lib/shell-store";
import { useDaemon } from "../lib/use-daemon";
import { useProjectMarks } from "./project-marks";
import { ProjectSwitcher } from "./project-switcher";
import { ProjectTabs } from "./project-tabs";
import { UpdateChip } from "./update-chip";

/** Agents and language servers with a newer version out; opens the Settings section that updates them. */
function ToolUpdatesChip() {
  const updates = useToolUpdateCounts();
  if (updates.total === 0) return null;
  const parts = [
    updates.agents > 0 && plural(updates.agents, "agent"),
    updates.servers > 0 && plural(updates.servers, "language server"),
  ].filter(Boolean);
  return (
    <button
      type="button"
      onClick={() => openSettingsAt(updates.agents > 0 ? "agents" : "integrations")}
      title={`Updates available: ${parts.join(", ")}`}
      className="flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-amber-700 hover:bg-foreground/5 dark:text-amber-300"
    >
      <ArrowUpCircleIcon className="size-3.5" />
      <span className="tabular-nums">{plural(updates.total, "update")}</span>
    </button>
  );
}

/**
 * The right end of the title bar holds what matters across every project:
 * search (⌘K), a count of what needs you, and the connection when it drops.
 */
function TitleBarStatus() {
  const shell = useShell();
  const state = useDaemon();
  const { waiting } = useProjectMarks();
  const activity = gitActivityLabel(useGitActivity((store) => store.activity));
  const openWaiting = () => {
    const first = state.snapshot.projects[0]?.name;
    const project = shell.project ?? first;
    if (!project) return;
    shell.openProject(project);
    shell.setPage("inbox");
  };

  return (
    <div className="ml-auto flex items-center gap-1.5" data-tauri-drag-region>
      {activity && (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <LoaderIcon className="size-3 animate-spin" />
          {activity}
        </span>
      )}
      <ToolUpdatesChip />
      <UpdateChip />
      {state.connection !== "connected" && (
        <button
          type="button"
          title={state.connectionError ?? "Retry the connection"}
          onClick={() => void daemon.connect().catch(() => undefined)}
          className="flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-destructive hover:bg-foreground/5"
        >
          <WifiOffIcon className="size-3.5" />
          {state.connection === "disconnected" ? "Retry connection" : "Connecting…"}
        </button>
      )}
      <button
        type="button"
        onClick={() => shell.openPalette("actions")}
        className="flex h-7 w-56 items-center gap-2 rounded-md border bg-background/70 px-2 text-xs text-muted-foreground hover:bg-background max-[900px]:w-auto"
      >
        <SearchIcon className="size-3.5" />
        <span className="max-[900px]:hidden">Search or run a command</span>
        <Kbd className="ml-auto">⌘K</Kbd>
      </button>
      {waiting > 0 && (
        <button
          type="button"
          onClick={openWaiting}
          title={`${waiting} waiting for you across all projects`}
          className="flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
        >
          <span aria-hidden className="size-1.5 rounded-full bg-amber-500" />
          <span className="tabular-nums">{waiting}</span>
          <span className="max-[1100px]:hidden">need you</span>
        </button>
      )}
    </div>
  );
}

function SidebarToggle() {
  const open = useShell((state) => state.sidebar);
  return (
    <button
      type="button"
      aria-label="Toggle sidebar"
      aria-pressed={open}
      title="Toggle sidebar (⌘\)"
      onClick={toggleSidebar}
      className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
    >
      <PanelLeftIcon className="size-4" />
    </button>
  );
}

/**
 * A unified title bar: macOS traffic lights, then the project tabs (or the
 * project menu) on one row. Empty space drags the window.
 */
export function TitleBar({ className }: { className?: string }) {
  const projectNav = useShell((state) => state.projectNav);
  return (
    <div
      data-region="title-bar"
      data-tauri-drag-region
      className={cn("flex h-10 shrink-0 items-stretch gap-3 border-b bg-muted pr-2 select-none", className)}
    >
      <div aria-hidden className="w-[70px] shrink-0" data-tauri-drag-region />
      <div className="-mx-1 flex items-center">
        <SidebarToggle />
      </div>
      {projectNav === "tabs" ? (
        <ProjectTabs />
      ) : (
        <div className="flex items-center">
          <ProjectSwitcher />
        </div>
      )}
      <TitleBarStatus />
    </div>
  );
}
