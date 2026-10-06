import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { BROWSER_PROFILES } from "@/data/app-settings"
import { PROJECT_LINKS, PROJECT_MCP, type McpServer } from "@/data/settings"
import type { Project } from "@/lib/projects"
import { useRuntime } from "@/pages/services/runtime-store"
import { openSettingsSection } from "@/pages/settings/nav-store"
import { Choice, Group, Row, SectionHeader, SelectMenu, SwitchRow } from "@/pages/settings/primitives"
import { useProjectSetting } from "@/pages/settings/settings-store"

function AddServer({ onAdd, onCancel }: { onAdd: (server: McpServer) => void; onCancel: () => void }) {
  const [name, setName] = useState("")
  const [target, setTarget] = useState("")
  const [transport, setTransport] = useState<"stdio" | "http">("stdio")
  return (
    <form
      className="flex flex-col gap-2 py-[calc(var(--row-py)+0.25rem)]"
      onSubmit={(event) => {
        event.preventDefault()
        onAdd({ name: name.trim(), target: target.trim(), transport, tools: 0, enabled: true })
      }}
    >
      <div className="flex items-center gap-2">
        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="sentry" aria-label="Server name" className="h-7 w-32 text-xs md:text-xs" />
        <Choice label="Transport" value={transport} onChange={setTransport} options={[{ value: "stdio", label: "Command" }, { value: "http", label: "URL" }]} />
        <Input
          value={target}
          onChange={(event) => setTarget(event.target.value)}
          placeholder={transport === "stdio" ? "npx -y @sentry/mcp-server" : "https://mcp.sentry.dev/mcp"}
          aria-label="Command or URL"
          className="h-7 min-w-0 flex-1 font-mono text-xs md:text-xs"
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" className="text-xs" disabled={!name.trim() || !target.trim()}>
          Add server
        </Button>
        <Button type="button" variant="ghost" size="sm" className="text-xs" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

export function IntegrationsSection({ project }: { project: Project }) {
  const links = PROJECT_LINKS[project.id]
  const runtime = useRuntime(project.id)
  const [servers, setServers] = useProjectSetting(project.id, "mcp.servers", PROJECT_MCP[project.id])
  const [tracker, setTracker] = useProjectSetting(project.id, "tracker", links.tracker)
  const [profile, setProfile] = useProjectSetting(project.id, "browser.profile", "Default")
  const [adding, setAdding] = useState(false)
  const ports = [...runtime.services.map((svc) => svc.port), ...runtime.forwards.map((pf) => pf.localPort)].filter((port) => port > 0)
  const trackers = [links.tracker, `GitHub Issues · ${project.repo}`, "None"].filter((entry, index, all) => all.indexOf(entry) === index)

  return (
    <>
      <SectionHeader title="Integrations" scope="How this project reaches its code host, tracker, tools, and browser. Accounts and tokens are app-wide, under Connections.">
        <Button variant="outline" size="sm" className="text-xs" onClick={() => openSettingsSection(project.id, "connections")}>
          Connections
        </Button>
      </SectionHeader>

      <Group title="Code host">
        <Row title="Repository" description="Pull requests, checks, and issues come from here." control={<code className="font-mono text-xs">github.com/{project.repo}</code>} />
        {links.remotes.map((remote) => (
          <Row key={remote.name} title={<span className="font-mono">{remote.name}</span>} description={remote.note} control={<code className="font-mono text-xs">{remote.url}</code>} />
        ))}
        <Row title="Pull requests target" description="The base branch for every task's pull request." control={<code className="font-mono text-xs">{links.prBase}</code>} />
      </Group>

      <Group title="Issue tracker">
        <Row
          title="Imports issues from"
          description="The backlog mirrors them, and a task started from one links back to it."
          control={<SelectMenu label="Issue tracker" value={tracker} onChange={setTracker} options={trackers.map((entry) => ({ value: entry, label: entry }))} />}
        />
      </Group>

      <Group title="MCP servers for agents" note="Handed to every agent in this project when its session starts, as ACP mcpServers. Tool calls still go through the permission profile.">
        <Row
          title="orchestrai"
          description="Built in: services, backlog, Factory, memory, automations, the browser, and app actions."
          control={<span className="text-xs text-muted-foreground">always on</span>}
        />
        {servers.map((server) => (
          <SwitchRow
            key={server.name}
            title={
              <span className="flex items-baseline gap-2">
                {server.name}
                <span className="text-xs font-normal text-muted-foreground">{server.tools ? `${server.tools} tools` : "not started yet"}</span>
              </span>
            }
            description={<span className="font-mono">{server.target}</span>}
            checked={server.enabled}
            onChange={(enabled) => setServers(servers.map((entry) => (entry.name === server.name ? { ...entry, enabled } : entry)))}
          />
        ))}
        {adding ? (
          <AddServer
            onCancel={() => setAdding(false)}
            onAdd={(server) => {
              setServers([...servers, server])
              setAdding(false)
            }}
          />
        ) : (
          <div className="py-[calc(var(--row-py)+0.25rem)]">
            <Button variant="outline" size="sm" className="text-xs" onClick={() => setAdding(true)}>
              Add server
            </Button>
          </div>
        )}
      </Group>

      <Group title="Browser">
        <Row
          title="Profile"
          description="The signed-in profile this project's tabs and agents share. Imported from Chrome under Connections."
          control={<SelectMenu label="Browser profile" value={profile} onChange={setProfile} options={BROWSER_PROFILES.map((entry) => ({ value: entry.name, label: entry.name }))} />}
        />
        <Row
          title="Agents act without asking on"
          description="This project's own service ports, on localhost, 127.0.0.1, and [::1]. Any other site asks first; Allow always lasts for the rest of that task."
        >
          <div className="flex flex-wrap gap-1">
            {ports.length ? (
              ports.map((port) => (
                <span key={port} className="rounded-sm border px-2 font-mono text-xs leading-6">
                  localhost:{port}
                </span>
              ))
            ) : (
              <span className="text-xs text-muted-foreground">No service has a port yet, so every site asks.</span>
            )}
          </div>
        </Row>
      </Group>
    </>
  )
}
