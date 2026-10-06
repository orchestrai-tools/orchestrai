import { Button } from "@warpforge/ui/components/button";
import { PROJECT_DIR } from "@warpforge/protocol";
import { useEffect } from "react";
import { PageToolbar } from "../components/common/page-toolbar";
import { useSelectedService } from "../lib/selected-service";
import { useShell } from "../lib/shell-store";
import { useDaemon } from "../lib/use-daemon";
import { ForwardDetail } from "./services/forward-detail";
import { ConfigErrors, RangeConflict } from "./services/port-range";
import { fetchLogs, useRuntimeSelection, type RuntimeKey } from "./services/runtime-actions";
import { RuntimeList } from "./services/runtime-list";
import { ServiceDetail } from "./services/service-detail";

/**
 * The project's dev services and port-forwards from its workspace file, each
 * on a port from the project's own block. The list is the status at a glance;
 * the selected one gets its logs and the reasons behind its state.
 */
export function ServicesPage() {
  const projectName = useShell((state) => state.project);
  const { snapshot, serviceLogs, portforwardLogs } = useDaemon();
  const wanted = useRuntimeSelection((state) =>
    projectName ? state.selected[projectName] : undefined,
  );
  const selectService = useSelectedService((state) => state.select);
  const project = snapshot.projects.find((item) => item.name === projectName);
  const services = snapshot.services.filter((svc) => svc.project === projectName);
  const forwards = snapshot.portforwards.filter((pf) => pf.project === projectName);

  const keys: RuntimeKey[] = [
    ...services.map((svc) => ({ kind: "service" as const, name: svc.name })),
    ...forwards.map((pf) => ({ kind: "forward" as const, name: pf.name })),
  ];
  const selected = keys.find((key) => `${key.kind}:${key.name}` === wanted) ?? keys[0];
  const service =
    selected?.kind === "service" ? services.find((svc) => svc.name === selected.name) : undefined;
  const forward =
    selected?.kind === "forward" ? forwards.find((pf) => pf.name === selected.name) : undefined;
  const logKey = selected && projectName ? `${projectName}/${selected.name}` : "";
  const lines =
    (selected?.kind === "forward" ? portforwardLogs[logKey] : serviceLogs[logKey]) ?? [];

  useEffect(() => () => selectService(null), [selectService]);

  useEffect(() => {
    selectService(service ?? null);
  }, [service, selectService]);

  useEffect(() => {
    if (projectName && selected) fetchLogs(projectName, selected);
  }, [projectName, selected?.kind, selected?.name]);

  if (!projectName || !project) {
    return <p className="p-4 text-sm text-muted-foreground">Open a project to see its services.</p>;
  }

  const running = services.filter((svc) => svc.status === "running").length;
  const failed = services.filter((svc) => svc.status === "failed").length;
  const meta = [
    `${running} of ${services.length} running`,
    failed ? `${failed} failed` : "",
    `ports ${project.portRange[0]}–${project.portRange[1]}`,
  ]
    .filter(Boolean)
    .join(" · ");
  const openSettings = () => useShell.getState().setPage("settings");
  const select = (key: RuntimeKey) => useRuntimeSelection.getState().select(projectName, key);
  const refresh = () => selected && fetchLogs(projectName, selected);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="p-4 pb-3">
        <PageToolbar title="Services" meta={meta}>
          <Button variant="outline" size="sm" className="text-xs" onClick={openSettings}>
            Workspace settings
          </Button>
        </PageToolbar>
      </div>
      <RangeConflict project={project} />
      <ConfigErrors project={project} />

      {keys.length === 0 ? (
        <div className="dot-grid flex flex-1 flex-col items-center justify-center gap-3 border-t text-sm text-muted-foreground">
          <p>No services or port-forwards yet.</p>
          <Button variant="outline" size="sm" className="text-xs" onClick={openSettings}>
            Declare them in {PROJECT_DIR}/workspace.yaml
          </Button>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(15rem,19rem)_minmax(0,1fr)] border-t">
          <RuntimeList
            project={project}
            services={services}
            forwards={forwards}
            selected={selected}
            onSelect={select}
          />
          <section aria-label={selected?.name} className="min-h-0 min-w-0 border-l">
            {service && (
              <ServiceDetail
                key={`${projectName}/${service.name}`}
                project={project}
                svc={service}
                lines={lines}
                onRefresh={refresh}
              />
            )}
            {forward && (
              <ForwardDetail
                key={`${projectName}/${forward.name}`}
                project={projectName}
                forward={forward}
                lines={lines}
                onRefresh={refresh}
              />
            )}
          </section>
        </div>
      )}
    </div>
  );
}
