import { findAgent } from "@/data/agents"
import { REGISTRY } from "@/data/agent-setup"
import type { Action, ActionContext } from "@/lib/actions"
import { findProject, type ProjectId } from "@/lib/projects"
import { useAgentsStore } from "@/pages/agents/agents-store"
import { useChannelStore } from "@/pages/channel/channel-store"
import { useRuntimeStore } from "@/pages/services/runtime-store"
import { canContinue, canFork } from "@/pages/sessions/session-meta"
import { useSessionsStore } from "@/pages/sessions/sessions-store"
import { APP_SECTIONS, PROJECT_SECTIONS } from "@/pages/settings"
import { openSettingsSection } from "@/pages/settings/nav-store"

/** Start, stop, or restart each service, and the bulk actions the Services list has. */
function serviceActions(project: ProjectId): Action[] {
  const { runtimes, start, stop, restart, startAll, stopAll } = useRuntimeStore.getState()
  const runtime = runtimes[project]
  if (!runtime) return []
  const action = (id: string, title: string, perform: () => void, name?: string, keywords?: string): Action => ({
    id,
    title,
    group: "Services",
    keywords,
    run: (ctx) => {
      perform()
      if (name) ctx.select("service", `service:${name}`, "services")
      else ctx.setPage("services")
    },
  })
  const each = runtime.services.flatMap((svc) =>
    svc.status === "running" || svc.status === "starting"
      ? [
          action(`restart-${svc.name}`, `Restart ${svc.name}`, () => restart(project, svc.name), svc.name, svc.command),
          action(`stop-${svc.name}`, `Stop ${svc.name}`, () => stop(project, svc.name), svc.name, svc.command),
        ]
      : [action(`start-${svc.name}`, `Start ${svc.name}`, () => start(project, svc.name), svc.name, svc.command)]
  )
  return [
    ...each,
    action("start-all", "Start all services", () => startAll(project)),
    action("stop-all", "Stop all services", () => stopAll(project)),
  ]
}

/** Every settings section, so a setting is one search away from any page. */
function settingsActions(project: ProjectId): Action[] {
  const open = (scope: "Project" | "App") => (entry: (typeof PROJECT_SECTIONS)[number]): Action => ({
    id: `settings-${entry.id}`,
    title: `${scope} settings: ${entry.label}`,
    group: "Settings",
    keywords: entry.keywords,
    run: (ctx) => {
      openSettingsSection(project, entry.id)
      ctx.setPage("settings")
    },
  })
  return [...PROJECT_SECTIONS.map(open("Project")), ...APP_SECTIONS.map(open("App"))]
}

/**
 * Palette entries for things the pages hold in their own stores, read at the
 * moment the palette opens: continue or fork a session, add a team to the
 * channel, sign in to or install an agent, run services, open a setting.
 */
export function domainActions(project: ProjectId): Action[] {
  const { sessions, hidden, continueSession, fork } = useSessionsStore.getState()
  const sessionActions: Action[] = sessions
    .filter((session) => session.project === project && !hidden.includes(session.id))
    .flatMap((session) => {
      const keywords = `${findAgent(session.agent).name} ${session.id} ${session.source}`
      const entries: Action[] = []
      if (canContinue(session)) {
        entries.push({
          id: `continue-${session.id}`,
          title: `Continue “${session.title}”`,
          group: "Sessions",
          keywords: `${keywords} session/load resume`,
          run: (ctx) => {
            continueSession(session.id)
            ctx.select("session", session.id, "sessions")
          },
        })
      }
      if (canFork(session)) {
        entries.push({
          id: `fork-${session.id}`,
          title: `Fork “${session.title}”`,
          group: "Sessions",
          keywords: `${keywords} session/fork`,
          run: (ctx) => {
            const id = fork(session.id)
            if (id) ctx.select("session", id, "sessions")
          },
        })
      }
      return entries
    })

  const { teams, channels, addTeam } = useChannelStore.getState()
  const members = channels[project]?.members.teams ?? []
  const channelActions: Action[] = teams
    .filter((team) => !members.includes(team.name))
    .map((team) => ({
      id: `team-${team.name}`,
      title: `Add team ${team.name} to #${findProject(project).name}`,
      group: "Channel",
      keywords: team.members.join(" "),
      run: (ctx) => {
        addTeam(project, team.name)
        ctx.setPage("channel")
      },
    }))

  const { agents, extras, installs, signIn, install } = useAgentsStore.getState()
  const installed = (id: string) =>
    Boolean(installs[id]) || extras.includes(id) || agents.some((agent) => agent.id === id && agent.status !== "missing")
  const agentActions: Action[] = [
    ...agents
      .filter((agent) => agent.status === "sign-in")
      .map((agent) => ({
        id: `sign-in-${agent.id}`,
        title: `Sign in to ${agent.name}`,
        group: "Agents" as const,
        run: (ctx: ActionContext) => {
          signIn(agent.id)
          ctx.setPage("agents")
        },
      })),
    ...REGISTRY.filter((entry) => !installed(entry.id)).map((entry) => ({
      id: `install-${entry.id}`,
      title: `Install ${entry.name} from the ACP Registry`,
      group: "Agents" as const,
      keywords: `${entry.publisher} ${entry.command}`,
      run: (ctx: ActionContext) => {
        install(entry.id, entry.version)
        ctx.setPage("agents")
      },
    })),
  ]

  return [...sessionActions, ...channelActions, ...agentActions, ...serviceActions(project), ...settingsActions(project)]
}
