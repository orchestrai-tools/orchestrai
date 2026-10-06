import type { ReactNode } from "react"

import type { ProjectId } from "@/lib/projects"
import { useRuntime } from "@/pages/services/runtime-store"

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-2 py-(--row-py) text-xs">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate">{children}</dd>
    </div>
  )
}

/**
 * The selected service or port-forward on the Services page, as the inspector
 * shows it. With nothing picked yet it follows the page and shows the first one.
 */
export function RuntimeDetails({ project, selection }: { project: ProjectId; selection: string }) {
  const runtime = useRuntime(project)
  const [kind, name] = selection === "first" ? ["service", runtime.services[0]?.name] : selection.split(":")
  const service = kind === "service" ? runtime.services.find((entry) => entry.name === name) : undefined
  const forward = kind === "forward" ? runtime.forwards.find((entry) => entry.name === name) : undefined

  if (service) {
    return (
      <dl className="px-4 py-2">
        <Row label="Service">{service.name}</Row>
        <Row label="Status">
          {service.status}
          {service.exit !== undefined && ` · exit ${service.exit}`}
        </Row>
        {service.uptime && <Row label="Up since">{service.uptime}</Row>}
        <Row label="Command"><span className="font-mono">{service.command}</span></Row>
        <Row label="Port">{service.port ? `${service.port}${service.pinned ? " · pinned" : ""}` : "None"}</Row>
        {service.portWarning && <Row label="Listening on">{service.portWarning.listening.join(", ")}</Row>}
        <Row label="Ready when">{service.healthcheck ? `healthcheck ${service.healthcheck.url}` : service.readyPattern ? `log matches “${service.readyPattern}”` : "port answers"}</Row>
        <Row label="Ready timeout">{service.readyTimeout}</Row>
        {service.dependsOn.length > 0 && <Row label="Depends on">{service.dependsOn.join(", ")}</Row>}
        <Row label="Environment">{service.env.length} variables</Row>
        {service.reason && <Row label="Reason">{service.reason}</Row>}
      </dl>
    )
  }
  if (forward) {
    return (
      <dl className="px-4 py-2">
        <Row label="Port-forward">{forward.name}</Row>
        <Row label="Status">{forward.status}</Row>
        <Row label="Pod">{forward.namespace}/{forward.pod}</Row>
        <Row label="Ports">:{forward.localPort} → :{forward.remotePort}</Row>
        {forward.reason && <Row label="Reason">{forward.reason}</Row>}
      </dl>
    )
  }
  return <p className="p-4 text-xs text-muted-foreground">Pick a service to see how it runs.</p>
}
