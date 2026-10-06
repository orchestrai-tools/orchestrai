import { Fragment, type ReactNode } from "react"
import { MoreHorizontalIcon } from "lucide-react"
import { useShallow } from "zustand/react/shallow"

import { StatusDot } from "@/components/common/status-mark"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { findAgent, type Agent } from "@/data/agents"
import { findPerson, type Person } from "@/data/channel"
import { tasksFor, type RunStatus } from "@/data/tasks"
import { useAppActions } from "@/lib/app-instance"
import type { ProjectId } from "@/lib/projects"
import { cn } from "@/lib/utils"
import { useAgentsStore } from "@/pages/agents/agents-store"
import { AuthorMark } from "@/pages/channel/author-mark"
import { teamHandle, useChannelStore } from "@/pages/channel/channel-store"

const PRESENCE: Record<Person["presence"], string> = {
  active: "bg-emerald-500",
  away: "border border-amber-500",
  offline: "border border-muted-foreground/50",
}

const DOING: Partial<Record<RunStatus, string>> = {
  "needs-you": "Waiting on you in",
  running: "Working on",
  stopped: "Stopped on",
  failed: "Failed on",
  review: "In review:",
}

/** What the agent is doing in this project, from the status its own task reports. */
function doing(agent: Agent, project: ProjectId): { status?: RunStatus; text: string } {
  if (agent.status === "sign-in") return { text: "Needs sign-in" }
  if (agent.status === "missing") return { text: "Not installed" }
  const order = Object.keys(DOING) as RunStatus[]
  const task = tasksFor(project)
    .filter((entry) => entry.agent === agent.id && order.includes(entry.status))
    .sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status))[0]
  return task ? { status: task.status, text: `${DOING[task.status]} ${task.id}` } : { text: "Idle" }
}

function Group({ label, count, action, children }: { label: string; count: number; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <div className="flex min-h-6 items-center gap-2 px-2">
        <h2 className="text-xs font-medium text-muted-foreground">{label}</h2>
        <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
        {action && <div className="ml-auto">{action}</div>}
      </div>
      <ul className="flex flex-col">{children}</ul>
    </section>
  )
}

function RowMenu({ label, items }: { label: string; items: { label: string; run: () => void; separated?: boolean }[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Actions for ${label}`}
          className="ml-auto opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
        >
          <MoreHorizontalIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {items.map((item) => (
          <Fragment key={item.label}>
            {item.separated && <DropdownMenuSeparator />}
            <DropdownMenuItem onSelect={item.run}>{item.label}</DropdownMenuItem>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Who is in the room: people and agents alike, and the teams that brought agents in together. */
export function MembersPanel({ project, onMention }: { project: ProjectId; onMention: (handle: string) => void }) {
  const members = useChannelStore((state) => state.channels[project].members)
  const teams = useChannelStore((state) => state.teams)
  const { addTeam, addAgent, removeAgent, removeTeam } = useChannelStore(
    useShallow((state) => ({ addTeam: state.addTeam, addAgent: state.addAgent, removeAgent: state.removeAgent, removeTeam: state.removeTeam }))
  )
  const agents = useAgentsStore((state) => state.agents)
  const { setPage } = useAppActions()
  const outside = agents.filter((agent) => !members.agents.includes(agent.id))
  const otherTeams = teams.filter((team) => !members.teams.includes(team.name))

  return (
    <aside aria-label="Members" className="flex w-64 shrink-0 flex-col gap-5 overflow-y-auto border-l px-2 py-4">
      <Group label="People" count={members.people.length}>
        {members.people.map((id) => {
          const person = findPerson(id)
          return (
            <li key={id} className="group/row flex items-center gap-2 rounded-md px-2 py-(--row-py) hover:bg-muted/40">
              <AuthorMark author={{ kind: "person", id }} className="size-6" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{person.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{person.role}</span>
              </span>
              <span aria-label={person.presence} className={cn("size-2 shrink-0 rounded-full", PRESENCE[person.presence])} />
              {person.role !== "You" && <RowMenu label={person.name} items={[{ label: "Mention", run: () => onMention(person.handle) }]} />}
            </li>
          )
        })}
      </Group>

      <Group
        label="Agents"
        count={members.agents.length}
        action={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="xs">Add agent</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              {outside.length === 0 && <DropdownMenuItem disabled>Every agent is already here</DropdownMenuItem>}
              {outside.map((agent) => (
                <DropdownMenuItem key={agent.id} disabled={agent.status === "missing"} onSelect={() => addAgent(project, agent.id)}>
                  <span className="flex-1">{agent.name}</span>
                  {agent.status !== "ready" && (
                    <span className="text-xs text-muted-foreground">{agent.status === "missing" ? "Not installed" : "Needs sign-in"}</span>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        }
      >
        {members.agents.map((id) => {
          const agent = agents.find((entry) => entry.id === id) ?? findAgent(id)
          const now = doing(agent, project)
          return (
            <li key={id} className="group/row flex items-center gap-2 rounded-md px-2 py-(--row-py) hover:bg-muted/40">
              <AuthorMark author={{ kind: "agent", id }} className="size-6" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{agent.name}</span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  {now.status && <StatusDot status={now.status} />}
                  <span className="truncate">{now.text}</span>
                </span>
              </span>
              <RowMenu
                label={agent.name}
                items={[
                  { label: "Mention", run: () => onMention(agent.id) },
                  { label: "Remove from channel", run: () => removeAgent(project, id), separated: true },
                ]}
              />
            </li>
          )
        })}
      </Group>

      <Group
        label="Teams"
        count={members.teams.length}
        action={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="xs">Add team</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              {otherTeams.length === 0 && <DropdownMenuItem disabled>Every team is already here</DropdownMenuItem>}
              {otherTeams.map((team) => (
                <DropdownMenuItem key={team.name} onSelect={() => addTeam(project, team.name)} className="flex-col items-start gap-0">
                  <span>{team.name}</span>
                  <span className="text-xs text-muted-foreground">{team.members.map((agent) => findAgent(agent).name).join(", ")}</span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setPage("agents")}>Create or edit teams…</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      >
        {members.teams.length === 0 && (
          <li className="px-2 text-xs text-muted-foreground">No teams yet. Adding one brings all of its agents in at once.</li>
        )}
        {members.teams.map((name) => {
          const team = teams.find((entry) => entry.name === name)
          return (
            <li key={name} className="group/row flex items-center gap-2 rounded-md px-2 py-(--row-py) hover:bg-muted/40">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {team ? team.members.map((agent) => findAgent(agent).name).join(", ") : "Deleted team"}
                </span>
              </span>
              <RowMenu
                label={name}
                items={[
                  ...(team ? [{ label: `Mention @${teamHandle(team)}`, run: () => onMention(teamHandle(team)) }] : []),
                  { label: "Remove team from channel", run: () => removeTeam(project, name), separated: true },
                ]}
              />
            </li>
          )
        })}
      </Group>
    </aside>
  )
}
