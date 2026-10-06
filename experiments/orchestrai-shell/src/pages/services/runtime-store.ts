import { create } from "zustand"

import { RUNTIMES, type LogLine, type PortForward, type ProjectRuntime, type Service } from "@/data/services"
import { findProject, type ProjectId } from "@/lib/projects"

const BOOT_MS = 1400
const FORWARD_MS = 900

type Range = [number, number]

interface RuntimeStore {
  runtimes: Record<ProjectId, ProjectRuntime>
  start: (project: ProjectId, name: string) => void
  stop: (project: ProjectId, name: string) => void
  restart: (project: ProjectId, name: string) => void
  startAll: (project: ProjectId) => void
  stopAll: (project: ProjectId) => void
  startForward: (project: ProjectId, name: string) => void
  stopForward: (project: ProjectId, name: string) => void
  setAutoStart: (project: ProjectId, on: boolean) => void
  /** A machine-local range; `null` clears it and the shared config applies again. */
  setLocalRange: (project: ProjectId, range: Range | null) => void
  /** Finishes runs that were already starting when the page first opened. */
  settle: (project: ProjectId) => void
}

function clock() {
  return new Date().toLocaleTimeString("en-GB", { hour12: false })
}

function append(logs: LogLine[], texts: string[]): LogLine[] {
  const next = (logs.at(-1)?.seq ?? -1) + 1
  const at = clock()
  return [...logs, ...texts.map((text, index) => ({ seq: next + index, at, text }))]
}

const original = (project: ProjectId, name: string) => RUNTIMES[project].services.find((entry) => entry.name === name)
const settled = new Set<ProjectId>()

/** What a dependency means for a service waiting on it (`DepState`). */
function dependencyState(runtime: ProjectRuntime, dep: string): "ready" | "pending" | string {
  const svc = runtime.services.find((entry) => entry.name === dep)
  if (svc) return svc.status === "running" ? "ready" : svc.status === "starting" ? "pending" : svc.status === "failed" ? "failed" : "is stopped"
  const forward = runtime.forwards.find((entry) => entry.name === dep)
  if (!forward) return "is not declared"
  if (forward.status === "active") return "ready"
  if (forward.status === "starting" || forward.status === "restarting") return "pending"
  return forward.status === "failed" ? `failed: ${forward.reason ?? "gave up"}` : "is stopped"
}

/** First free port in the range for an unpinned service; a pin keeps its declared port. */
function allocate(runtime: ProjectRuntime, svc: Service): number {
  if (!svc.declaredPort) return 0
  if (svc.pinned) return svc.declaredPort
  const { start, end } = runtime.range
  if (svc.port >= start && svc.port <= end) return svc.port
  const taken = new Set(runtime.services.filter((entry) => entry.name !== svc.name).map((entry) => entry.port))
  for (let port = start; port <= end; port++) if (!taken.has(port)) return port
  return 0
}

export const useRuntimeStore = create<RuntimeStore>()((set, get) => {
  const patchRuntime = (project: ProjectId, patch: (runtime: ProjectRuntime) => Partial<ProjectRuntime>) =>
    set(({ runtimes }) => ({ runtimes: { ...runtimes, [project]: { ...runtimes[project], ...patch(runtimes[project]) } } }))

  const patchService = (project: ProjectId, name: string, patch: (svc: Service) => Partial<Service>) =>
    patchRuntime(project, ({ services }) => ({
      services: services.map((svc) => (svc.name === name ? { ...svc, ...patch(svc) } : svc)),
    }))

  const patchForward = (project: ProjectId, name: string, patch: (forward: PortForward) => Partial<PortForward>) =>
    patchRuntime(project, ({ forwards }) => ({
      forwards: forwards.map((forward) => (forward.name === name ? { ...forward, ...patch(forward) } : forward)),
    }))

  const fail = (project: ProjectId, name: string, reason: string) =>
    patchService(project, name, (svc) => ({ status: "failed", reason, uptime: undefined, logs: append(svc.logs, [`[service failed] ${reason}`]) }))

  const boot = (project: ProjectId, name: string) => {
    patchService(project, name, (svc) => ({
      status: "starting",
      reason: undefined,
      exit: undefined,
      uptime: "just now",
      port: allocate(get().runtimes[project], svc),
      logs: append(svc.logs, ["[service starting]"]),
    }))
    setTimeout(() => {
      const svc = get().runtimes[project].services.find((entry) => entry.name === name)
      if (svc?.status !== "starting") return
      const crashed = svc.crashes !== undefined
      patchService(project, name, (current) => ({
        status: crashed ? "failed" : "running",
        exit: current.crashes,
        reason: crashed ? original(project, name)?.reason : undefined,
        uptime: crashed ? undefined : "just now",
        portWarning: crashed ? undefined : original(project, name)?.portWarning,
        logs: append(current.logs, [...current.boot, crashed ? `[service failed: exit code=${current.crashes}]` : "[service running]"]),
      }))
      if (!crashed) advance(project, name)
    }, BOOT_MS)
  }

  /** Dependents held on a dependency that just became ready start on their own (`advance_waiting`). */
  const advance = (project: ProjectId, dep: string) => {
    for (const svc of get().runtimes[project].services) {
      if (svc.dependsOn.includes(dep) && svc.status === "failed" && svc.reason?.startsWith("did not start: dependency")) {
        get().start(project, svc.name)
      }
    }
  }

  /** The dependency gate: an unavailable dependency fails the start even while others are still pending. */
  const attempt = (project: ProjectId, name: string) => {
    const runtime = get().runtimes[project]
    const svc = runtime.services.find((entry) => entry.name === name)
    if (!svc) return
    const { start, end, conflictWith } = runtime.range
    if (conflictWith) {
      return fail(
        project,
        name,
        `project "${findProject(project).name}" declares port range ${start}-${end} which conflicts with project "${conflictWith}"; move one of them to a different range before starting services`
      )
    }
    for (const dep of svc.dependsOn) {
      const state = dependencyState(runtime, dep)
      if (state !== "ready" && state !== "pending") return fail(project, name, `did not start: dependency ${dep} ${state}`)
    }
    const pending = svc.dependsOn.filter((dep) => dependencyState(runtime, dep) === "pending")
    if (!pending.length) return boot(project, name)
    if (svc.status !== "starting") {
      patchService(project, name, (current) => ({
        status: "starting",
        uptime: "just now",
        logs: append(current.logs, [`[service waiting for ${pending.join(", ")}]`]),
      }))
    }
    setTimeout(() => {
      const current = get().runtimes[project].services.find((entry) => entry.name === name)
      if (current?.status === "starting") attempt(project, name)
    }, BOOT_MS / 2)
  }

  return {
    runtimes: RUNTIMES,
    start: (project, name) => {
      const svc = get().runtimes[project].services.find((entry) => entry.name === name)
      if (!svc || svc.status === "running" || svc.status === "starting") return
      attempt(project, name)
    },
    stop: (project, name) =>
      patchService(project, name, (svc) => ({
        status: "stopped",
        uptime: undefined,
        reason: undefined,
        portWarning: undefined,
        logs: append(svc.logs, ["[service stopped]"]),
      })),
    restart: (project, name) => {
      get().stop(project, name)
      get().start(project, name)
    },
    startAll: (project) => {
      for (const svc of get().runtimes[project].services) {
        if (svc.status === "stopped" || svc.status === "failed") get().start(project, svc.name)
      }
    },
    stopAll: (project) => {
      for (const svc of get().runtimes[project].services) {
        if (svc.status !== "stopped") get().stop(project, svc.name)
      }
    },
    startForward: (project, name) => {
      const forward = get().runtimes[project].forwards.find((entry) => entry.name === name)
      if (!forward || forward.status === "active" || forward.status === "starting") return
      const { namespace, pod, localPort, remotePort } = forward
      patchForward(project, name, (current) => ({
        status: "starting",
        logs: append(current.logs, [`Starting port-forward ${namespace}:${pod} → ${localPort}:${remotePort} ...`]),
      }))
      setTimeout(() => {
        const reason = RUNTIMES[project].forwards.find((entry) => entry.name === name)?.reason
        patchForward(project, name, (current) => ({
          status: reason ? "failed" : "active",
          reason,
          logs: append(
            current.logs,
            reason
              ? [`No pod matching '${pod}' in namespace '${namespace}' (failure 15/15)`, `✗ Port-forward :${localPort} gave up after max retries: ${reason}`]
              : [`kubectl port-forward pod/${pod} ${localPort}:${remotePort}`, `✓ Forwarding :${localPort}`]
          ),
        }))
        if (!reason) advance(project, name)
      }, FORWARD_MS)
    },
    stopForward: (project, name) => patchForward(project, name, () => ({ status: "stopped" })),
    setAutoStart: (project, autoStart) => patchRuntime(project, () => ({ autoStart })),
    setLocalRange: (project, range) =>
      patchRuntime(project, () => ({
        range: range ? { start: range[0], end: range[1], source: "local-override" } : RUNTIMES[project].range,
      })),
    settle: (project) => {
      if (settled.has(project)) return
      settled.add(project)
      for (const svc of get().runtimes[project].services) {
        if (svc.status !== "starting") continue
        setTimeout(() => {
          patchService(project, svc.name, (current) =>
            current.status === "starting"
              ? { status: "running", uptime: "just now", logs: append(current.logs, [...current.boot, "[service running]"]) }
              : {}
          )
        }, 4000)
      }
    },
  }
})

export function useRuntime(project: ProjectId): ProjectRuntime {
  return useRuntimeStore((state) => state.runtimes[project])
}

/** "4200-4299", or a bare "4200" meaning a 100-port block, as `parse_range` reads it. */
export function parseRange(input: string): Range | string {
  const match = /^(\d{1,5})(?:\s*-\s*(\d{1,5}))?$/.exec(input.trim())
  if (!match) return "Use a range like 4500-4599, or a single starting port."
  const start = Number(match[1])
  const end = match[2] === undefined ? start + 99 : Number(match[2])
  if (start < 1024) return "Ports below 1024 need root; start at 1024 or above."
  if (end > 65535) return "Ports go up to 65535."
  if (end <= start) return "The end of the range must come after its start."
  return [start, end]
}
