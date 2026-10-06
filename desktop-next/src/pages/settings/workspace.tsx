import { daemon } from "@warpforge/daemon";
import { PROJECT_DIR } from "@warpforge/protocol";
import type { ProjectInfo, ServiceStatus } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import { Input } from "@warpforge/ui/components/input";
import { cn } from "@warpforge/ui/lib/utils";
import { TriangleAlertIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { portRangeSourceLabel, portRangeSourceTitle } from "../../components/port-range-conflict";
import { normalizePortRange, portRangeInputError } from "../../lib/port-range";
import { useShell } from "../../lib/shell-store";
import { useDaemon } from "../../lib/use-daemon";
import { Advanced, Group, Quiet, Row, SectionHeader, fail } from "./primitives";

const DOT: Record<ServiceStatus, string> = {
  running: "bg-emerald-500",
  starting: "bg-amber-500",
  failed: "bg-red-500",
  stopped: "bg-muted-foreground/40",
};

function RangeForm({ project }: { project: ProjectInfo }) {
  const current = `${project.portRange[0]}-${project.portRange[1]}`;
  const [range, setRange] = useState(current);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setRange(current);
  }, [current]);

  async function save() {
    const invalid = portRangeInputError(range);
    setError(invalid);
    if (invalid) return;
    const next = normalizePortRange(range);
    if (!next) return;
    setSaving(true);
    try {
      await daemon.setProjectPortRange(project.name, next);
      toast.success("Port range saved on this machine");
    } catch (err) {
      setError(fail(err, "Could not set the port range"));
    } finally {
      setSaving(false);
    }
  }

  async function clear() {
    setSaving(true);
    try {
      await daemon.setProjectPortRange(project.name, null);
      toast.success("Local port override cleared");
    } catch (err) {
      setError(fail(err, "Could not clear the override"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <Input
          value={range}
          onChange={(event) => {
            setRange(event.target.value);
            setError(null);
          }}
          placeholder="4300-4399"
          aria-label={`Port range for ${project.name}`}
          aria-invalid={error !== null}
          className="h-7 w-32 font-mono text-xs md:text-xs"
        />
        <Button type="submit" variant="outline" size="sm" className="text-xs" disabled={saving}>
          Save on this machine
        </Button>
        {project.portRangeSource === "localOverride" && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-xs"
            disabled={saving}
            onClick={() => void clear()}
          >
            Clear override
          </Button>
        )}
      </form>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

/** Services, the port range, and agent templates from the project's workspace file. */
export function WorkspaceSection({ project }: { project: ProjectInfo }) {
  const services = useDaemon().snapshot.services.filter((svc) => svc.project === project.name);
  const [start, end] = project.portRange;
  const sourceLabel = portRangeSourceLabel(project.portRangeSource);
  const sourceTitle = portRangeSourceTitle(project.portRangeSource);
  const pinned = services.filter((svc) => svc.portPinned).length;
  const templates = Object.entries(project.agentTemplates ?? {});

  return (
    <>
      <SectionHeader
        title="Workspace"
        scope={
          <>
            Saved in <span className="font-mono">{PROJECT_DIR}/workspace.yaml</span>, committed with
            the code, so the whole team shares it.
          </>
        }
      >
        <Button
          variant="outline"
          size="sm"
          className="text-xs"
          onClick={() => useShell.getState().setPage("services")}
        >
          Open Services
        </Button>
      </SectionHeader>

      <Group title="Services">
        {services.length === 0 && (
          <Quiet>
            {project.declaredServices.length
              ? `Declared: ${project.declaredServices.join(", ")}. None has started yet.`
              : "No services. Add services: to the workspace file, or a package.json dev script is picked up."}
          </Quiet>
        )}
        {services.map((svc) => (
          <Row
            key={svc.name}
            title={
              <span className="flex items-center gap-2">
                <span aria-hidden className={cn("size-2 rounded-full", DOT[svc.status])} />
                {svc.name}
                {svc.local && (
                  <span className="text-xs font-normal text-muted-foreground">local</span>
                )}
              </span>
            }
            description={<span className="font-mono">{svc.command}</span>}
            control={
              <span className="font-mono text-xs text-muted-foreground">
                {svc.allocatedPort > 0 ? `:${svc.allocatedPort}` : "no port"}
              </span>
            }
          />
        ))}
      </Group>

      <Group title="Ports">
        <Row
          title={`Range ${start}–${end}`}
          description={[
            sourceLabel && `${sourceLabel[0].toUpperCase()}${sourceLabel.slice(1)}.`,
            sourceTitle,
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {project.portRangeConflict && (
            <div
              role="alert"
              className="mb-2 flex items-start gap-2 rounded-md bg-red-500/10 p-2 text-xs text-red-700 dark:text-red-400"
            >
              <TriangleAlertIcon className="mt-px size-3.5 shrink-0" />
              <span>
                Conflicts with {project.portRangeConflict}, which uses the same block. Services here
                will not start until this machine uses another range.
              </span>
            </div>
          )}
          <RangeForm project={project} />
        </Row>
        <Row
          title="Pinned ports"
          description="In a team range, a declared port is exact: if it is taken the service fails rather than moving."
          control={
            <span className="text-xs text-muted-foreground tabular-nums">{pinned} pinned</span>
          }
        />
        <Row
          title="Port references"
          description={
            <>
              Any command, env value, or healthcheck can use{" "}
              <code className="font-mono">{"${name.port}"}</code>;{" "}
              <code className="font-mono">$PORT</code> is always the service's own.
            </>
          }
        />
      </Group>

      <Advanced label="Agent templates">
        <Group
          title="Agent templates"
          note="Shortcuts for starting an agent with a fixed command, offered when you open a terminal agent."
        >
          {templates.length ? (
            templates.map(([name, command]) => (
              <Row
                key={name}
                title={name}
                control={<code className="font-mono text-xs">{command}</code>}
              />
            ))
          ) : (
            <Quiet>None. Add agentTemplates: to the workspace file.</Quiet>
          )}
        </Group>
      </Advanced>
    </>
  );
}
