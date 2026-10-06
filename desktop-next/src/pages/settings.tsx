import type { ProjectInfo } from "@warpforge/protocol";
import { cn } from "@warpforge/ui/lib/utils";
import { SearchIcon } from "lucide-react";
import { useState, type ComponentType } from "react";
import { PageToolbar, SectionLabel } from "../components/common/page-toolbar";
import { useShell } from "../lib/shell-store";
import { useDaemon } from "../lib/use-daemon";
import { AdvancedSection } from "./settings/advanced";
import { AgentsSection } from "./settings/agents";
import { AppearanceSection } from "./settings/appearance";
import { DataSection } from "./settings/data";
import { GeneralSection } from "./settings/general";
import { HelpSection } from "./settings/help";
import { HistorySection } from "./settings/history";
import { IntegrationsSection } from "./settings/integrations-app";
import { MemorySection } from "./settings/memory";
import { NO_PROJECT, useSettingsNav, type SectionId } from "./settings/nav-store";
import { TasksSection } from "./settings/tasks";
import { TrackerSection } from "./settings/tracker";
import { WorkspaceSection } from "./settings/workspace";

interface SectionEntry {
  id: SectionId;
  label: string;
  /** What search should find it by, beyond its label. */
  keywords: string;
  Component: ComponentType<{ project: ProjectInfo }>;
}

/** Ordered by how often each is opened, not alphabetically; the project comes first. */
const PROJECT_SECTIONS: readonly SectionEntry[] = [
  {
    id: "general",
    label: "General",
    keywords: "name path folder config file setup bootstrap",
    Component: GeneralSection,
  },
  {
    id: "workspace",
    label: "Workspace",
    keywords: "services ports range local override pinned agent templates yaml",
    Component: WorkspaceSection,
  },
  {
    id: "tasks",
    label: "Tasks",
    keywords: "factory workflow lead agent model limits concurrent draft pull request quota disk",
    Component: ({ project }) => <TasksSection project={project.name} />,
  },
  {
    id: "tracker",
    label: "Issue tracker",
    keywords: "issue tracker linear team backlog integrations",
    Component: ({ project }) => <TrackerSection project={project.name} />,
  },
  {
    id: "data",
    label: "Data",
    keywords: "remove leave delete",
    Component: ({ project }) => <DataSection project={project.name} />,
  },
];

const APP_SECTIONS: readonly SectionEntry[] = [
  {
    id: "appearance",
    label: "Appearance",
    keywords:
      "theme dark light density compact corners radius font text glass blur window tabs dropdown projects email",
    Component: AppearanceSection,
  },
  {
    id: "agents",
    label: "Agents",
    keywords:
      "install update version codex claude opencode goose cursor models reload accounts login acp",
    Component: AgentsSection,
  },
  {
    id: "integrations",
    label: "Integrations",
    keywords:
      "language servers lsp install update version editor code view linear github token tracker connections",
    Component: IntegrationsSection,
  },
  {
    id: "history",
    label: "Tasks & history",
    keywords: "auto-name commit message pr assistant text retention transcripts settle delete",
    Component: HistorySection,
  },
  {
    id: "memory",
    label: "Memory",
    keywords: "search embeddings hybrid keywords dreaming scopes",
    Component: MemorySection,
  },
  {
    id: "advanced",
    label: "Advanced",
    keywords: "backlog storage sqlite yaml",
    Component: AdvancedSection,
  },
  {
    id: "help",
    label: "Help",
    keywords: "shortcuts palette version updates",
    Component: HelpSection,
  },
];

function NavList({
  items,
  active,
  onPick,
}: {
  items: readonly SectionEntry[];
  active?: SectionId;
  onPick: (id: SectionId) => void;
}) {
  return (
    <ul className="flex flex-col gap-px">
      {items.map((entry) => (
        <li key={entry.id}>
          <button
            type="button"
            aria-current={entry.id === active ? "page" : undefined}
            onClick={() => onPick(entry.id)}
            className={cn(
              "w-full rounded-md px-2 py-(--row-py) text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
              entry.id === active
                ? "bg-muted font-medium"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            )}
          >
            {entry.label}
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * Settings for the project in front, then the app's own. One list of sections
 * on the left and the selected one on the right.
 */
export function Settings() {
  const projectName = useShell((state) => (state.home ? null : state.project));
  const project = useDaemon().snapshot.projects.find((item) => item.name === projectName) ?? null;
  const key = project?.name ?? NO_PROJECT;
  const stored = useSettingsNav((state) => state.sections[key]);
  const open = useSettingsNav((state) => state.open);
  const [query, setQuery] = useState("");

  const needle = query.trim().toLowerCase();
  const matches = (entry: SectionEntry) =>
    !needle || `${entry.label} ${entry.keywords}`.toLowerCase().includes(needle);
  const projectItems = project ? PROJECT_SECTIONS.filter(matches) : [];
  const appItems = APP_SECTIONS.filter(matches);
  const active =
    [...projectItems, ...appItems].find((entry) => entry.id === stored) ??
    projectItems[0] ??
    appItems[0];
  const pick = (id: SectionId) => open(key, id);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="p-4 pb-3">
        <PageToolbar title="Settings">
          <label className="flex h-7 w-56 items-center gap-1.5 rounded-md border bg-background px-2 text-xs focus-within:ring-2 focus-within:ring-ring/50">
            <SearchIcon className="size-3.5 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => event.key === "Escape" && setQuery("")}
              placeholder="Search settings"
              aria-label="Search settings"
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
            />
          </label>
        </PageToolbar>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[13rem_minmax(0,1fr)] border-t">
        <nav aria-label="Settings sections" className="min-h-0 overflow-y-auto border-r px-2 py-3">
          {project && projectItems.length > 0 && (
            <>
              <div className="px-2 pb-1">
                <SectionLabel>{project.name}</SectionLabel>
                <p className="text-xs text-muted-foreground">This project only</p>
              </div>
              <NavList items={projectItems} active={active?.id} onPick={pick} />
            </>
          )}
          {!project && !needle && (
            <p className="px-2 pb-4 text-xs text-muted-foreground">
              Open a project to change its own settings.
            </p>
          )}
          {appItems.length > 0 && (
            <div className={cn(projectItems.length > 0 && "mt-6 border-t pt-4")}>
              <div className="px-2 pb-1">
                <SectionLabel>App</SectionLabel>
                <p className="text-xs text-muted-foreground">Every project on this Mac</p>
              </div>
              <NavList items={appItems} active={active?.id} onPick={pick} />
            </div>
          )}
          {!active && (
            <p className="px-2 text-xs text-muted-foreground">No setting matches “{query}”.</p>
          )}
        </nav>

        <div className="min-h-0 overflow-y-auto">
          {active && (
            <div className="px-6 py-5">
              {/* Project sections are only listed while a project is open. */}
              <active.Component key={`${key}/${active.id}`} project={project as ProjectInfo} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
