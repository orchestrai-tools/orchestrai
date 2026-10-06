import type { LogEntry } from "@warpforge/daemon/types";
import type { ProjectInfo, ServiceInfo } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@warpforge/ui/components/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@warpforge/ui/components/tabs";
import { ArrowUpRightIcon, EllipsisIcon, LoaderCircleIcon, TriangleAlertIcon } from "lucide-react";
import { openExternalLink } from "../../lib/external-link";
import { FAILURE_LINES } from "../../lib/log-context";
import { useTaskDraft } from "../../lib/new-task";
import { useShell } from "../../lib/shell-store";
import { AttachMenu } from "./attach-menu";
import { LogView } from "./log-view";
import { copyText, newTaskWithLogs, runtimeAction } from "./runtime-actions";
import { ServiceConfig } from "./service-config";
import { LocalMark, Notice, PinnedMark, RuntimeDot, STATUS_TEXT } from "./status";

/** One service: its address and command, why it is in its state, then its logs and resolved config. */
export function ServiceDetail({
  project,
  svc,
  lines,
  onRefresh,
}: {
  project: ProjectInfo;
  svc: ServiceInfo;
  lines: LogEntry[];
  onRefresh: () => void;
}) {
  const params = { project: project.name, service: svc.name };
  const port = svc.allocatedPort;
  const url = port > 0 ? `http://localhost:${port}` : undefined;
  const up = svc.status === "running" || svc.status === "starting";
  const failure = lines.slice(-FAILURE_LINES);
  const warning = svc.portWarning;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-col gap-2 px-4 pt-4 pb-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <RuntimeDot status={svc.status} />
          <h2 className="text-sm font-semibold">{svc.name}</h2>
          <PinnedMark name={svc.name} pinned={svc.portPinned} />
          <LocalMark name={svc.name} local={svc.local} fields={svc.localFields} />
          <span className="text-xs text-muted-foreground">{STATUS_TEXT[svc.status]}</span>
          <div className="ml-auto flex items-center gap-1">
            {up || svc.status === "failed" ? (
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => runtimeAction("service.restart", params)}
              >
                Restart
              </Button>
            ) : (
              <Button
                size="sm"
                className="text-xs"
                onClick={() => runtimeAction("service.start", params)}
              >
                Start
              </Button>
            )}
            {up && (
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => runtimeAction("service.stop", params)}
              >
                Stop
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={`More for ${svc.name}`}>
                  <EllipsisIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {url && (
                  <DropdownMenuItem onSelect={() => copyText(url)}>Copy URL</DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={() => copyText(svc.command)}>
                  Copy command
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() =>
                    failure.length > 0
                      ? newTaskWithLogs("service", svc.name, failure)
                      : useTaskDraft.getState().open(`The ${svc.name} service (${svc.command}): `)
                  }
                >
                  New task about {svc.name}…
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => useShell.getState().setPage("settings")}>
                  Edit in workspace settings
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="flex min-w-0 items-baseline gap-3 text-xs">
          {url &&
            (svc.status === "running" ? (
              <button
                type="button"
                aria-label={`Open ${url}`}
                onClick={() => void openExternalLink(url)}
                className="inline-flex shrink-0 items-center gap-0.5 font-mono hover:underline"
              >
                localhost:{port}
                <ArrowUpRightIcon className="size-3" />
              </button>
            ) : (
              <span className="shrink-0 font-mono text-muted-foreground">:{port}</span>
            ))}
          <code className="min-w-0 truncate font-mono text-muted-foreground" title={svc.command}>
            {svc.command}
          </code>
        </div>

        {svc.status === "failed" && (
          <Notice tone="danger">
            <TriangleAlertIcon className="mt-px size-3.5 shrink-0" />
            <span className="min-w-0 flex-1">
              {svc.name} failed.{" "}
              {lines.length === 0
                ? "Its logs are still loading."
                : "The last lines of its log say why."}
            </span>
            <AttachMenu
              project={project.name}
              kind="service"
              name={svc.name}
              entries={failure}
              label="Send last failure"
              title={`Attaches the last ${FAILURE_LINES} log lines`}
            />
          </Notice>
        )}
        {warning && (
          <Notice tone="warn">
            <TriangleAlertIcon className="mt-px size-3.5 shrink-0" />
            <span>
              {warning.listening?.length
                ? `Listening on ${warning.listening.join(" and ")}, not ${warning.expected}`
                : `Nothing answers on port ${warning.expected}`}{" "}
              — pass $PORT to its command, e.g. <code className="font-mono">--port $PORT</code>.
              Agents and the browser use {warning.expected}.
            </span>
          </Notice>
        )}
        {svc.status === "starting" && (
          <Notice tone="quiet">
            <LoaderCircleIcon className="mt-px size-3.5 shrink-0 animate-spin" />
            <span>Waiting until it is ready.</span>
          </Notice>
        )}
      </div>

      <Tabs defaultValue="logs" className="min-h-0 flex-1 gap-0">
        <TabsList className="mx-4">
          <TabsTrigger value="logs">Logs</TabsTrigger>
          <TabsTrigger value="config">Config</TabsTrigger>
        </TabsList>
        <TabsContent value="logs" className="flex min-h-0 flex-1 flex-col">
          <LogView
            key={`${project.name}/${svc.name}`}
            project={project.name}
            kind="service"
            name={svc.name}
            lines={lines}
            onRefresh={onRefresh}
          />
        </TabsContent>
        <TabsContent value="config" className="min-h-0 flex-1 overflow-y-auto">
          <ServiceConfig project={project} svc={svc} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
