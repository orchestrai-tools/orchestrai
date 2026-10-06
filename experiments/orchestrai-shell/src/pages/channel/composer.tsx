import { useRef, useState, type KeyboardEvent } from "react"

import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { AGENTS, findAgent } from "@/data/agents"
import { PEOPLE } from "@/data/channel"
import type { ProjectId } from "@/lib/projects"
import { cn } from "@/lib/utils"
import { teamHandle, useChannelStore } from "@/pages/channel/channel-store"

interface Candidate {
  handle: string
  name: string
  detail: string
}

/** The `@word` being typed at the caret, if any. */
function mentionAt(value: string, caret: number): { start: number; text: string } | null {
  const match = /(^|\s)@([\w-]*)$/.exec(value.slice(0, caret))
  return match ? { start: caret - match[2].length - 1, text: match[2].toLowerCase() } : null
}

function useCandidates(project: ProjectId): Candidate[] {
  const members = useChannelStore((state) => state.channels[project].members)
  const teams = useChannelStore((state) => state.teams)
  const agents = [...AGENTS].sort((a, b) => Number(members.agents.includes(b.id)) - Number(members.agents.includes(a.id)))
  return [
    ...agents.map((agent) => ({
      handle: agent.id,
      name: agent.name,
      detail: members.agents.includes(agent.id) ? "agent · steers it" : "agent · not in this channel",
    })),
    ...teams.map((team) => ({
      handle: teamHandle(team),
      name: team.name,
      detail: `team · ${team.members.map((id) => findAgent(id).name).join(", ")}`,
    })),
    ...PEOPLE.map((person) => ({ handle: person.handle, name: person.name, detail: person.role === "You" ? "you" : person.role })),
  ]
}

/** A message box for the shared room. `@` suggests people, agents, and teams; mentioning an agent steers it. */
export function Composer({
  project,
  channelName,
  value,
  onChange,
  onSend,
}: {
  project: ProjectId
  channelName: string
  value: string
  onChange: (value: string) => void
  onSend: (text: string) => void
}) {
  const input = useRef<HTMLTextAreaElement>(null)
  const [caret, setCaret] = useState(0)
  const [active, setActive] = useState(0)
  const [dismissedAt, setDismissedAt] = useState<number | null>(null)
  const candidates = useCandidates(project)

  const query = mentionAt(value, caret)
  const matches =
    query && query.start !== dismissedAt
      ? candidates.filter((candidate) => candidate.handle.startsWith(query.text) || candidate.name.toLowerCase().startsWith(query.text)).slice(0, 6)
      : []
  const highlighted = Math.min(active, Math.max(matches.length - 1, 0))

  const pick = (candidate: Candidate) => {
    if (!query) return
    const next = `${value.slice(0, query.start)}@${candidate.handle} ${value.slice(caret)}`
    const position = query.start + candidate.handle.length + 2
    onChange(next)
    setCaret(position)
    requestAnimationFrame(() => {
      input.current?.focus()
      input.current?.setSelectionRange(position, position)
    })
  }
  const submit = () => {
    if (value.trim()) onSend(value.trim())
  }
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (matches.length > 0 && query) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault()
        const step = event.key === "ArrowDown" ? 1 : -1
        setActive((highlighted + step + matches.length) % matches.length)
        return
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault()
        pick(matches[highlighted])
        return
      }
      if (event.key === "Escape") {
        event.preventDefault()
        setDismissedAt(query.start)
        return
      }
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      submit()
    }
  }

  return (
    <div className="relative">
      {matches.length > 0 && (
        <ul role="listbox" aria-label="Mention someone" className="absolute bottom-full left-0 z-10 mb-1 w-96 max-w-full rounded-md bg-popover p-1 shadow-md ring-1 ring-foreground/10">
          {matches.map((candidate, index) => (
            <li key={candidate.handle} role="option" aria-selected={index === highlighted}>
              <button
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault()
                  pick(candidate)
                }}
                onMouseEnter={() => setActive(index)}
                className={cn("flex w-full items-baseline gap-2 rounded-sm px-2 py-1 text-left text-sm", index === highlighted && "bg-accent")}
              >
                <span className="font-medium">@{candidate.handle}</span>
                <span className="min-w-0 truncate text-xs text-muted-foreground">
                  {candidate.name} · {candidate.detail}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-end gap-2 rounded-lg border bg-background p-1.5 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
        <textarea
          ref={input}
          rows={1}
          value={value}
          aria-label={`Message ${channelName}`}
          placeholder={`Message ${channelName}`}
          onChange={(event) => {
            onChange(event.target.value)
            setCaret(event.target.selectionStart)
            setActive(0)
          }}
          onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
          onKeyDown={onKeyDown}
          className="field-sizing-content max-h-40 min-h-8 flex-1 resize-none bg-transparent px-1.5 py-1 text-sm outline-none placeholder:text-muted-foreground"
        />
        <Button size="sm" onClick={submit} disabled={!value.trim()}>
          Send
        </Button>
      </div>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>Type @ to mention a person, an agent, or a team. A mentioned agent takes the steer and answers here, for everyone.</span>
        <span className="ml-auto flex items-center gap-1">
          <Kbd>↵</Kbd> send <Kbd>⇧↵</Kbd> new line
        </span>
      </p>
    </div>
  )
}
