import { interpolate, type ForwardStatus, type ProjectRuntime, type Service, type ServiceStatus } from "@/data/services"

export const STATUS_TEXT: Record<ServiceStatus | ForwardStatus, string> = {
  running: "Running",
  active: "Active",
  starting: "Starting",
  restarting: "Reconnecting",
  failed: "Failed",
  stopped: "Stopped",
}

/** Allocated ports by service name, the map `${name.port}` resolves against. */
export function portMap(runtime: ProjectRuntime): Record<string, number> {
  return Object.fromEntries(runtime.services.filter((svc) => svc.port > 0).map((svc) => [svc.name, svc.port]))
}

/** One short phrase: what it is doing, for how long, or why it stopped. */
export function serviceSummary(svc: Service): string {
  if (svc.status === "running") return svc.uptime ? `Running · ${svc.uptime}` : "Running"
  if (svc.status === "starting") return svc.logs.at(-1)?.text.startsWith("[service waiting") ? "Waiting for dependencies" : "Starting"
  if (svc.status === "failed") {
    if (svc.reason?.startsWith("did not start")) return "Held: a dependency failed"
    if (svc.reason?.includes("conflicts with project")) return "Refused: port range conflict"
    return svc.exit !== undefined ? `Crashed · exit ${svc.exit}` : "Failed"
  }
  return "Stopped"
}

/** The daemon's reason as a sentence; its project-level refusals already name what they are about. */
export function failureSentence(svc: Service): string {
  if (!svc.reason) return `${svc.name} failed.`
  if (/^(project |Port |No available)/.test(svc.reason)) return `${svc.reason.charAt(0).toUpperCase()}${svc.reason.slice(1)}.`
  return `${svc.name} ${svc.reason}.`
}

/** How readiness is decided: a healthcheck wins over the port, the port over a bare ready pattern (`Probe::select`). */
export function readinessText(svc: Service, runtime: ProjectRuntime): string {
  const timeout = `gives up after ${svc.readyTimeout} and marks it failed, but leaves it running`
  if (svc.healthcheck) {
    return `Waiting until GET ${interpolate(svc.healthcheck.url, portMap(runtime))} answers, every ${svc.healthcheck.interval}; ${timeout}.`
  }
  if (svc.port) {
    const line = svc.readyPattern ? `a line containing “${svc.readyPattern}”` : "a line like “ready in” or “Local:”"
    return `Waiting until port ${svc.port} accepts a connection or the log prints ${line}; ${timeout}.`
  }
  if (svc.readyPattern) return `Waiting for a log line containing “${svc.readyPattern}”; ${timeout}.`
  return "Ready as soon as the process starts: it has no port, healthcheck, or ready pattern."
}

/** The same rule, stated as configuration rather than progress. */
export function readyRule(svc: Service, runtime: ProjectRuntime): string {
  if (svc.healthcheck) {
    return `GET ${interpolate(svc.healthcheck.url, portMap(runtime))} returns 2xx or 3xx, checked every ${svc.healthcheck.interval}. Log lines do not count.`
  }
  if (svc.port) {
    const line = svc.readyPattern ? `“${svc.readyPattern}”` : "“ready in”, “listening on”, or “Local:”"
    return `Port ${svc.port} accepts a connection, or the log prints a line containing ${line}.`
  }
  if (svc.readyPattern) return `The log prints a line containing “${svc.readyPattern}”.`
  return "As soon as the process starts."
}

export function portText(svc: Service, runtime: ProjectRuntime): string {
  if (!svc.declaredPort) return "None. It declares no port, so it gets none and no $PORT."
  if (svc.pinned) return `${svc.port}, pinned. The team's range is explicit, so if ${svc.port} is taken the service fails instead of moving.`
  const where = `first free port in ${runtime.range.start}–${runtime.range.end}`
  return svc.port ? `${svc.port}, the ${where}. It asked for ${svc.declaredPort}.` : `The ${where}, handed out when it starts.`
}
