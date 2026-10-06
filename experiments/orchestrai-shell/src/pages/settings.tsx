import { useState, type ComponentType } from "react"
import { SearchIcon } from "lucide-react"

import { PageToolbar, SectionLabel } from "@/components/common/page-toolbar"
import { useAppSession } from "@/lib/app-instance"
import { findProject, type Project } from "@/lib/projects"
import { cn } from "@/lib/utils"
import { AdvancedSection } from "@/pages/settings/advanced"
import { AgentsSection } from "@/pages/settings/agents"
import { AppAgentsSection } from "@/pages/settings/app-agents"
import { AppearanceSection } from "@/pages/settings/appearance"
import { ConnectionsSection } from "@/pages/settings/connections"
import { DataSection } from "@/pages/settings/data"
import { EditorSection } from "@/pages/settings/editor"
import { GeneralSection } from "@/pages/settings/general"
import { HelpSection } from "@/pages/settings/help"
import { HistorySection } from "@/pages/settings/history"
import { InstructionsSection } from "@/pages/settings/instructions"
import { IntegrationsSection } from "@/pages/settings/integrations"
import { MemorySection } from "@/pages/settings/memory"
import { useSettingsNav, type SectionId } from "@/pages/settings/nav-store"
import { NotificationsSection } from "@/pages/settings/notifications"
import { PluginsSection } from "@/pages/settings/plugins"
import { RemoteSection } from "@/pages/settings/remote"
import { TasksSection } from "@/pages/settings/tasks"
import { WorkspaceSection } from "@/pages/settings/workspace"

interface SectionEntry {
  id: SectionId
  label: string
  /** What search should find it by, beyond its label. */
  keywords: string
  Component: ComponentType<{ project: Project }>
}

/** Ordered by how often each is opened, not alphabetically; the project comes first. */
export const PROJECT_SECTIONS: readonly SectionEntry[] = [
  { id: "general", label: "General", keywords: "name path repository branch badge color config file jujutsu git", Component: GeneralSection },
  { id: "workspace", label: "Workspace", keywords: "services ports range auto-start worktree copy setup yaml local override agent templates", Component: WorkspaceSection },
  { id: "agents", label: "Agents & permissions", keywords: "profile mode approve smart auto chat allowlist denylist advisor permissions", Component: AgentsSection },
  { id: "tasks", label: "Tasks", keywords: "workflow autonomy stop points ci fix attempts draft pull request factory limits", Component: TasksSection },
  { id: "instructions", label: "Instructions & skills", keywords: "WARP.md AGENTS.md rules skills catalog scope", Component: InstructionsSection },
  { id: "integrations", label: "Integrations", keywords: "github remote issue tracker linear mcp servers browser origins", Component: IntegrationsSection },
  { id: "notifications", label: "Notifications", keywords: "desktop sound phone quiet hours approval ci", Component: NotificationsSection },
  { id: "data", label: "Data", keywords: "export delete remove storage leave", Component: DataSection },
]

export const APP_SECTIONS: readonly SectionEntry[] = [
  { id: "app-agents", label: "Agents & accounts", keywords: "install update acp claude codex gemini goose opencode login quota usage spend", Component: AppAgentsSection },
  { id: "appearance", label: "Appearance", keywords: "theme dark light density compact corners radius font glass blur header window tabs dropdown projects", Component: AppearanceSection },
  { id: "remote", label: "Remote", keywords: "phone pairing code relay sinew devices", Component: RemoteSection },
  { id: "connections", label: "Connections", keywords: "github gitlab linear token browser profiles chrome mcp loopback control socket", Component: ConnectionsSection },
  { id: "plugins", label: "Plugins", keywords: "wasm tools capabilities sandbox grants", Component: PluginsSection },
  { id: "history", label: "Tasks & history", keywords: "auto-name commit message pr text retention transcripts settle delete", Component: HistorySection },
  { id: "memory", label: "Memory", keywords: "search embeddings hybrid keywords dreaming compaction scopes", Component: MemorySection },
  { id: "editor", label: "Editor", keywords: "language servers lsp markdown preview", Component: EditorSection },
  { id: "advanced", label: "Advanced", keywords: "backlog storage daemon diagnostics reset version control", Component: AdvancedSection },
  { id: "help", label: "Help", keywords: "shortcuts docs report problem version updates", Component: HelpSection },
]

function NavList({ items, active, onPick }: { items: readonly SectionEntry[]; active?: SectionId; onPick: (id: SectionId) => void }) {
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
              entry.id === active ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            )}
          >
            {entry.label}
          </button>
        </li>
      ))}
    </ul>
  )
}

/**
 * Settings for the project in front, then the app's own. One list of sections
 * on the left and the selected one on the right; rare settings sit behind an
 * Advanced disclosure inside their section, never on a separate screen.
 */
export function SettingsPage() {
  const projectId = useAppSession((session) => session.project)
  const project = findProject(projectId)
  const stored = useSettingsNav((state) => state.sections[projectId])
  const open = useSettingsNav((state) => state.open)
  const [query, setQuery] = useState("")

  const needle = query.trim().toLowerCase()
  const matches = (entry: SectionEntry) => !needle || `${entry.label} ${entry.keywords}`.toLowerCase().includes(needle)
  const projectItems = PROJECT_SECTIONS.filter(matches)
  const appItems = APP_SECTIONS.filter(matches)
  const active = [...projectItems, ...appItems].find((entry) => entry.id === stored) ?? projectItems[0] ?? appItems[0]
  const pick = (id: SectionId) => open(projectId, id)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="p-4 pb-3">
        <PageToolbar title="Project settings" meta={project.name}>
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
          {projectItems.length > 0 && (
            <>
              <div className="px-2 pb-1">
                <SectionLabel>{project.name}</SectionLabel>
                <p className="text-xs text-muted-foreground">This project only</p>
              </div>
              <NavList items={projectItems} active={active?.id} onPick={pick} />
            </>
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
          {!active && <p className="px-2 text-xs text-muted-foreground">No setting matches “{query}”.</p>}
        </nav>

        <div className="min-h-0 overflow-y-auto">
          {active && (
            <div className="mx-auto max-w-3xl px-6 py-5">
              <active.Component key={`${projectId}/${active.id}`} project={project} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
