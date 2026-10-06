import type { ProjectInfo, ServiceInfo } from "@warpforge/protocol";
import { PROJECT_DIR } from "@warpforge/protocol";
import type { ReactNode } from "react";

export function ConfigRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-3 py-(--row-py) text-xs">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function portText(svc: ServiceInfo, project: ProjectInfo): string {
  const [start, end] = project.portRange;
  if (svc.portPinned) {
    return `${svc.allocatedPort || svc.originalPort}, pinned. If it is already taken, the service fails instead of moving.`;
  }
  if (!svc.originalPort && !svc.allocatedPort) return "None declared.";
  const asked = svc.originalPort ? ` It asked for ${svc.originalPort}.` : "";
  if (!svc.allocatedPort)
    return `A free port in ${start}–${end}, handed out when it starts.${asked}`;
  return `${svc.allocatedPort}, from this project's range ${start}–${end}.${asked}`;
}

/** What the daemon resolved for one service: the command it runs, where, and on which port. */
export function ServiceConfig({ project, svc }: { project: ProjectInfo; svc: ServiceInfo }) {
  return (
    <dl className="px-4 py-2">
      <ConfigRow label="Command">
        <code className="font-mono break-all">sh -c '{svc.command}'</code>
        <p className="text-muted-foreground">
          Runs in its own process group, so Stop ends the shell, the package manager, and the server
          together.
        </p>
      </ConfigRow>
      <ConfigRow label="Runs from">
        <span className="font-mono break-all">{svc.checkout ?? project.path}</span>
        <p className="text-muted-foreground">
          The project checkout, not a task's worktree. Agents editing a worktree are not editing
          what this serves.
        </p>
      </ConfigRow>
      <ConfigRow label="Port">{portText(svc, project)}</ConfigRow>
      {svc.allocatedPort > 0 && (
        <ConfigRow label="Environment">
          <span className="font-mono">PORT={svc.allocatedPort}</span>
          <span className="text-muted-foreground"> · injected</span>
        </ConfigRow>
      )}
      {(svc.local || (svc.localFields?.length ?? 0) > 0) && (
        <ConfigRow label="Local override">
          <span className="font-mono">{PROJECT_DIR}/workspace.local.yaml</span>
          {svc.localFields?.length ? ` sets ${svc.localFields.join(", ")}` : " changes it"} on this
          machine only.
        </ConfigRow>
      )}
    </dl>
  );
}
