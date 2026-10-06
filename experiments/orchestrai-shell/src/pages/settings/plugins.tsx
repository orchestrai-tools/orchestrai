import { useId, useState } from "react"
import { XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { PLUGINS, type Plugin } from "@/data/app-settings"
import { ConfirmDialog, Group, SectionHeader } from "@/pages/settings/primitives"
import { useAppSetting } from "@/pages/settings/settings-store"

const ENABLED = Object.fromEntries(PLUGINS.map((plugin) => [plugin.id, plugin.enabled]))
const NONE: string[] = []

const CANDIDATE: Plugin = {
  id: "gha",
  name: "GitHub Actions logs",
  file: "gha-logs.wasm",
  version: "0.3.0",
  author: "orchestrai",
  tools: ["gha_failed_steps", "gha_job_log"],
  grants: [
    { kind: "Network", target: "api.github.com" },
    { kind: "Secret", target: "GITHUB_TOKEN" },
  ],
  enabled: true,
}

/** Grants are asked for up front and given one by one; a plugin gets nothing it was not granted. */
function AddPlugin({ open, onOpenChange, onAdd }: { open: boolean; onOpenChange: (open: boolean) => void; onAdd: (plugin: Plugin) => void }) {
  const id = useId()
  const [granted, setGranted] = useState(CANDIDATE.grants.map((grant) => grant.target))
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add {CANDIDATE.file}?</DialogTitle>
          <DialogDescription>
            {CANDIDATE.name} {CANDIDATE.version} by {CANDIDATE.author} adds {CANDIDATE.tools.length} tools: {CANDIDATE.tools.join(", ")}.
          </DialogDescription>
        </DialogHeader>
        <fieldset className="flex flex-col gap-2 text-xs">
          <legend className="pb-1 font-medium">It asks for</legend>
          {CANDIDATE.grants.map((grant) => (
            <label key={grant.target} htmlFor={`${id}-${grant.target}`} className="flex items-center gap-2">
              <Checkbox
                id={`${id}-${grant.target}`}
                checked={granted.includes(grant.target)}
                onCheckedChange={(checked) => setGranted(checked ? [...granted, grant.target] : granted.filter((entry) => entry !== grant.target))}
              />
              <span className="font-medium">{grant.kind}</span>
              <span className="font-mono text-muted-foreground">{grant.target}</span>
            </label>
          ))}
          <p className="text-muted-foreground">Leave one out and the host refuses that call; the rest of the plugin still works.</p>
        </fieldset>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            onClick={() => {
              onAdd({ ...CANDIDATE, grants: CANDIDATE.grants.filter((grant) => granted.includes(grant.target)) })
              onOpenChange(false)
            }}
          >
            Add plugin
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function PluginsSection() {
  const [enabled, setEnabled] = useAppSetting("plugins.enabled", ENABLED)
  const [removed, setRemoved] = useAppSetting("plugins.removed", NONE)
  const [revoked, setRevoked] = useAppSetting("plugins.revoked", NONE)
  const [added, setAdded] = useAppSetting<Plugin[]>("plugins.added", [])
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<Plugin | null>(null)
  const plugins = [...PLUGINS, ...added].filter((plugin) => !removed.includes(plugin.id))

  return (
    <>
      <SectionHeader title="Plugins" scope="WebAssembly modules that add tools agents can call, for every project. Stored in ~/.warpforge/plugins.">
        <Button variant="outline" size="sm" className="text-xs" onClick={() => setAdding(true)}>
          Add plugin…
        </Button>
      </SectionHeader>

      <Group note="Each plugin runs in a sandbox and reaches files, the network, or a secret only through what is granted here. Its tool calls still pass the task's permission profile.">
        {plugins.map((plugin) => (
          <div key={plugin.id} className="flex items-start gap-3 py-[calc(var(--row-py)+0.25rem)]">
            <div className="min-w-0 flex-1">
              <p className="flex items-baseline gap-2">
                <span className="text-sm font-medium">{plugin.name}</span>
                <span className="text-xs text-muted-foreground">
                  {plugin.version} · {plugin.author} · <span className="font-mono">{plugin.file}</span>
                </span>
              </p>
              <p className="font-mono text-xs text-muted-foreground">{plugin.tools.join(", ")}</p>
              <div className="flex flex-wrap gap-1 pt-1.5">
                {plugin.grants.map((grant) => {
                  const key = `${plugin.id}:${grant.target}`
                  const off = revoked.includes(key)
                  return (
                    <span key={key} className="inline-flex h-6 items-center gap-1 rounded-sm border pl-2 text-xs">
                      <span className={off ? "text-muted-foreground line-through" : undefined}>
                        {grant.kind} <span className="font-mono">{grant.target}</span>
                      </span>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="size-5"
                        aria-label={off ? `Grant ${grant.target} again` : `Revoke ${grant.target}`}
                        title={off ? "Grant again" : "Revoke"}
                        onClick={() => setRevoked(off ? revoked.filter((entry) => entry !== key) : [...revoked, key])}
                      >
                        <XIcon className={off ? "rotate-45" : undefined} />
                      </Button>
                    </span>
                  )
                })}
              </div>
              {plugin.refused && <p className="pt-1.5 text-xs text-amber-700 dark:text-amber-400">{plugin.refused}</p>}
            </div>
            <Switch
              checked={enabled[plugin.id] ?? true}
              onCheckedChange={(on) => setEnabled({ ...enabled, [plugin.id]: on })}
              aria-label={`Turn ${plugin.name} on or off`}
            />
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => setRemoving(plugin)}>
              Remove…
            </Button>
          </div>
        ))}
        {plugins.length === 0 && <p className="py-[calc(var(--row-py)+0.25rem)] text-xs text-muted-foreground">No plugins. Agents use their own tools and the built-in ones.</p>}
      </Group>

      <AddPlugin open={adding} onOpenChange={setAdding} onAdd={(plugin) => setAdded([...added.filter((entry) => entry.id !== plugin.id), plugin])} />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Remove ${removing?.name}?`}
        description={`Its tools (${removing?.tools.join(", ")}) disappear from every agent at its next tool list. The module file is deleted.`}
        confirmLabel="Remove plugin"
        onConfirm={() => removing && setRemoved([...removed, removing.id])}
      />
    </>
  )
}
