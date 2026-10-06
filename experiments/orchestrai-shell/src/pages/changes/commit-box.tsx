import { useRef, useState } from "react"
import { SparklesIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Kbd } from "@/components/ui/kbd"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { GitActions, GitState } from "@/pages/changes/git-store"

/** The agent that drafts commit messages, shelf names and PR text (Settings → Text generation). */
const TEXT_AGENT = "Codex"

/**
 * Commits exactly the checked files. Amend fills in the message it rewrites,
 * and takes back only a message it put there itself.
 */
export function CommitBox({ state, actions }: { state: GitState; actions: GitActions }) {
  const [message, setMessage] = useState("")
  const [amend, setAmend] = useState(false)
  const [drafting, setDrafting] = useState(false)
  const prefilled = useRef<string | null>(null)
  const count = state.checked.length
  const canCommit = count > 0 && (message.trim().length > 0 || amend)

  const toggleAmend = (next: boolean) => {
    setAmend(next)
    if (next && !message.trim() && state.lastCommit.message) {
      prefilled.current = state.lastCommit.message
      setMessage(state.lastCommit.message)
    } else if (!next && message === prefilled.current) {
      prefilled.current = null
      setMessage("")
    }
  }

  const commit = () => {
    if (!canCommit) return
    actions.commit(message.trim() || state.lastCommit.message, amend)
    setMessage("")
    setAmend(false)
    prefilled.current = null
  }

  const draft = () => {
    setDrafting(true)
    setTimeout(() => {
      setMessage(state.draftMessage || `Update ${count} ${count === 1 ? "file" : "files"}`)
      setDrafting(false)
    }, 700)
  }

  return (
    <div className="flex flex-col gap-2 border-t p-3">
      <Textarea
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        onKeyDown={(event) => event.key === "Enter" && (event.metaKey || event.ctrlKey) && commit()}
        placeholder={count ? "Commit message" : "Check files to commit them"}
        aria-label="Commit message"
        className="max-h-40 min-h-16 resize-none text-sm"
      />
      <div className="flex items-center gap-1">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Checkbox checked={amend} onCheckedChange={(value) => toggleAmend(value === true)} />
          Amend
        </label>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="xs" className="ml-1 text-muted-foreground" disabled={!count || drafting} onClick={draft}>
              <SparklesIcon />
              {drafting ? "Drafting…" : "Draft"}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Draft a message from the checked changes with {TEXT_AGENT}</TooltipContent>
        </Tooltip>
        <Button size="sm" className="ml-auto" disabled={!canCommit} onClick={commit}>
          {amend ? "Amend" : count > 0 ? `Commit ${count}` : "Commit"}
          <Kbd className="border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground">⌘↵</Kbd>
        </Button>
      </div>
    </div>
  )
}
