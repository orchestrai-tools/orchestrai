import { useId, useState } from "react"
import { MoreHorizontalIcon } from "lucide-react"

import { SectionLabel } from "@/components/common/page-toolbar"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { findAgent, type AgentId } from "@/data/agents"
import { useAppActions, useAppSession } from "@/lib/app-instance"
import { findProject } from "@/lib/projects"
import { ConfirmDialog } from "@/components/common/confirm-dialog"
import { useAgentsStore } from "@/pages/agents/agents-store"
import { teamHandle, useChannelStore } from "@/pages/channel/channel-store"

function NewTeamDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const agents = useAgentsStore((state) => state.agents)
  const teams = useChannelStore((state) => state.teams)
  const createTeam = useChannelStore((state) => state.createTeam)
  const [name, setName] = useState("")
  const [purpose, setPurpose] = useState("")
  const [members, setMembers] = useState<AgentId[]>([])
  const nameId = useId()
  const purposeId = useId()
  const taken = teams.some((team) => team.name.toLowerCase() === name.trim().toLowerCase())
  const valid = name.trim() !== "" && !taken && members.length > 0

  const close = () => {
    onOpenChange(false)
    setName("")
    setPurpose("")
    setMembers([])
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New team</DialogTitle>
          <DialogDescription>A team is a named group of agents. Adding it to a channel brings all of them in at once.</DialogDescription>
        </DialogHeader>
        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel htmlFor={nameId}>Name</FieldLabel>
            <Input id={nameId} value={name} onChange={(event) => setName(event.target.value)} placeholder="Release crew" aria-invalid={taken} />
            {taken && <p className="text-xs text-destructive">A team with this name already exists.</p>}
          </Field>
          <Field>
            <FieldLabel htmlFor={purposeId}>Purpose</FieldLabel>
            <Input id={purposeId} value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder="Cut releases and write the changelog" />
          </Field>
          <Field>
            <FieldLabel>Agents</FieldLabel>
            <div className="flex flex-col gap-2">
              {agents
                .filter((agent) => agent.status !== "missing")
                .map((agent) => (
                  <label key={agent.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={members.includes(agent.id)}
                      onCheckedChange={(checked) =>
                        setMembers((current) => (checked === true ? [...current, agent.id] : current.filter((id) => id !== agent.id)))
                      }
                    />
                    {agent.name}
                    {agent.status === "sign-in" && <span className="text-xs text-muted-foreground">needs sign-in to reply</span>}
                  </label>
                ))}
            </div>
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button
            disabled={!valid}
            onClick={() => {
              createTeam({ name: name.trim(), purpose: purpose.trim() || "No purpose written yet", members })
              close()
            }}
          >
            Create team
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Buzz's teams: the action that matters is adding the whole group to a channel at once. */
export function TeamsSection() {
  const project = useAppSession((session) => session.project)
  const teams = useChannelStore((state) => state.teams)
  const joined = useChannelStore((state) => state.channels[project].members.teams)
  const addTeam = useChannelStore((state) => state.addTeam)
  const deleteTeam = useChannelStore((state) => state.deleteTeam)
  const { setPage } = useAppActions()
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const channel = `#${findProject(project).name}`

  return (
    <section aria-label="Teams" className="-mx-2 flex flex-col gap-2">
      <div className="flex items-center gap-2 px-2">
        <SectionLabel>Teams</SectionLabel>
        <span className="text-xs text-muted-foreground">Named groups of agents you add to a channel together.</span>
        <Button size="xs" variant="outline" className="ml-auto" onClick={() => setCreating(true)}>
          New team
        </Button>
      </div>
      <ul className="flex flex-col">
        {teams.map((team) => {
          const inChannel = joined.includes(team.name)
          return (
            <li key={team.name} className="group/row flex items-center gap-3 rounded-md px-2 py-(--row-py) hover:bg-muted/40">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-medium">{team.name}</span>
                  <span className="text-xs text-muted-foreground">@{teamHandle(team)}</span>
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {team.purpose} · {team.members.map((id) => findAgent(id).name).join(", ")}
                </div>
              </div>
              {inChannel ? (
                <span className="text-xs text-muted-foreground">In {channel}</span>
              ) : (
                <Button size="xs" variant="outline" onClick={() => addTeam(project, team.name)}>
                  Add to {channel}
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`More for ${team.name}`}
                    className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
                  >
                    <MoreHorizontalIcon />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onSelect={() => setPage("channel")}>Open {channel}</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(team.name)}>
                    Delete team…
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          )
        })}
        {teams.length === 0 && <li className="px-2 text-xs text-muted-foreground">No teams yet.</li>}
      </ul>
      <NewTeamDialog open={creating} onOpenChange={setCreating} />
      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting ?? "this team"}?`}
        description="It leaves every channel it was added to. Its agents stay wherever they already are."
        confirmLabel="Delete team"
        onConfirm={() => deleting && deleteTeam(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
      />
    </section>
  )
}
