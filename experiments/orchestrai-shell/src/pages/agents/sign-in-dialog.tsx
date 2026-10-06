import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { AgentId } from "@/data/agents"
import { AGENT_SETUP } from "@/data/agent-setup"
import { useAppActions } from "@/lib/app-instance"
import { useAgent, useAgentsStore } from "@/pages/agents/agents-store"

function SignInBody({ id, onDone }: { id: AgentId; onDone: () => void }) {
  const agent = useAgent(id)
  const signIn = useAgentsStore((state) => state.signIn)
  const { toggleTerminal } = useAppActions()
  const [checking, setChecking] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const check = () => {
    setChecking(true)
    timer.current = window.setTimeout(() => {
      signIn(id)
      onDone()
    }, 900)
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Sign in to {agent.name}</DialogTitle>
        <DialogDescription>
          {agent.name} keeps its own login. Orchestrai never sees the token; it only checks that the agent starts signed in.
        </DialogDescription>
      </DialogHeader>
      <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm">
        <li>Open a terminal in the drawer below.</li>
        <li>{AGENT_SETUP[id].signIn}</li>
        <li>Come back here. The status checks again when this window regains focus.</li>
      </ol>
      <DialogFooter>
        <Button variant="outline" onClick={() => toggleTerminal(true)}>
          Open terminal
        </Button>
        <Button onClick={check} disabled={checking}>
          {checking ? "Checking…" : "Check again"}
        </Button>
      </DialogFooter>
    </>
  )
}

export function SignInDialog({ agentId, onOpenChange }: { agentId: AgentId | null; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={agentId !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {agentId && <SignInBody key={agentId} id={agentId} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}
