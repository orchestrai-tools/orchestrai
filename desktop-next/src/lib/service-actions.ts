import { daemon } from "@warpforge/daemon";
import type { PortForwardInfo, ServiceInfo } from "@warpforge/protocol";
import { toast } from "sonner";
import type { PaletteAction } from "./task-palette";

function run(method: string, project: string, extra: Record<string, string> = {}) {
  void daemon
    .request(method, { project, ...extra })
    .catch((err: unknown) =>
      toast.error(err instanceof Error ? err.message : "Could not update the service"),
    );
}

/** Start, stop, and restart the project's services and port forwards. */
export function servicePaletteActions(
  project: string,
  services: ServiceInfo[],
  forwards: PortForwardInfo[],
): PaletteAction[] {
  const mine = services.filter((service) => service.project === project);
  const ports = forwards.filter((forward) => forward.project === project);
  return [
    {
      id: "services-start",
      label: "Start all services",
      run: () => run("service.startAll", project),
    },
    {
      id: "services-stop",
      label: "Stop all services",
      run: () => run("service.stopAll", project),
    },
    ...mine.flatMap((service) => [
      {
        id: `service-start:${service.name}`,
        label: `Start ${service.name}`,
        run: () => run("service.start", project, { service: service.name }),
      },
      {
        id: `service-stop:${service.name}`,
        label: `Stop ${service.name}`,
        run: () => run("service.stop", project, { service: service.name }),
      },
      {
        id: `service-restart:${service.name}`,
        label: `Restart ${service.name}`,
        run: () => run("service.restart", project, { service: service.name }),
      },
    ]),
    {
      id: "forwards-start",
      label: "Start all port forwards",
      run: () => run("portforward.startAll", project),
    },
    {
      id: "forwards-stop",
      label: "Stop all port forwards",
      run: () => run("portforward.stopAll", project),
    },
    ...ports.flatMap((forward) => [
      {
        id: `forward-start:${forward.name}`,
        label: `Start port forward ${forward.name}`,
        run: () => run("portforward.start", project, { name: forward.name }),
      },
      {
        id: `forward-stop:${forward.name}`,
        label: `Stop port forward ${forward.name}`,
        run: () => run("portforward.stop", project, { name: forward.name }),
      },
    ]),
  ];
}
