import { MoreHorizontalIcon } from "lucide-react"
import { useShallow } from "zustand/react/shallow"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Switch } from "@/components/ui/switch"
import type { Agent, AgentId } from "@/data/agents"
import { AGENT_SETUP, REGISTRY } from "@/data/agent-setup"
import { cn } from "@/lib/utils"
import { AGENT_STATE, agentState, supports, type AgentState } from "@/pages/agents/agent-state"
import { useAgentsStore } from "@/pages/agents/agents-store"
import { isLive } from "@/pages/sessions/session-meta"
import { useSessionsStore } from "@/pages/sessions/sessions-store"

interface RowCallbacks {
  onSignIn: (id: AgentId) => void
  onDefaults: (id: AgentId) => void
  onUninstall: (id: AgentId) => void
}

function Fact({ label, value, source, title }: { label: string; value: string; source?: string; title?: string }) {
  return (
    <div className="flex items-baseline gap-1" title={title}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>
        {value}
        {source && <span className="text-muted-foreground"> · {source}</span>}
      </dd>
    </div>
  )
}

function notesFor(agent: Agent, state: AgentState, done: boolean, reloaded: boolean, gitText: boolean): string[] {
  const setup = AGENT_SETUP[agent.id]
  const notes: string[] = []
  if (state === "installing") notes.push(`Running ${setup.install.command}`)
  if (state === "verifying") notes.push("Installed. Starting it once to prove it answers the ACP handshake.")
  if (state === "missing") notes.push(`Install from the ACP Registry, or run ${setup.install.command}`)
  if (state === "sign-in") notes.push(`${setup.signIn} It keeps its own login; Orchestrai never sees the token.`)
  if (state === "update") notes.push(`${setup.latest} is out. Updating runs ${setup.install.command}, then checks it still starts.`)
  if (state === "ready" && done) notes.push("Installed and verified: it answered the ACP handshake.")
  if (reloaded) notes.push("Model list reloaded from the agent over ACP.")
  if (gitText) notes.push("Writes commit messages and pull request descriptions.")
  return notes
}

function AgentRow({ agent, onSignIn, onDefaults, onUninstall }: RowCallbacks & { agent: Agent }) {
  const setup = AGENT_SETUP[agent.id]
  const { enabled, defaults, profile, gitText, phase, reloaded } = useAgentsStore(
    useShallow((state) => ({
      enabled: state.enabled[agent.id],
      defaults: state.defaults[agent.id],
      profile: state.profile,
      gitText: state.gitTextAgent === agent.id,
      phase: state.installs[agent.id],
      reloaded: state.reloaded.includes(agent.id),
    }))
  )
  const { setEnabled, install, reloadModels } = useAgentsStore(
    useShallow((state) => ({ setEnabled: state.setEnabled, install: state.install, reloadModels: state.reloadModels }))
  )
  const sessions = useSessionsStore(useShallow((state) => state.sessions.filter((session) => session.agent === agent.id)))
  const state = agentState(agent, phase)
  const installed = agent.status !== "missing"
  const live = sessions.filter((session) => isLive(session.status)).length
  const version = !installed ? "not installed" : state === "update" ? `v${agent.version} → ${setup.latest}` : `v${agent.version}`
  const busy = state === "installing" || state === "verifying"

  return (
    <li className="group/row flex items-start gap-3 rounded-md px-2 py-(--row-py) hover:bg-muted/40">
      <Switch
        size="sm"
        className="mt-1"
        checked={installed && enabled}
        disabled={!installed}
        onCheckedChange={(on) => setEnabled(agent.id, on)}
        aria-label={`Offer ${agent.name} for new tasks`}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-medium">{agent.name}</span>
          <span className="text-xs text-muted-foreground">
            {agent.vendor} · {version}
          </span>
          <code className="font-mono text-xs text-muted-foreground">{agent.command}</code>
        </div>
        {installed && (
          <dl className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
            <Fact label="Model" value={defaults.model ?? agent.model} source={defaults.model ? "set here" : "agent default"} />
            {setup.efforts.length > 0 && <Fact label="Effort" value={defaults.effort ?? "agent default"} source={defaults.effort ? "set here" : undefined} />}
            <Fact label="Mode" value={defaults.mode ?? setup.modes[0]} source={defaults.mode ? "set here" : "agent default"} />
            <Fact label="Permissions" value={defaults.profile ?? profile} source={defaults.profile ? "set here" : "from Global"} />
            <Fact
              label="Supports"
              value={supports(agent)}
              title="Continue is ACP session/load and fork is session/fork, each shown only when the agent advertises it"
            />
            <Fact label="Sessions" value={sessions.length ? `${live} live · ${sessions.length} in all` : "none yet"} />
          </dl>
        )}
        {notesFor(agent, state, phase === "done", reloaded, gitText).map((text) => (
          <p key={text} className={cn("text-xs", state === "sign-in" ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>
            {text}
          </p>
        ))}
      </div>
      <span className="flex w-36 shrink-0 items-center gap-1.5 pt-0.5 text-xs text-muted-foreground">
        <span aria-hidden className={cn("size-2 shrink-0 rounded-full", AGENT_STATE[state].dot)} />
        {AGENT_STATE[state].label}
      </span>
      <div className="flex w-44 shrink-0 items-center justify-end gap-1">
        {state === "missing" && (
          <Button size="xs" onClick={() => install(agent.id, setup.latest ?? "1.0.0")}>
            Install
          </Button>
        )}
        {state === "update" && (
          <Button size="xs" onClick={() => install(agent.id, setup.latest ?? agent.version)}>
            Update
          </Button>
        )}
        {state === "sign-in" && (
          <Button size="xs" onClick={() => onSignIn(agent.id)}>
            Sign in…
          </Button>
        )}
        <Button size="xs" variant="outline" disabled={!installed || busy} onClick={() => onDefaults(agent.id)}>
          Defaults…
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`More for ${agent.name}`}
              className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
            >
              <MoreHorizontalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem disabled={!installed} onSelect={() => reloadModels(agent.id)}>
              Reload model list
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void navigator.clipboard?.writeText(agent.command)}>Copy ACP command</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void navigator.clipboard?.writeText(setup.install.command)}>Copy install command</DropdownMenuItem>
            {installed && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" disabled={busy} onSelect={() => onUninstall(agent.id)}>
                  Uninstall…
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  )
}

/** Every ACP agent the daemon knows: whether it starts, what it runs with, and where each default comes from. */
export function AgentList(callbacks: RowCallbacks) {
  const agents = useAgentsStore((state) => state.agents)
  const extras = useAgentsStore((state) => state.extras)
  const extraNames = extras.map((id) => {
    const entry = REGISTRY.find((candidate) => candidate.id === id)
    return entry ? `${entry.name} v${entry.version}` : id
  })

  return (
    <>
      <ul className="flex flex-col gap-1">
        {agents.map((agent) => (
          <AgentRow key={agent.id} agent={agent} {...callbacks} />
        ))}
      </ul>
      {extraNames.length > 0 && (
        <p className="px-2 text-xs text-muted-foreground">
          Also installed from the ACP Registry: {extraNames.join(", ")}. Each answered the ACP handshake and is offered for new tasks.
        </p>
      )}
    </>
  )
}
