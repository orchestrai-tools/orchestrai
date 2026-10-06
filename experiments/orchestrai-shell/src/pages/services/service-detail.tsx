import { useState } from "react"
import { ArrowUpRightIcon, EllipsisIcon, LoaderCircleIcon, TriangleAlertIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { ProjectRuntime, Service } from "@/data/services"
import { useAppActions } from "@/lib/app-instance"
import { useDialog } from "@/lib/dialog-store"
import type { ProjectId } from "@/lib/projects"
import { failureSentence, readinessText, serviceSummary } from "@/pages/services/describe"
import { LogView } from "@/pages/services/log-view"
import { useRuntimeStore } from "@/pages/services/runtime-store"
import { ServiceConfig } from "@/pages/services/service-config"
import { LocalMark, Notice, RuntimeDot } from "@/pages/services/status"
import { openSettingsSection } from "@/pages/settings/nav-store"

function FreePortDialog({ port, open, onOpenChange, onConfirm }: { port: number; open: boolean; onOpenChange: (open: boolean) => void; onConfirm: () => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Free port {port}?</DialogTitle>
          <DialogDescription>
            Ends whatever listens on {port}, including a copy of this service left behind by an earlier run. OrchestrAI only frees
            ports it handed out, so a server it did not start is never touched.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button variant="destructive" onClick={onConfirm}>
            Free port {port}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ServiceDetail({
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
  const { start, stop, restart } = useRuntimeStore.getState()
  const { selectTerminal, setPage } = useAppActions()
  const dialog = useDialog()
  const [freeing, setFreeing] = useState(false)
  const url = svc.port ? `http://localhost:${svc.port}` : undefined
  const up = svc.status === "running" || svc.status === "starting"
  const held = svc.reason?.startsWith("did not start")
  const blockedBy = svc.dependsOn.find((dep) => svc.reason?.includes(`dependency ${dep} `))

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-col gap-2 px-4 pt-4 pb-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <RuntimeDot status={svc.status} />
          <h2 className="text-sm font-semibold">{svc.name}</h2>
          <LocalMark fields={svc.localFields} />
          <span className="text-xs text-muted-foreground">{serviceSummary(svc)}</span>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => selectTerminal(svc.terminal)}>
              Open in terminal
            </Button>
            {up || svc.status === "failed" ? (
              <Button variant="outline" size="sm" className="text-xs" onClick={() => restart(project, svc.name)}>
                Restart
              </Button>
            ) : (
              <Button size="sm" className="text-xs" onClick={() => start(project, svc.name)}>
                Start
              </Button>
            )}
            {up && (
              <Button variant="outline" size="sm" className="text-xs" onClick={() => stop(project, svc.name)}>
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
                {url && <DropdownMenuItem onSelect={() => void navigator.clipboard?.writeText(url)}>Copy URL</DropdownMenuItem>}
                <DropdownMenuItem onSelect={() => void navigator.clipboard?.writeText(svc.command)}>Copy command</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => dialog.open("new-task")}>New task about {svc.name}…</DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    openSettingsSection(project, "workspace")
                    setPage("settings")
                  }}
                >
                  Edit in workspace settings
                </DropdownMenuItem>
                {svc.port > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={() => setFreeing(true)}>
                      Free port {svc.port}…
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="flex min-w-0 items-baseline gap-3 text-xs">
          {url &&
            (svc.status === "running" ? (
              <a href={url} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-0.5 font-mono hover:underline">
                localhost:{svc.port}
                <ArrowUpRightIcon className="size-3" />
              </a>
            ) : (
              <span className="shrink-0 font-mono text-muted-foreground">:{svc.port}</span>
            ))}
          <code className="min-w-0 truncate font-mono text-muted-foreground" title={svc.command}>
            {svc.command}
          </code>
        </div>

        {svc.status === "failed" && !held && (
          <Notice tone="danger">
            <TriangleAlertIcon className="mt-px size-3.5 shrink-0" />
            <span className="min-w-0 flex-1">{failureSentence(svc)}</span>
            <Button
              variant="ghost"
              size="xs"
              className="-my-1 text-xs"
              title="Starts a task with the last 50 log lines attached"
              onClick={() => dialog.open("new-task")}
            >
              New task to fix it
            </Button>
          </Notice>
        )}
        {held && (
          <Notice tone="warn">
            <TriangleAlertIcon className="mt-px size-3.5 shrink-0" />
            <span className="min-w-0 flex-1">
              {failureSentence(svc)} It keeps waiting and starts by itself once {blockedBy ? `${blockedBy} is` : "they are"} ready.
            </span>
            {blockedBy && (
              <Button variant="ghost" size="xs" className="-my-1 text-xs" onClick={() => onShow(blockedBy)}>
                Show {blockedBy}
              </Button>
            )}
          </Notice>
        )}
        {svc.portWarning && (
          <Notice tone="warn">
            <TriangleAlertIcon className="mt-px size-3.5 shrink-0" />
            <span>
              {svc.portWarning.listening.length
                ? `Listening on ${svc.portWarning.listening.join(" and ")}, not ${svc.portWarning.expected}`
                : `Nothing answers on port ${svc.portWarning.expected}`}{" "}
              — pass $PORT to its command, e.g. <code className="font-mono">--port $PORT</code>. Agents and the browser use{" "}
              {svc.portWarning.expected}, which is a dead port.
            </span>
          </Notice>
        )}
        {svc.status === "starting" && (
          <Notice tone="quiet">
            <LoaderCircleIcon className="mt-px size-3.5 shrink-0 animate-spin" />
            <span>{readinessText(svc, runtime)}</span>
          </Notice>
        )}
      </div>

      <Tabs defaultValue="logs" className="min-h-0 flex-1 gap-0">
        <TabsList className="mx-4">
          <TabsTrigger value="logs">Logs</TabsTrigger>
          <TabsTrigger value="config">Config</TabsTrigger>
        </TabsList>
        <TabsContent value="logs" className="flex min-h-0 flex-1 flex-col">
          <LogView key={`${project}/${svc.name}`} name={svc.name} lines={svc.logs} />
        </TabsContent>
        <TabsContent value="config" className="min-h-0 flex-1 overflow-y-auto">
          <ServiceConfig project={project} runtime={runtime} svc={svc} onShow={onShow} />
        </TabsContent>
      </Tabs>

      <FreePortDialog
        port={svc.port}
        open={freeing}
        onOpenChange={setFreeing}
        onConfirm={() => {
          stop(project, svc.name)
          setFreeing(false)
        }}
      />
    </div>
  )
}
