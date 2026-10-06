import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CONNECTIONS } from "@/data/app-settings"
import { AppControl } from "@/pages/settings/app-control"
import { BrowserProfiles } from "@/pages/settings/browser-profiles"
import { ConfirmDialog, Group, Row, SectionHeader } from "@/pages/settings/primitives"
import { useAppSetting } from "@/pages/settings/settings-store"

const CONNECTED = Object.fromEntries(CONNECTIONS.map((entry) => [entry.id, Boolean(entry.account)]))

const TOKEN_HINT: Record<string, string> = {
  github: "ghp_… or github_pat_… with repo and read:project, or run gh auth login",
  gitlab: "glpat-… with api and read_repository",
  linear: "lin_api_…",
}

export function ConnectionsSection() {
  const [connected, setConnected] = useAppSetting("connections.connected", CONNECTED)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [disconnecting, setDisconnecting] = useState<string | null>(null)

  return (
    <>
      <SectionHeader title="Connections" scope="Accounts and tokens every project uses. Tokens go to the macOS keychain, never into a file or a project." />

      <Group title="Accounts">
        {CONNECTIONS.map((entry) => {
          const on = connected[entry.id]
          return (
            <Row
              key={entry.id}
              title={
                <span className="flex items-baseline gap-2">
                  {entry.name}
                  {on && <span className="text-xs font-normal text-muted-foreground">{entry.account ?? "connected"}</span>}
                </span>
              }
              description={on ? `${entry.detail} ${entry.via ?? ""}.` : entry.detail}
              control={
                on ? (
                  <Button variant="ghost" size="sm" className="text-xs" onClick={() => setDisconnecting(entry.id)}>
                    Disconnect…
                  </Button>
                ) : undefined
              }
            >
              {!on && (
                <form
                  className="flex items-center gap-2"
                  onSubmit={(event) => {
                    event.preventDefault()
                    setConnected({ ...connected, [entry.id]: true })
                    setDrafts({ ...drafts, [entry.id]: "" })
                  }}
                >
                  <Input
                    type="password"
                    value={drafts[entry.id] ?? ""}
                    onChange={(event) => setDrafts({ ...drafts, [entry.id]: event.target.value })}
                    placeholder={TOKEN_HINT[entry.id]}
                    aria-label={`${entry.name} token`}
                    className="h-7 min-w-0 flex-1 font-mono text-xs md:text-xs"
                  />
                  <Button type="submit" size="sm" className="text-xs" disabled={!drafts[entry.id]?.trim()}>
                    Connect
                  </Button>
                </form>
              )}
            </Row>
          )
        })}
      </Group>

      <BrowserProfiles />
      <AppControl />

      <ConfirmDialog
        open={disconnecting !== null}
        onOpenChange={(open) => !open && setDisconnecting(null)}
        title={`Disconnect ${CONNECTIONS.find((entry) => entry.id === disconnecting)?.name}?`}
        description="The token is removed from the keychain. Pull requests, checks, and issue sync stop in every project until you connect again."
        confirmLabel="Disconnect"
        onConfirm={() => disconnecting && setConnected({ ...connected, [disconnecting]: false })}
      />
    </>
  )
}
