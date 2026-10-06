import type { PortForwardInfo, ProjectInfo, ServiceInfo } from "@warpforge/protocol";
import { PROJECT_DIR } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import { cn } from "@warpforge/ui/lib/utils";
import {
  LoaderCircleIcon,
  PlayIcon,
  RotateCwIcon,
  SquareIcon,
  TriangleAlertIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { SectionLabel } from "../../components/common/page-toolbar";
import { portWarningText } from "../../lib/selected-service";
import { PortRangeFooter } from "./port-range";
import { runtimeAction, type RuntimeKey } from "./runtime-actions";
import { LocalMark, PinnedMark, RuntimeDot, STATUS_TEXT, type RuntimeStatus } from "./status";

function RowAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button variant="ghost" size="icon-xs" aria-label={label} title={label} onClick={onClick}>
      {children}
    </Button>
  );
}

/** One row per item. Its controls appear on hover or focus, and keep their width so nothing shifts. */
function Row({
  status,
  name,
  marks,
  summary,
  port,
  selected,
  onSelect,
  actions,
}: {
  status: RuntimeStatus;
  name: string;
  marks?: ReactNode;
  summary: string;
  port?: string;
  selected: boolean;
  onSelect: () => void;
  actions: ReactNode;
}) {
  return (
    <li
      className={cn(
        "group flex items-center gap-1 rounded-md pr-1",
        selected ? "bg-muted" : "hover:bg-muted/50",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={`${name}, ${summary}`}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-(--row-py) text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <RuntimeDot status={status} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium">{name}</span>
            {marks}
          </span>
          <span className="block truncate text-xs text-muted-foreground">{summary}</span>
        </span>
        {port && <span className="shrink-0 font-mono text-xs text-muted-foreground">{port}</span>}
      </button>
      <span className="invisible flex shrink-0 items-center group-focus-within:visible group-hover:visible">
        {actions}
      </span>
    </li>
  );
}

function ServiceActions({ project, svc }: { project: string; svc: ServiceInfo }) {
  const params = { project, service: svc.name };
  const up = svc.status === "running" || svc.status === "starting";
  return (
    <>
      {!up && svc.status !== "failed" && (
        <RowAction
          label={`Start ${svc.name}`}
          onClick={() => runtimeAction("service.start", params)}
        >
          <PlayIcon />
        </RowAction>
      )}
      {(svc.status === "running" || svc.status === "failed") && (
        <RowAction
          label={`Restart ${svc.name}`}
          onClick={() => runtimeAction("service.restart", params)}
        >
          <RotateCwIcon />
        </RowAction>
      )}
      {up && (
        <RowAction label={`Stop ${svc.name}`} onClick={() => runtimeAction("service.stop", params)}>
          <SquareIcon />
        </RowAction>
      )}
    </>
  );
}

function ForwardActions({ project, forward }: { project: string; forward: PortForwardInfo }) {
  const params = { project, name: forward.name };
  if (forward.status === "starting" || forward.status === "restarting") {
    return (
      <LoaderCircleIcon
        aria-label={`${forward.name} is ${forward.status}`}
        className="m-1.5 size-3 animate-spin text-muted-foreground"
      />
    );
  }
  return forward.status === "active" ? (
    <RowAction
      label={`Stop ${forward.name}`}
      onClick={() => runtimeAction("portforward.stop", params)}
    >
      <SquareIcon />
    </RowAction>
  ) : (
    <RowAction
      label={`Start ${forward.name}`}
      onClick={() => runtimeAction("portforward.start", params)}
    >
      <PlayIcon />
    </RowAction>
  );
}

/** A list heading with its own bulk controls: Start shows while anything is down, Stop while anything is up. */
function ListHeader({
  title,
  count,
  canStart,
  canStop,
  onStart,
  onStop,
}: {
  title: string;
  count: number;
  canStart: boolean;
  canStop: boolean;
  onStart: () => void;
  onStop: () => void;
}) {
  return (
    <div className="flex h-7 items-center gap-2 px-2">
      <SectionLabel>{title}</SectionLabel>
      <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
      <span className="ml-auto flex items-center">
        {canStart && (
          <Button variant="ghost" size="xs" className="text-xs" onClick={onStart}>
            Start all
          </Button>
        )}
        {canStop && (
          <Button variant="ghost" size="xs" className="text-xs" onClick={onStop}>
            Stop all
          </Button>
        )}
      </span>
    </div>
  );
}

/** Services, then port-forwards, each with its state at a glance; the project's port block sits underneath. */
export function RuntimeList({
  project,
  services,
  forwards,
  selected,
  onSelect,
}: {
  project: ProjectInfo;
  services: ServiceInfo[];
  forwards: PortForwardInfo[];
  selected?: RuntimeKey;
  onSelect: (key: RuntimeKey) => void;
}) {
  const name = project.name;
  const isSelected = (kind: RuntimeKey["kind"], item: string) =>
    selected?.kind === kind && selected.name === item;

  return (
    <div className="flex min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        <ListHeader
          title="Services"
          count={services.length}
          canStart={services.some((svc) => svc.status === "stopped" || svc.status === "failed")}
          canStop={services.some((svc) => svc.status !== "stopped")}
          onStart={() => runtimeAction("service.startAll", { project: name })}
          onStop={() => runtimeAction("service.stopAll", { project: name })}
        />
        {services.length === 0 ? (
          <p className="px-2 py-2 text-xs text-muted-foreground">
            None declared. Add them under <code className="font-mono">services:</code> in
            {PROJECT_DIR}/workspace.yaml; without a file, a package.json dev script or
            docker-compose.yaml is picked up.
          </p>
        ) : (
          <ul>
            {services.map((svc) => (
              <Row
                key={svc.name}
                status={svc.status}
                name={svc.name}
                marks={
                  <>
                    <PinnedMark name={svc.name} pinned={svc.portPinned} />
                    <LocalMark name={svc.name} local={svc.local} fields={svc.localFields} />
                    {svc.portWarning && (
                      <TriangleAlertIcon
                        aria-label={portWarningText(svc) ?? "Not answering on its port"}
                        className="size-3 shrink-0 text-amber-600 dark:text-amber-400"
                      />
                    )}
                  </>
                }
                summary={STATUS_TEXT[svc.status]}
                port={svc.allocatedPort > 0 ? `:${svc.allocatedPort}` : undefined}
                selected={isSelected("service", svc.name)}
                onSelect={() => onSelect({ kind: "service", name: svc.name })}
                actions={<ServiceActions project={name} svc={svc} />}
              />
            ))}
          </ul>
        )}

        <div className="mt-4">
          <ListHeader
            title="Port-forwards"
            count={forwards.length}
            canStart={forwards.some((pf) => pf.status === "stopped" || pf.status === "failed")}
            canStop={forwards.some((pf) => pf.status !== "stopped" && pf.status !== "failed")}
            onStart={() => runtimeAction("portforward.startAll", { project: name })}
            onStop={() => runtimeAction("portforward.stopAll", { project: name })}
          />
          {forwards.length === 0 ? (
            <p className="px-2 py-2 text-xs text-muted-foreground">
              None. Add <code className="font-mono">portforwards:</code> to reach a cluster service
              on a local port through kubectl.
            </p>
          ) : (
            <ul>
              {forwards.map((pf) => (
                <Row
                  key={pf.name}
                  status={pf.status}
                  name={pf.name}
                  marks={<LocalMark name={pf.name} local={pf.local} fields={pf.localFields} />}
                  summary={`${STATUS_TEXT[pf.status]} · ${pf.namespace}/${pf.pod}`}
                  port={`:${pf.localPort}`}
                  selected={isSelected("forward", pf.name)}
                  onSelect={() => onSelect({ kind: "forward", name: pf.name })}
                  actions={<ForwardActions project={name} forward={pf} />}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
      <PortRangeFooter project={project} services={services} />
    </div>
  );
}
