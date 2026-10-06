import { Button } from "@warpforge/ui/components/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@warpforge/ui/components/context-menu";
import { cn } from "@warpforge/ui/lib/utils";
import { HouseIcon, PlusIcon, XIcon } from "lucide-react";
import { useRef, type KeyboardEvent, type ReactNode } from "react";

import { useShell } from "../lib/shell-store";
import { ProjectBadge, ProjectStatus } from "./project-badge";
import { useProjectMarks } from "./project-marks";
import { requestRemoveProject } from "./remove-project-dialog";

const ARROW_STEP: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1 };
const HOME = "\u0000home";

function Tab({
  tabKey,
  active,
  divider,
  onSelect,
  onClose,
  className,
  children,
}: {
  tabKey: string;
  active: boolean;
  divider: boolean;
  onSelect: () => void;
  onClose?: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "group/tab relative flex shrink items-center text-[12px]",
        // The active tab takes the content's colour and covers the bar's bottom border, so it joins the page below.
        active ? "z-10 -mb-px bg-background" : "hover:bg-foreground/5",
        divider &&
          "before:absolute before:left-0 before:h-4 before:w-px before:bg-foreground/15 group-hover/tab:before:opacity-0",
        className,
      )}
    >
      <button
        type="button"
        role="tab"
        data-tab={tabKey}
        aria-selected={active}
        tabIndex={active ? 0 : -1}
        onClick={onSelect}
        className={cn(
          "flex h-full min-w-0 flex-1 items-center gap-2 pl-3 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
          onClose ? "pr-8" : "pr-3",
          active ? "text-foreground" : "text-foreground/70",
        )}
      >
        {children}
      </button>
      {onClose && (
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Close tab"
          onClick={onClose}
          className="absolute right-1.5 size-5 rounded-sm text-muted-foreground [&_svg:not([class*='size-'])]:size-3"
        >
          <XIcon />
        </Button>
      )}
    </div>
  );
}

/**
 * Tabs in the title bar: a pinned Home tab, then one tab per open project.
 * The active one is filled with the content's colour so it reads as part of
 * the page, and inactive neighbours are split by a hairline.
 */
export function ProjectTabs() {
  const shell = useShell();
  const { marks, waiting } = useProjectMarks();
  const list = useRef<HTMLDivElement>(null);
  const keys = [HOME, ...shell.openProjects];
  const activeKey = shell.home || !shell.project ? HOME : shell.project;

  const activate = (key: string) => {
    if (key === HOME) shell.openHome();
    else shell.openProject(key);
    list.current?.querySelector<HTMLElement>(`[data-tab="${CSS.escape(key)}"]`)?.focus();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const index = keys.indexOf(activeKey);
    const target =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? keys.length - 1
          : index + (ARROW_STEP[event.key] ?? Number.NaN);
    if (Number.isNaN(target)) return;
    event.preventDefault();
    activate(keys[(target + keys.length) % keys.length]);
  };

  return (
    <div className="flex min-w-0 flex-1 items-stretch gap-1">
      <div
        ref={list}
        role="tablist"
        aria-label="Projects"
        onKeyDown={onKeyDown}
        className="flex min-w-0 items-stretch overflow-x-auto"
      >
        <Tab
          tabKey={HOME}
          active={activeKey === HOME}
          divider={false}
          onSelect={shell.openHome}
          className="shrink-0"
        >
          <HouseIcon className="size-3.5" />
          <span className={cn(activeKey === HOME && "font-medium")}>Home</span>
          {waiting > 0 && (
            <span
              className="flex items-center gap-1 text-amber-600 tabular-nums dark:text-amber-400"
              title={`${waiting} need you across all projects`}
            >
              <span aria-hidden className="size-1.5 rounded-full bg-current" />
              {waiting}
            </span>
          )}
        </Tab>
        {shell.openProjects.map((name, index) => {
          const active = activeKey === name;
          const mark = marks.get(name) ?? { waiting: 0, running: 0 };
          return (
            <ContextMenu key={name}>
              <ContextMenuTrigger asChild>
                <Tab
                  tabKey={name}
                  active={active}
                  divider={!active && keys[index] !== activeKey}
                  onSelect={() => shell.openProject(name)}
                  onClose={() => shell.closeProject(name)}
                  className="@container w-56 min-w-24 shrink-0"
                >
                  <ProjectBadge name={name} />
                  <span className={cn("truncate", active && "font-medium")}>{name}</span>
                  <ProjectStatus {...mark} className="ml-auto @max-[13rem]:hidden" />
                </Tab>
              </ContextMenuTrigger>
              <ContextMenuContent className="w-52">
                <ContextMenuItem onSelect={() => shell.openProject(name)}>
                  Open
                  <ContextMenuShortcut>⌃{index + 2}</ContextMenuShortcut>
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => shell.closeProject(name)}>
                  Close tab
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem variant="destructive" onSelect={() => requestRemoveProject(name)}>
                  Remove project…
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Add project"
        title="Add project (⌘O)"
        onClick={() => shell.toggle("adding")}
        className="shrink-0 self-center rounded-sm text-muted-foreground"
      >
        <PlusIcon />
      </Button>
    </div>
  );
}
