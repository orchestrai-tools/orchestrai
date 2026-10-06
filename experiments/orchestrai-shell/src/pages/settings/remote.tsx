import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DEFAULT_RELAY, PAIRED_DEVICES, type PairedDevice } from "@/data/app-settings"
import { ConfirmDialog, Group, Row, SectionHeader, SwitchRow } from "@/pages/settings/primitives"
import { useAppSetting } from "@/pages/settings/settings-store"
import { useFlash } from "@/pages/settings/use-flash"

const CODE_LIFETIME = 300

function newCode() {
  return String(Math.floor(100000 + Math.random() * 900000))
}

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`

export function RemoteSection() {
  const [enabled, setEnabled] = useAppSetting("remote.enabled", true)
  const [relay, setRelay] = useAppSetting("remote.relay", DEFAULT_RELAY)
  const [devices, setDevices] = useAppSetting<readonly PairedDevice[]>("remote.devices", PAIRED_DEVICES)
  const [approvals, setApprovals] = useAppSetting("remote.approvals", true)
  const [draft, setDraft] = useState(relay)
  const [pairing, setPairing] = useState<{ code: string; left: number } | null>(null)
  const [revoking, setRevoking] = useState<PairedDevice | null>(null)
  const [copied, flash] = useFlash()

  const code = pairing?.code
  useEffect(() => {
    if (!code) return
    const timer = setInterval(() => setPairing((current) => (current && current.left > 1 ? { ...current, left: current.left - 1 } : null)), 1000)
    return () => clearInterval(timer)
  }, [code])

  return (
    <>
      <SectionHeader title="Remote" scope="Drive this Mac from your phone, on any network. Files, tools, and agents stay here, so OrchestrAI must stay open." />

      <Group>
        <SwitchRow title="Allow phone access" description="Keeps one outbound connection to the relay while OrchestrAI runs." checked={enabled} onChange={setEnabled} />
      </Group>

      <Group title="Pair a phone" note="A code works once, for 5 minutes. Five wrong tries lock pairing for 60 seconds.">
        {pairing ? (
          <div className="flex items-center gap-4 py-[calc(var(--row-py)+0.25rem)]">
            <span className="font-mono text-base font-semibold tracking-[0.3em] tabular-nums" aria-label={`Pairing code ${pairing.code.split("").join(" ")}`}>
              {pairing.code.slice(0, 3)} {pairing.code.slice(3)}
            </span>
            <span className="min-w-0 flex-1 text-xs text-muted-foreground">
              Enter it in the OrchestrAI remote app on your phone. Expires in {clock(pairing.left)}.
            </span>
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => setPairing(null)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Row
            title="New pairing code"
            description="One code per phone. The two agree on a key that no one else, the relay included, ever sees."
            control={
              <Button size="sm" className="text-xs" disabled={!enabled} onClick={() => setPairing({ code: newCode(), left: CODE_LIFETIME })}>
                Pair a phone
              </Button>
            }
          />
        )}
      </Group>

      <Group title="Paired devices">
        {devices.length === 0 && <p className="py-[calc(var(--row-py)+0.25rem)] text-xs text-muted-foreground">No phone is paired.</p>}
        {devices.map((device) => (
          <Row
            key={device.name}
            title={device.name}
            description={`${device.client} · paired ${device.paired} · seen ${device.lastSeen}`}
            control={
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => setRevoking(device)}>
                Revoke…
              </Button>
            }
          />
        ))}
      </Group>

      <Group
        title="Relay"
        note="Pairing uses ECDH; every message after it is AES-256-GCM. The relay only forwards ciphertext, so even one you do not run never reads a word."
      >
        <Row title="Relay address" description="Both sides connect out to it, so nothing on your network opens a port.">
          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              setRelay(draft.trim() || DEFAULT_RELAY)
            }}
          >
            <Input value={draft} onChange={(event) => setDraft(event.target.value)} aria-label="Relay address" className="h-7 font-mono text-xs md:text-xs" />
            <Button type="submit" variant="outline" size="sm" className="text-xs" disabled={draft.trim() === relay}>
              Use
            </Button>
            {relay !== DEFAULT_RELAY && (
              <Button
                type="button"
                variant="ghost"
                size="sm" className="text-xs"
                onClick={() => {
                  setRelay(DEFAULT_RELAY)
                  setDraft(DEFAULT_RELAY)
                }}
              >
                Default
              </Button>
            )}
          </form>
        </Row>
        <Row
          title="Run your own relay"
          description="It ships with the app. Point the address above at ws://your-host:8787/ws once it runs."
          control={
            <>
              <code className="font-mono text-xs">npm run remote</code>
              <Button
                variant="ghost"
                size="xs"
                className="text-xs"
                onClick={() => {
                  void navigator.clipboard?.writeText("npm run remote")
                  flash("Copied")
                }}
              >
                {copied ?? "Copy"}
              </Button>
            </>
          }
        />
      </Group>

      <Group title="From the phone">
        <SwitchRow
          title="Approve from the phone"
          description="Requests follow each task's permission profile, and the denylist still refuses on its own."
          checked={approvals}
          onChange={setApprovals}
        />
        <Row title="What a phone can do" description="See the session board, read transcripts, send a prompt, and approve or deny a request. It cannot change settings." />
      </Group>

      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => !open && setRevoking(null)}
        title={`Revoke ${revoking?.name}?`}
        description="Its key is deleted here, so it is disconnected at once and has to pair again with a new code."
        confirmLabel="Revoke"
        onConfirm={() => revoking && setDevices(devices.filter((device) => device.name !== revoking.name))}
      />
    </>
  )
}
