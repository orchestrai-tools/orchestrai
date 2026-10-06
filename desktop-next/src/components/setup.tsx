import { daemon } from "@warpforge/daemon";
import type { AgentConfig, DetectedAgent } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@warpforge/ui/components/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@warpforge/ui/components/dialog";
import { cn } from "@warpforge/ui/lib/utils";
import { FolderOpenIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useDaemon } from "../lib/use-daemon";
import { useShell } from "../lib/shell-store";
import { ProjectBadge, ProjectStatus } from "../shell/project-badge";
import { useProjectMarks } from "../shell/project-marks";
import { AddFolderForm } from "./add-folder-form";
import { BootstrapWizard } from "./bootstrap-wizard";

/**
 * The title bar's + opens this: every project you have, then adding one from
 * disk. Picking a project opens it as a tab (or switches to it).
 */
export function AddProjectDialog() {
  const adding = useShell((state) => state.adding);
  const openProjects = useShell((state) => state.openProjects);
  const { projects, marks } = useProjectMarks();
  const [view, setView] = useState<"pick" | "folder">("pick");
  const [bootstrap, setBootstrap] = useState<string | null>(null);

  useEffect(() => {
    function onSetup(event: Event) {
      const name = (event as CustomEvent<string>).detail;
      if (typeof name === "string" && name) setBootstrap(name);
    }
    window.addEventListener("orc-setup-project", onSetup);
    return () => window.removeEventListener("orc-setup-project", onSetup);
  }, []);

  useEffect(() => {
    if (adding) setView(projects.length > 0 ? "pick" : "folder");
    // Only when the dialog opens; adding a project must not flip the view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adding]);

  const close = () => {
    if (useShell.getState().adding) useShell.getState().toggle("adding");
  };

  return (
    <>
      <CommandDialog
        open={adding && view === "pick"}
        onOpenChange={(next) => !next && close()}
        title="Open project"
        description="Open a project as a tab, or add one."
      >
        <CommandInput placeholder="Open a project…" />
        <CommandList>
          <CommandEmpty>No project by that name.</CommandEmpty>
          {projects.length > 0 && (
            <CommandGroup heading="Projects">
              {projects.map((project) => {
                const mark = marks.get(project.name);
                return (
                  <CommandItem
                    key={project.name}
                    value={`${project.name} ${project.path}`}
                    onSelect={() => {
                      close();
                      useShell.getState().openProject(project.name);
                    }}
                  >
                    <ProjectBadge name={project.name} />
                    <span className="font-medium">{project.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{project.path}</span>
                    <ProjectStatus
                      waiting={mark?.waiting ?? 0}
                      running={mark?.running ?? 0}
                      className="ml-auto text-xs"
                    />
                    {openProjects.includes(project.name) && <CommandShortcut>Open</CommandShortcut>}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          )}
          <CommandGroup heading="Add">
            <CommandItem value="add from disk folder" onSelect={() => setView("folder")}>
              <FolderOpenIcon />
              Add a folder from disk…
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>

      <Dialog open={adding && view === "folder"} onOpenChange={(next) => !next && close()}>
        <DialogContent className="sm:max-w-lg">
          <AddFolderForm
            onCancel={close}
            onAdded={(name) => {
              close();
              toast.success(`Added ${name}`, {
                action: { label: "Set up", onClick: () => setBootstrap(name) },
              });
            }}
          />
        </DialogContent>
      </Dialog>

      {bootstrap && <BootstrapWizard project={bootstrap} onClose={() => setBootstrap(null)} />}
    </>
  );
}

/** First run: the agents found on this machine, and which of them the app should drive. */
export function SetupDialog() {
  const pending = useDaemon().pendingAgentSetup;
  const [busy, setBusy] = useState(false);
  const open = Boolean(pending && pending.length > 0);

  async function save(agents: DetectedAgent[]) {
    setBusy(true);
    const configs: AgentConfig[] = agents
      .filter((agent) => agent.installed)
      .map((agent) => ({
        id: agent.id,
        displayName: agent.displayName,
        acpCommand: agent.defaultAcpCommand,
        enabled: true,
        models: [],
      }));
    try {
      await daemon.saveAgents(configs);
      daemon.dismissAgentSetup();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the agents");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && daemon.dismissAgentSetup()}>
      <DialogContent showCloseButton={false} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Set up agents</DialogTitle>
          <DialogDescription>
            Choose which installed agents this app should drive. You can change this later on the
            Agents page.
          </DialogDescription>
        </DialogHeader>
        <ul className="min-w-0 divide-y divide-border/60">
          {(pending ?? []).map((agent) => (
            <li key={agent.id} className="flex items-center gap-3 py-(--row-py)">
              <span
                aria-hidden
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  agent.installed ? "bg-emerald-500" : "bg-muted-foreground/40",
                )}
              />
              <span className="shrink-0 text-sm font-medium">{agent.displayName}</span>
              <span
                className={cn(
                  "ml-auto min-w-0 truncate text-xs text-muted-foreground",
                  !agent.installed && "font-mono",
                )}
                title={agent.installed ? undefined : agent.installHint}
              >
                {agent.installed ? "Installed" : agent.installHint}
              </span>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => daemon.dismissAgentSetup()}>
            Skip for now
          </Button>
          <Button disabled={busy} onClick={() => pending && void save(pending)}>
            Save installed agents
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
