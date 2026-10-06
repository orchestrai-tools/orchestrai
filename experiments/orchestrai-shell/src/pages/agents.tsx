import { useState } from "react"

import { PageToolbar, SectionLabel } from "@/components/common/page-toolbar"
import { Button } from "@/components/ui/button"
import { findAgent, type AgentId } from "@/data/agents"
import { AGENT_SETUP, DENYLIST_RULES } from "@/data/agent-setup"
import { AccountsSection } from "@/pages/agents/accounts"
import { AgentList } from "@/pages/agents/agent-list"
import { useAgentsStore } from "@/pages/agents/agents-store"
import { ConfirmDialog } from "@/components/common/confirm-dialog"
import { DefaultsDialog } from "@/pages/agents/defaults-dialog"
import { RegistryDialog } from "@/pages/agents/registry-dialog"
import { SignInDialog } from "@/pages/agents/sign-in-dialog"
import { TeamsSection } from "@/pages/agents/teams"

/**
 * Buzz's Agents page on the ACP backbone: who each agent is, whether it
 * starts, what it runs with and which defaults it inherits, the logins and
 * quota behind it, and the teams it belongs to.
 */
export function AgentsPage() {
  const agents = useAgentsStore((state) => state.agents)
  const profile = useAgentsStore((state) => state.profile)
  const gitTextAgent = useAgentsStore((state) => state.gitTextAgent)
  const uninstall = useAgentsStore((state) => state.uninstall)
  const [registryOpen, setRegistryOpen] = useState(false)
  const [defaultsFor, setDefaultsFor] = useState<AgentId | "global" | null>(null)
  const [signingIn, setSigningIn] = useState<AgentId | null>(null)
  const [removing, setRemoving] = useState<AgentId | null>(null)

  const count = (status: string) => agents.filter((agent) => agent.status === status).length
  const signIn = count("sign-in")
  const meta = [`${count("ready")} ready`, signIn && `${signIn} ${signIn === 1 ? "needs" : "need"} sign-in`, count("missing") && `${count("missing")} not installed`]
    .filter(Boolean)
    .join(" · ")
  const removingAgent = removing ? findAgent(removing) : undefined

  return (
    <div className="flex min-h-full flex-col gap-6 p-4">
      <PageToolbar title="Agents" meta={meta}>
        <Button variant="outline" size="sm" onClick={() => setDefaultsFor("global")}>
          Global defaults
        </Button>
        <Button size="sm" onClick={() => setRegistryOpen(true)}>
          Install from registry
        </Button>
      </PageToolbar>

      <section aria-label="ACP agents" className="-mx-2 flex flex-col gap-2">
        <div className="flex items-center gap-2 px-2">
          <SectionLabel>ACP agents</SectionLabel>
          <span className="text-xs text-muted-foreground">The switch offers an agent for new tasks.</span>
        </div>
        <AgentList onSignIn={setSigningIn} onDefaults={setDefaultsFor} onUninstall={setRemoving} />
        <p className="px-2 text-xs text-muted-foreground">
          Global: {profile} for permissions, with {DENYLIST_RULES} denylist rules checked before any allowlist. Commit and pull request text
          by {findAgent(gitTextAgent).name}.{" "}
          <button type="button" onClick={() => setDefaultsFor("global")} className="underline-offset-2 hover:text-foreground hover:underline">
            Change
          </button>
        </p>
      </section>

      <AccountsSection />
      <TeamsSection />

      <RegistryDialog open={registryOpen} onOpenChange={setRegistryOpen} />
      <DefaultsDialog target={defaultsFor} onOpenChange={(open) => !open && setDefaultsFor(null)} />
      <SignInDialog agentId={signingIn} onOpenChange={(open) => !open && setSigningIn(null)} />
      <ConfirmDialog
        open={removingAgent !== undefined}
        title={`Uninstall ${removingAgent?.name ?? "this agent"}?`}
        description={`Runs the uninstall for ${removing ? AGENT_SETUP[removing].install.pkg : "it"}. Its sessions stay in the agent's own store; Orchestrai never deletes them.`}
        confirmLabel="Uninstall"
        onConfirm={() => removing && uninstall(removing)}
        onOpenChange={(open) => !open && setRemoving(null)}
      />
    </div>
  )
}
