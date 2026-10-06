import { useState } from "react"
import { LoaderCircleIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { LANGUAGE_SERVERS, type LanguageServer } from "@/data/app-settings"
import { Group, Row, SectionHeader, SwitchRow } from "@/pages/settings/primitives"
import { useAppSetting } from "@/pages/settings/settings-store"

function ServerRow({ server, disabled }: { server: LanguageServer; disabled: boolean }) {
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const status = done ? "current" : server.status
  const version = done ? (server.latest ?? "installed") : server.version
  const description =
    status === "missing"
      ? `Not found. Installs with ${server.install}.`
      : status === "behind"
        ? `v${server.version}, v${server.latest} is out.`
        : version && /^\d/.test(version)
          ? `v${version}`
          : (version ?? "Installed")
  return (
    <Row
      title={server.language}
      description={description}
      control={
        status !== "current" && (
          <Button
            size="sm" className="text-xs"
            variant={status === "behind" ? "default" : "secondary"}
            disabled={busy || disabled}
            onClick={() => {
              setBusy(true)
              setTimeout(() => {
                setBusy(false)
                setDone(true)
              }, 1500)
            }}
          >
            {busy && <LoaderCircleIcon className="animate-spin" />}
            {busy ? "Working…" : status === "behind" ? "Update" : "Install"}
          </Button>
        )
      }
    />
  )
}

export function EditorSection() {
  const [follow, setFollow] = useAppSetting("editor.follow", true)
  const [rendered, setRendered] = useAppSetting("editor.rendered", true)
  const [lsp, setLsp] = useAppSetting("editor.lsp", true)
  const [checking, setChecking] = useState(false)

  return (
    <>
      <SectionHeader title="Editor" scope="The markdown editor for docs and plans, and the code view for the occasional look. Every project." />

      <Group title="Markdown">
        <SwitchRow title="Open pages rendered" description="Docs, plans, and transcripts open as a page, with the editor one toggle away." checked={rendered} onChange={setRendered} />
        <SwitchRow
          title="Preview follows the cursor"
          description="The rendered page keeps the block you are editing in view, beside the editor."
          checked={follow}
          onChange={setFollow}
        />
      </Group>

      <Group
        title="Language servers"
        note="Started when a code file opens, one per project and language, and stopped with the last editor. Without one, files still get syntax colors."
      >
        <SwitchRow title="Language features" description="Hover, go to definition, and diagnostics in the code view." checked={lsp} onChange={setLsp} />
        {LANGUAGE_SERVERS.map((server) => (
          <ServerRow key={server.id} server={server} disabled={!lsp} />
        ))}
        <div className="py-[calc(var(--row-py)+0.25rem)]">
          <Button
            variant="outline"
            size="sm" className="text-xs"
            disabled={checking}
            onClick={() => {
              setChecking(true)
              setTimeout(() => setChecking(false), 1200)
            }}
          >
            {checking ? "Checking versions…" : "Check versions"}
          </Button>
        </div>
      </Group>
    </>
  )
}
