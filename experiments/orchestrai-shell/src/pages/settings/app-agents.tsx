import { Button } from "@/components/ui/button"
import type { Agent } from "@/data/agents"
import { useAppActions } from "@/lib/app-instance"
import { cn } from "@/lib/utils"
import { useAgentsStore } from "@/pages/agents/agents-store"
import { Group, Row, SectionHeader, SwitchRow } from "@/pages/settings/primitives"
import { useAppSetting } from "@/pages/settings/settings-store"

const STATE: Record<Agent["status"], { label: string; tone: string }> = {
  ready: { label: "Ready", tone: "bg-emerald-500" },
  "sign-in": { label: "Needs sign-in", tone: "bg-amber-500" },
  missing: { label: "Not installed", tone: "bg-muted-foreground/40" },
}

/**
 * Agents are managed on the Agents page: installs, sign-in, defaults, teams,
 * and logins with their quotas. Settings shows where things stand and keeps
 * only the app-wide switches that page does not have.
 */
export function AppAgentsSection() {
  const { setPage } = useAppActions()
  const agents = useAgentsStore((state) => state.agents)
  const [checkUpdates, setCheckUpdates] = useAppSetting("agents.checkUpdates", true)
  const [probe, setProbe] = useAppSetting("agents.probeOnStart", true)

  return (
    <>
      <SectionHeader
        title="Agents & accounts"
        scope="Installing, signing in, per-agent defaults, teams, and every login with its quota live on the Agents page, so each is changed in one place."
      >
        <Button variant="outline" size="sm" className="text-xs" onClick={() => setPage("agents")}>
          Open Agents
        </Button>
      </SectionHeader>

      <Group title="On this Mac">
        {agents.map((agent) => (
          <Row
            key={agent.id}
            title={
              <span className="flex items-center gap-2">
                <span aria-hidden className={cn("size-2 rounded-full", STATE[agent.status].tone)} />
                {agent.name}
                <span className="text-xs font-normal text-muted-foreground">{STATE[agent.status].label}</span>
              </span>
            }
            description={<span className="font-mono">{agent.command}</span>}
            control={<span className="text-xs text-muted-foreground tabular-nums">{agent.version ? `v${agent.version}` : "—"}</span>}
          />
        ))}
      </Group>

      <Group title="In the background">
        <SwitchRow
          title="Check for agent updates"
          description="Looks up newer versions once a day and marks them on the Agents page. Nothing installs by itself."
          checked={checkUpdates}
          onChange={setCheckUpdates}
        />
        <SwitchRow
          title="Read model lists at startup"
          description="Asks each enabled agent for its models over ACP when the daemon starts, so new ones show up."
          checked={probe}
          onChange={setProbe}
        />
      </Group>
    </>
  )
}
