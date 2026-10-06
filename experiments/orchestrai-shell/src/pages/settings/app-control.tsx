import { useState } from "react"

import { Button } from "@/components/ui/button"
import { MCP_TOOLS } from "@/data/app-settings"
import { Advanced, CodeBlock, ConfirmDialog, Group, Row, SwitchRow } from "@/pages/settings/primitives"
import { useAppSetting } from "@/pages/settings/settings-store"
import { useFlash } from "@/pages/settings/use-flash"

const ENDPOINT = "http://127.0.0.1:61815/mcp"
const ADD_TO_CLAUDE = "claude mcp add --scope user orchestrai -- wf __mcp-orchestrator"

function token(seed: number) {
  const hex = (seed * 2654435761).toString(16).padStart(8, "0").slice(-8)
  return `wf_mcp_7c41e09b52d3${hex}`
}

/** App actions as MCP tools on loopback, so an agent in a terminal can do what a person can, with the same confirmations. */
export function AppControl() {
  const [enabled, setEnabled] = useAppSetting("control.enabled", true)
  const [generation, setGeneration] = useAppSetting("control.generation", 1)
  const [shown, setShown] = useState(false)
  const [rotating, setRotating] = useState(false)
  const [copied, flash] = useFlash()
  const secret = token(generation)
  const count = MCP_TOOLS.reduce((sum, group) => sum + group.tools.length, 0)

  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text)
    flash(text)
  }

  return (
    <Group
      title="App control"
      note="Binds to 127.0.0.1 only and needs the token. Dangerous actions still ask a person; an agent cannot skip that."
    >
      <SwitchRow
        title="Loopback MCP"
        description="The command palette's actions, plus services, backlog, memory, and the browser, as tools any agent can call."
        checked={enabled}
        onChange={setEnabled}
      />
      <Row title="Address" description="Clients started by OrchestrAI get it and the token automatically." control={<code className="font-mono text-xs">{ENDPOINT}</code>} />
      <Row
        title="Token"
        description="Kept in ~/.warpforge/daemon.json, readable by your user only."
        control={
          <>
            <code className="font-mono text-xs">{shown ? secret : `wf_mcp_${"•".repeat(12)}${secret.slice(-4)}`}</code>
            <Button variant="ghost" size="xs" className="text-xs" onClick={() => setShown(!shown)}>
              {shown ? "Hide" : "Show"}
            </Button>
            <Button variant="ghost" size="xs" className="text-xs" onClick={() => copy(secret)}>
              {copied === secret ? "Copied" : "Copy"}
            </Button>
            <Button variant="ghost" size="xs" className="text-xs" onClick={() => setRotating(true)}>
              Rotate…
            </Button>
          </>
        }
      />
      <Row title="Connected now" description="Claude Code in orc-03 · Codex in orc-05 · Goose in orc-18" control={<span className="text-xs text-muted-foreground">3 clients</span>} />
      <Row
        title="Use it from any agent"
        description="Register the bridge once for Claude Code everywhere. Started inside a project folder, it scopes itself to that project."
        control={
          <Button variant="ghost" size="xs" className="text-xs" onClick={() => copy(ADD_TO_CLAUDE)}>
            {copied === ADD_TO_CLAUDE ? "Copied" : "Copy command"}
          </Button>
        }
      >
        <CodeBlock>{ADD_TO_CLAUDE}</CodeBlock>
      </Row>
      <Row
        title="Control socket"
        description="The same typed actions for scripts and the CLI: windows, tabs, panes, and sessions."
        control={<code className="font-mono text-xs">~/.warpforge/control.sock</code>}
      />
      <div className="py-[calc(var(--row-py)+0.25rem)]">
        <Advanced label={`All ${count} tools`}>
          <dl className="flex flex-col gap-3">
            {MCP_TOOLS.map((group) => (
              <div key={group.group}>
                <dt className="text-xs font-medium">
                  {group.group}
                  {group.note && <span className="font-normal text-muted-foreground"> · {group.note}</span>}
                </dt>
                <dd className="font-mono text-xs text-muted-foreground">{group.tools.join(", ")}</dd>
              </div>
            ))}
          </dl>
        </Advanced>
      </div>
      <ConfirmDialog
        open={rotating}
        onOpenChange={setRotating}
        title="Rotate the token?"
        description="Every connected client is disconnected. Sessions OrchestrAI starts pick up the new token; anything you configured by hand needs it pasted again."
        confirmLabel="Rotate token"
        onConfirm={() => setGeneration(generation + 1)}
      />
    </Group>
  )
}
