import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { BROWSER_PROFILES, type BrowserProfile } from "@/data/app-settings"
import { Choice, ConfirmDialog, Group, Row } from "@/pages/settings/primitives"
import { useAppSetting } from "@/pages/settings/settings-store"

const CHROME_PROFILES = [
  { value: "Personal", label: "Personal" },
  { value: "Work", label: "Work" },
]

/** A one-time copy of Chrome's cookies into a named profile. Chrome has to be quit, and passwords never move. */
function ImportDialog({ open, onOpenChange, onImport }: { open: boolean; onOpenChange: (open: boolean) => void; onImport: (profile: BrowserProfile) => void }) {
  const [chromeRunning, setChromeRunning] = useState(true)
  const [source, setSource] = useState("Personal")
  const [name, setName] = useState("Personal")
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import from Chrome</DialogTitle>
          <DialogDescription>
            Copies the cookies of one Chrome profile, once. Later sign-ins in Chrome stay in Chrome, and sign-ins here stay here.
          </DialogDescription>
        </DialogHeader>
        <ol className="flex flex-col gap-3 text-xs">
          <li className="flex items-center gap-3">
            <span className="min-w-0 flex-1">
              <span className="block font-medium">1. Quit Chrome</span>
              <span className="text-muted-foreground">{chromeRunning ? "Chrome is running. Its cookie file is locked until it quits." : "Chrome is not running."}</span>
            </span>
            {chromeRunning && (
              <Button variant="outline" size="sm" className="text-xs" onClick={() => setChromeRunning(false)}>
                Quit Chrome
              </Button>
            )}
          </li>
          <li className="flex items-center gap-3">
            <span className="min-w-0 flex-1">
              <span className="block font-medium">2. Pick the Chrome profile</span>
              <span className="text-muted-foreground">macOS asks once to unlock “Chrome Safe Storage” in your keychain.</span>
            </span>
            <Choice
              label="Chrome profile"
              value={source}
              onChange={(next) => {
                setSource(next)
                setName(next)
              }}
              options={CHROME_PROFILES}
            />
          </li>
          <li className="flex items-center gap-3">
            <span className="block min-w-0 flex-1 font-medium">3. Name it here</span>
            <Input value={name} onChange={(event) => setName(event.target.value)} aria-label="Profile name" className="h-7 w-40 text-xs md:text-xs" />
          </li>
        </ol>
        <p className="text-xs text-muted-foreground">Passwords are not copied, and partitioned cookies are skipped. Works on macOS and Linux; Chrome on Windows cannot be read.</p>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            disabled={chromeRunning || !name.trim()}
            onClick={() => {
              onImport({ name: name.trim(), source: `Imported from Chrome (${source})`, sites: 168, cookies: 941, isDefault: false, updated: "Just now" })
              onOpenChange(false)
            }}
          >
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function BrowserProfiles() {
  const [profiles, setProfiles] = useAppSetting<readonly BrowserProfile[]>("browser.profiles", BROWSER_PROFILES)
  const [importing, setImporting] = useState(false)
  const [removing, setRemoving] = useState<BrowserProfile | null>(null)

  return (
    <Group
      title="Browser profiles"
      note="Hand-opened tabs and agents share the Default profile unless a task names another. Each project can pick its own under Integrations."
    >
      {profiles.map((profile) => (
        <Row
          key={profile.name}
          title={
            <span className="flex items-baseline gap-2">
              {profile.name}
              {profile.isDefault && <span className="text-xs font-normal text-muted-foreground">default</span>}
            </span>
          }
          description={`${profile.source} · ${profile.sites} sites, ${profile.cookies.toLocaleString("en-US")} cookies · ${profile.updated}`}
          control={
            <>
              {!profile.isDefault && (
                <Button variant="ghost" size="sm" className="text-xs" onClick={() => setProfiles(profiles.map((entry) => ({ ...entry, isDefault: entry.name === profile.name })))}>
                  Make default
                </Button>
              )}
              <Button variant="ghost" size="sm" className="text-xs" disabled={profile.isDefault} onClick={() => setRemoving(profile)}>
                Remove…
              </Button>
            </>
          }
        />
      ))}
      <div className="py-[calc(var(--row-py)+0.25rem)]">
        <Button variant="outline" size="sm" className="text-xs" onClick={() => setImporting(true)}>
          Import from Chrome…
        </Button>
      </div>
      <ImportDialog open={importing} onOpenChange={setImporting} onImport={(profile) => setProfiles([...profiles, profile])} />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Remove the ${removing?.name} profile?`}
        description="Its cookies and site data are deleted, so the sites in it sign you out here. Chrome is not touched."
        confirmLabel="Remove profile"
        onConfirm={() => removing && setProfiles(profiles.filter((entry) => entry.name !== removing.name))}
      />
    </Group>
  )
}
