import { useEffect } from "react"

import { PageToolbar } from "@/components/common/page-toolbar"
import { Button } from "@/components/ui/button"
import { useAppActions, useAppSession } from "@/lib/app-instance"
import { selectSelection } from "@/lib/window-store"
import { ForwardDetail } from "@/pages/services/forward-detail"
import { LocalConfigError, RangeConflict } from "@/pages/services/port-range"
import { RuntimeList, type RuntimeKey } from "@/pages/services/runtime-list"
import { useRuntime, useRuntimeStore } from "@/pages/services/runtime-store"
import { ServiceDetail } from "@/pages/services/service-detail"
import { openSettingsSection } from "@/pages/settings/nav-store"

/**
 * The project's dev services and port-forwards from its workspace file, each
 * on a port from the project's own 100-port block. The list is the status at a
 * glance; the selected one gets its logs and the reasons behind its state.
 */
export function ServicesPage() {
  const project = useAppSession((session) => session.project)
  const runtime = useRuntime(project)
  const { setPage, select: selectInWindow } = useAppActions()
  const wanted = useAppSession((session) => selectSelection(session, "service"))

  useEffect(() => useRuntimeStore.getState().settle(project), [project])

  const keys: RuntimeKey[] = [
    ...runtime.services.map((svc) => ({ kind: "service" as const, name: svc.name })),
    ...runtime.forwards.map((pf) => ({ kind: "forward" as const, name: pf.name })),
  ]
  const selected = keys.find((key) => `${key.kind}:${key.name}` === wanted) ?? keys[0]
  const select = (key: RuntimeKey) => selectInWindow("service", `${key.kind}:${key.name}`)
  const show = (name: string) => {
    const key = keys.find((entry) => entry.name === name)
    if (key) select(key)
  }
  const service = selected?.kind === "service" ? runtime.services.find((svc) => svc.name === selected.name) : undefined
  const forward = selected?.kind === "forward" ? runtime.forwards.find((pf) => pf.name === selected.name) : undefined

  const running = runtime.services.filter((svc) => svc.status === "running").length
  const failed = runtime.services.filter((svc) => svc.status === "failed").length
  const meta = [`${running} of ${runtime.services.length} running`, failed ? `${failed} failed` : "", `ports ${runtime.range.start}–${runtime.range.end}`]
    .filter(Boolean)
    .join(" · ")

  const openWorkspaceSettings = () => {
    openSettingsSection(project, "workspace")
    setPage("settings")
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="p-4 pb-3">
        <PageToolbar title="Services" meta={meta}>
          <Button variant="outline" size="sm" className="text-xs" onClick={openWorkspaceSettings}>
            Workspace settings
          </Button>
        </PageToolbar>
      </div>
      <RangeConflict project={project} runtime={runtime} />
      <LocalConfigError runtime={runtime} />

      {keys.length === 0 ? (
        <div className="dot-grid flex flex-1 flex-col items-center justify-center gap-3 border-t text-sm text-muted-foreground">
          <p>No services or port-forwards yet.</p>
          <Button variant="outline" size="sm" className="text-xs" onClick={openWorkspaceSettings}>
            Declare them in {runtime.configFile}
          </Button>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(15rem,19rem)_minmax(0,1fr)] border-t">
          <RuntimeList project={project} runtime={runtime} selected={selected} onSelect={select} />
          <section aria-label={selected?.name} className="min-h-0 min-w-0 border-l">
            {service && <ServiceDetail key={`${project}/${service.name}`} project={project} runtime={runtime} svc={service} onShow={show} />}
            {forward && <ForwardDetail key={`${project}/${forward.name}`} project={project} runtime={runtime} forward={forward} onShow={show} />}
          </section>
        </div>
      )}
    </div>
  )
}
