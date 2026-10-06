import { Button } from "@warpforge/ui/components/button";
import { requestRemoveProject } from "../../shell/remove-project-dialog";
import { Group, Row, SectionHeader } from "./primitives";

/** How to leave cleanly: take the project off OrchestrAI's list. */
export function DataSection({ project }: { project: string }) {
  return (
    <>
      <SectionHeader
        title="Data"
        scope="Workspace config, workflows, and docs live in the repository. They are your files, and nothing here deletes them."
      />

      <Group title="Leave">
        <Row
          title="Remove from OrchestrAI"
          description="Stops what is running and takes the project off the list. The folder and its files stay."
          control={
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => requestRemoveProject(project)}
            >
              Remove…
            </Button>
          }
        />
      </Group>
    </>
  );
}
