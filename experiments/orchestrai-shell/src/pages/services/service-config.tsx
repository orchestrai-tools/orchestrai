import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { interpolate, RUNTIMES, type ProjectRuntime, type Service } from "@/data/services"
import { findProject, type ProjectId } from "@/lib/projects"
import { portMap, portText, readyRule, STATUS_TEXT } from "@/pages/services/describe"
import { RuntimeDot } from "@/pages/services/status"
import { serviceYaml } from "@/pages/services/yaml"

export function ConfigRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-3 py-(--row-py) text-xs">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  )
}

export function RuntimeLinks({ names, runtime, onShow }: { names: string[]; runtime: ProjectRuntime; onShow: (name: string) => void }) {
  return (
    <span className="flex flex-wrap gap-1">
      {names.map((name) => {
        const status = runtime.services.find((svc) => svc.name === name)?.status ?? runtime.forwards.find((pf) => pf.name === name)?.status ?? "stopped"
        return (
          <Button key={name} variant="outline" size="xs" className="text-xs" onClick={() => onShow(name)}>
            <RuntimeDot status={status} />
            {name}
            <span className="text-muted-foreground">{STATUS_TEXT[status].toLowerCase()}</span>
          </Button>
        )
      })}
    </span>
  )
}

/** Everything the daemon resolved for one service, next to the block it came from. */
export function ServiceConfig({
  project,
  runtime,
  svc,
  onShow,
}: {
  project: ProjectId
  runtime: ProjectRuntime
  svc: Service
  onShow: (name: string) => void
}) {
  const ports = portMap(runtime)
  const neededBy = runtime.services.filter((other) => other.dependsOn.includes(svc.name)).map((other) => other.name)

  return (
    <dl className="px-4 py-2">
      <ConfigRow label="Command">
        <code className="font-mono break-all">sh -c '{svc.command}'</code>
        <p className="text-muted-foreground">Runs in its own process group, so Stop ends the shell, the package manager, and the server together.</p>
      </ConfigRow>
      <ConfigRow label="Runs from">
        <span className="font-mono">{findProject(project).path}</span>
        <p className="text-muted-foreground">The project checkout, never a task's worktree. Agents editing a worktree are not editing what this serves.</p>
      </ConfigRow>
      <ConfigRow label="Port">{portText(svc, runtime)}</ConfigRow>
      <ConfigRow label="Environment">
        <table className="w-full font-mono">
          <tbody>
            {svc.port > 0 && (
              <tr>
                <td className="w-1/3 pr-3 align-top">PORT</td>
                <td>{svc.port}</td>
                <td className="pl-3 text-right align-top font-sans text-muted-foreground">injected</td>
              </tr>
            )}
            {svc.env.map((entry) => {
              const resolved = interpolate(entry.value, ports)
              return (
                <tr key={entry.key}>
                  <td className="w-1/3 pr-3 align-top">{entry.key}</td>
                  <td className="break-all">
                    {resolved}
                    {resolved !== entry.value && <div className="text-muted-foreground">{entry.value}</div>}
                  </td>
                  <td className="pl-3 text-right align-top font-sans text-muted-foreground">{entry.local ? "local" : ""}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {svc.env.some((entry) => entry.value.includes(".port}")) && (
          <p className="pt-1 text-muted-foreground">A placeholder that cannot resolve fails the start loudly instead of passing the literal text on.</p>
        )}
      </ConfigRow>
      <ConfigRow label="Ready when">
        {readyRule(svc, runtime)}
        <p className="text-muted-foreground">
          After {svc.readyTimeout} it is marked failed but left running, and it still turns Running if it becomes ready later.
        </p>
      </ConfigRow>
      <ConfigRow label="Depends on">
        {svc.dependsOn.length ? <RuntimeLinks names={svc.dependsOn} runtime={runtime} onShow={onShow} /> : "Nothing. Start all starts it first."}
      </ConfigRow>
      {neededBy.length > 0 && (
        <ConfigRow label="Needed by">
          <RuntimeLinks names={neededBy} runtime={runtime} onShow={onShow} />
        </ConfigRow>
      )}
      {svc.localFields && (
        <ConfigRow label="Local override">
          <span className="font-mono">{runtime.localFile}</span> sets {svc.localFields.join(", ")} on this machine only. It stays out of git.
        </ConfigRow>
      )}
      <ConfigRow label="As written">
        <pre className="overflow-x-auto rounded-md bg-muted/50 p-2 font-mono">{serviceYaml(svc, RUNTIMES[project].range.source === "declared").join("\n")}</pre>
        <p className="pt-1 text-muted-foreground">
          From <span className="font-mono">{runtime.configFile}</span>. Saved edits load within half a second; a running service keeps the
          definition it started with until you restart it.
        </p>
      </ConfigRow>
    </dl>
  )
}
