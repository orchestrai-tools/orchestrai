import { RUNTIMES, type PortForward, type ProjectRuntime, type Service } from "@/data/services"
import type { ProjectId } from "@/lib/projects"

/** Quote only what a plain YAML scalar cannot hold. */
function scalar(value: string): string {
  return /: | #|^[&*!|>'"%@`{[]/.test(value) ? JSON.stringify(value) : value
}

const list = (items: string[]) => `[${items.map((item) => (/^[\w.-]+$/.test(item) ? item : JSON.stringify(item))).join(", ")}]`

/** The block one service has in the shared file; fields from the local file are left out. */
export function serviceYaml(svc: Service, explicitRange: boolean): string[] {
  const out = [`${svc.name}:`, `  command: ${scalar(svc.command)}`]
  if (svc.declaredPort) out.push(`  port: ${svc.declaredPort}`)
  if (explicitRange && svc.declaredPort && !svc.pinned) out.push("  portFallback: auto")
  if (svc.dependsOn.length) out.push(`  dependsOn: ${list(svc.dependsOn)}`)
  if (svc.healthcheck) out.push("  healthcheck:", `    url: ${svc.healthcheck.url}`, `    interval: ${svc.healthcheck.interval}`)
  if (svc.readyPattern) out.push(`  readyPattern: ${scalar(svc.readyPattern)}`)
  if (svc.readyTimeout !== "5m") out.push(`  readyTimeout: ${svc.readyTimeout}`)
  const env = svc.env.filter((entry) => !entry.local)
  if (env.length) out.push("  env:", ...env.map((entry) => `    ${entry.key}: ${scalar(entry.value)}`))
  return out
}

function forwardYaml(forward: PortForward): string[] {
  return [
    `- name: ${forward.name}`,
    `  namespace: ${forward.namespace}`,
    `  pod: ${forward.pod}`,
    `  localPort: ${forward.localPort}`,
    `  remotePort: ${forward.remotePort}`,
  ]
}

const indent = (lines: string[], by = 2) => lines.map((line) => " ".repeat(by) + line)

/** The committed file, rebuilt from what the daemon loaded. A machine-local range lives in the registry, not here. */
export function workspaceYaml(project: ProjectId, name: string, runtime: ProjectRuntime): string {
  const declared = RUNTIMES[project].range
  const explicit = declared.source === "declared"
  const out = [`# ${runtime.configFile} — OrchestrAI project configuration`, `name: ${name}`]
  if (explicit) out.push("", "ports:", `  range: "${declared.start}-${declared.end}"`)
  if (runtime.services.length) {
    out.push("", "services:")
    for (const svc of runtime.services) out.push(...indent(serviceYaml(svc, explicit)))
  }
  if (runtime.forwards.length) out.push("", "portforwards:", ...indent(runtime.forwards.flatMap(forwardYaml)))
  if (runtime.worktree) {
    out.push("", "worktree:", `  copy: ${list(runtime.worktree.copy)}`)
    if (runtime.worktree.setup) out.push(`  setup: ${scalar(runtime.worktree.setup)}`)
  }
  if (runtime.agentTemplates?.length) {
    out.push("", "agentTemplates:")
    for (const template of runtime.agentTemplates) {
      out.push(`  ${template.name}:`, `    command: ${scalar(template.command)}`, `    description: ${scalar(template.description)}`)
    }
  }
  return out.join("\n")
}
