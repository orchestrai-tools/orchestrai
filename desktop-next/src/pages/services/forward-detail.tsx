import type { LogEntry } from "@warpforge/daemon/types";
import { PROJECT_DIR } from "@warpforge/protocol";
import type { PortForwardInfo } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import { TriangleAlertIcon } from "lucide-react";
import { LogView } from "./log-view";
import { runtimeAction } from "./runtime-actions";
import { ConfigRow } from "./service-config";
import { LocalMark, Notice, RuntimeDot, STATUS_TEXT } from "./status";

/** A kubectl port-forward: a cluster port reachable on localhost, kept up by the daemon. */
export function ForwardDetail({
  project,
  forward,
  lines,
  onRefresh,
}: {
  project: string;
  forward: PortForwardInfo;
  lines: LogEntry[];
  onRefresh: () => void;
}) {
  const params = { project, name: forward.name };
  const up =
    forward.status === "active" || forward.status === "starting" || forward.status === "restarting";
  const { namespace, pod, localPort, remotePort } = forward;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-col gap-2 px-4 pt-4 pb-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <RuntimeDot status={forward.status} />
          <h2 className="text-sm font-semibold">{forward.name}</h2>
          <LocalMark name={forward.name} local={forward.local} fields={forward.localFields} />
          <span className="text-xs text-muted-foreground">{STATUS_TEXT[forward.status]}</span>
          <div className="ml-auto flex items-center gap-1">
            {up ? (
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => runtimeAction("portforward.stop", params)}
              >
                Stop
              </Button>
            ) : (
              <Button
                size="sm"
                className="text-xs"
                onClick={() => runtimeAction("portforward.start", params)}
              >
                Start
              </Button>
            )}
          </div>
        </div>
        <p className="font-mono text-xs">
          localhost:{localPort} <span className="text-muted-foreground">→</span> {namespace}/{pod}:
          {remotePort}
        </p>
        {forward.status === "failed" && (
          <Notice tone="danger">
            <TriangleAlertIcon className="mt-px size-3.5 shrink-0" />
            <span>
              Gave up after 15 failures in a row; the log below says why. Start tries again from the
              beginning. To point it at another pod on this machine only, set{" "}
              <code className="font-mono">pod:</code> for {forward.name} in{" "}
              <span className="font-mono">{PROJECT_DIR}/workspace.local.yaml</span>.
            </span>
          </Notice>
        )}
      </div>

      <dl className="px-4 pb-2">
        <ConfigRow label="Runs">
          <code className="font-mono break-all">
            kubectl port-forward -n {namespace} pod/&lt;first pod matching “{pod}”&gt; {localPort}:
            {remotePort}
          </code>
          <p className="text-muted-foreground">Exact name first, then prefix, then substring.</p>
        </ConfigRow>
        <ConfigRow label="Keeps it up">
          Reconnects after a drop and backs off between tries. Stop ends only forwards OrchestrAI
          started.
        </ConfigRow>
        <ConfigRow label="Local port">
          A stale kubectl forward on {localPort} from an earlier run is reclaimed. Any other process
          holding {localPort} fails the forward instead.
        </ConfigRow>
      </dl>

      <LogView
        key={`${project}/${forward.name}`}
        project={project}
        kind="forward"
        name={forward.name}
        lines={lines}
        onRefresh={onRefresh}
      />
    </div>
  );
}
