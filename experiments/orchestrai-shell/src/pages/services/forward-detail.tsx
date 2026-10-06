import { TriangleAlertIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { PortForward, ProjectRuntime } from "@/data/services"
import type { ProjectId } from "@/lib/projects"
import { STATUS_TEXT } from "@/pages/services/describe"
import { LogView } from "@/pages/services/log-view"
import { useRuntimeStore } from "@/pages/services/runtime-store"
import { ConfigRow, RuntimeLinks } from "@/pages/services/service-config"
import { LocalMark, Notice, RuntimeDot } from "@/pages/services/status"

/** A kubectl port-forward: a cluster port reachable on localhost, kept up by the daemon. */
export function ForwardDetail({
  project,
  runtime,
  forward,
  onShow,
}: {
  project: ProjectId
  runtime: ProjectRuntime
  forward: PortForward
  onShow: (name: string) => void
}) {
  const { startForward, stopForward } = useRuntimeStore.getState()
  const up = forward.status === "active" || forward.status === "starting" || forward.status === "restarting"
  const neededBy = runtime.services.filter((svc) => svc.dependsOn.includes(forward.name)).map((svc) => svc.name)
  const { namespace, pod, localPort, remotePort } = forward

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-col gap-2 px-4 pt-4 pb-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <RuntimeDot status={forward.status} />
          <h2 className="text-sm font-semibold">{forward.name}</h2>
          <LocalMark fields={forward.localFields} />
          <span className="text-xs text-muted-foreground">{STATUS_TEXT[forward.status]}</span>
          <div className="ml-auto flex items-center gap-1">
            {up ? (
              <Button variant="outline" size="sm" className="text-xs" onClick={() => stopForward(project, forward.name)}>
                Stop
              </Button>
            ) : (
              <Button size="sm" className="text-xs" onClick={() => startForward(project, forward.name)}>
                Start
              </Button>
            )}
          </div>
        </div>
        <p className="font-mono text-xs">
          localhost:{localPort} <span className="text-muted-foreground">→</span> {namespace}/{pod}:{remotePort}
        </p>
        {forward.status === "failed" && (
          <Notice tone="danger">
            <TriangleAlertIcon className="mt-px size-3.5 shrink-0" />
            <span>
              Gave up after 15 failures in a row: {forward.reason}. Start tries again from the beginning. To point it at another pod on this
              machine only, set <code className="font-mono">pod:</code> for {forward.name} in{" "}
              <span className="font-mono">{runtime.localFile ?? ".warpforge/workspace.local.yaml"}</span>.
            </span>
          </Notice>
        )}
      </div>

      <dl className="px-4 pb-2">
        <ConfigRow label="Runs">
          <code className="font-mono break-all">
            kubectl port-forward -n {namespace} pod/&lt;first pod matching “{pod}”&gt; {localPort}:{remotePort}
          </code>
          <p className="text-muted-foreground">Exact name first, then prefix, then substring.</p>
        </ConfigRow>
        <ConfigRow label="Keeps it up">
          Checks the port every 2 s and reconnects after a drop, backing off from 2 s to 30 s. Stop ends only forwards OrchestrAI started.
        </ConfigRow>
        <ConfigRow label="Local port">
          A stale kubectl forward on {localPort} from an earlier run is reclaimed. Any other process holding {localPort} fails the forward instead.
        </ConfigRow>
        {neededBy.length > 0 && (
          <ConfigRow label="Needed by">
            <RuntimeLinks names={neededBy} runtime={runtime} onShow={onShow} />
            <p className="pt-1 text-muted-foreground">
              Started for them on demand. If something on this machine already answers on {localPort}, that server is used and no forward
              starts.
            </p>
          </ConfigRow>
        )}
      </dl>

      <LogView key={`${project}/${forward.name}`} name={forward.name} lines={forward.logs} />
    </div>
  )
}
