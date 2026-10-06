import type { ProjectInfo } from "@warpforge/protocol";
import { PROJECT_DIR, DATA_DIR } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import { TriangleAlertIcon } from "lucide-react";
import { useState } from "react";

import { BootstrapWizard } from "../../components/bootstrap-wizard";
import { Group, Row, SectionHeader } from "./primitives";
import { useFlash } from "./use-flash";

/** The project's name and folder, its config files, and the guided setup. */
export function GeneralSection({ project }: { project: ProjectInfo }) {
  const [flash, show] = useFlash();
  const [bootstrap, setBootstrap] = useState(false);

  return (
    <>
      <SectionHeader
        title="General"
        scope={`Kept in OrchestrAI's project list on this Mac (${DATA_DIR}/projects.json).`}
      />

      <Group>
        <Row
          title="Name"
          description="How the project is shown in tabs, the palette, and agent prompts."
          control={<span className="text-sm">{project.name}</span>}
        />
        <Row
          title="Folder"
          description="The repository on disk. Services and the main checkout run here."
          control={
            <>
              <code className="max-w-80 truncate font-mono text-xs" title={project.path}>
                {project.path}
              </code>
              <Button
                variant="ghost"
                size="xs"
                className="text-xs"
                onClick={() => {
                  void navigator.clipboard?.writeText(project.path);
                  show("Copied");
                }}
              >
                {flash ?? "Copy"}
              </Button>
            </>
          }
        />
      </Group>

      <Group title="Configuration files">
        <Row
          title="Shared config"
          description="Committed with the code, so everyone on the team runs the same services."
          control={<code className="font-mono text-xs">{PROJECT_DIR}/workspace.yaml</code>}
        >
          {project.configError && (
            <p className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400">
              <TriangleAlertIcon className="mt-px size-3.5 shrink-0" />
              <span>Not loaded because it does not parse: {project.configError}</span>
            </p>
          )}
        </Row>
        <Row
          title="Personal overrides"
          description="Merged over the shared file on this Mac only, and kept out of git."
          control={<code className="font-mono text-xs">{PROJECT_DIR}/workspace.local.yaml</code>}
        >
          {project.localConfigError && (
            <p className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400">
              <TriangleAlertIcon className="mt-px size-3.5 shrink-0" />
              <span>Ignored because it does not parse: {project.localConfigError}</span>
            </p>
          )}
        </Row>
        <Row
          title="Workflow templates"
          description="Reusable pipelines. A file here replaces the built-in template with the same name."
          control={<code className="font-mono text-xs">{PROJECT_DIR}/workflows/</code>}
        />
      </Group>

      <Group title="Setup">
        <Row
          title="Set up with an agent"
          description="Answers a few questions about how services run, then an agent writes the workspace file."
          control={
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => setBootstrap(true)}
            >
              Set up project…
            </Button>
          }
        />
      </Group>

      {bootstrap && <BootstrapWizard project={project.name} onClose={() => setBootstrap(false)} />}
    </>
  );
}
