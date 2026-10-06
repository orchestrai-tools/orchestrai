import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { REGISTRY } from "@/data/agent-setup"
import { useAgentsStore } from "@/pages/agents/agents-store"

/** Install an agent from the ACP Registry. Installed means it answered the ACP handshake, not that npm exited 0. */
export function RegistryDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const installs = useAgentsStore((state) => state.installs)
  const agents = useAgentsStore((state) => state.agents)
  const extras = useAgentsStore((state) => state.extras)
  const install = useAgentsStore((state) => state.install)
  const [filter, setFilter] = useState("")
  const query = filter.trim().toLowerCase()
  const entries = REGISTRY.filter((entry) => `${entry.name} ${entry.publisher} ${entry.summary}`.toLowerCase().includes(query))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Install from the ACP Registry</DialogTitle>
          <DialogDescription>
            Agents that speak ACP over stdio. Orchestrai installs the package, then starts the agent once to prove it answers the handshake. A
            broken install is repaired once, on its own.
          </DialogDescription>
        </DialogHeader>
        <Input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter by name or publisher" aria-label="Filter agents" />
        <ul className="-mx-2 flex max-h-80 flex-col overflow-y-auto">
          {entries.map((entry) => {
            const phase = installs[entry.id]
            const installed = extras.includes(entry.id) || agents.some((agent) => agent.id === entry.id && agent.status !== "missing")
            const busy = phase === "installing" || phase === "verifying"
            return (
              <li key={entry.id} className="flex items-start gap-3 rounded-md px-2 py-(--row-py) hover:bg-muted/40">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-sm font-medium">{entry.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {entry.publisher} · v{entry.version}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{entry.summary}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground" title={entry.install}>
                    {phase === "verifying" ? `${entry.command} · checking the ACP handshake` : entry.install}
                  </p>
                </div>
                <Button size="xs" variant={installed ? "ghost" : "outline"} disabled={installed || busy} onClick={() => install(entry.id, entry.version)}>
                  {phase === "installing" ? "Installing…" : phase === "verifying" ? "Checking…" : installed ? "Installed" : "Install"}
                </Button>
              </li>
            )
          })}
          {entries.length === 0 && <li className="px-2 py-6 text-center text-xs text-muted-foreground">No agent in the registry matches.</li>}
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
