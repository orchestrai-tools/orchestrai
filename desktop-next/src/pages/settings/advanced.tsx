import { daemon } from "@warpforge/daemon";
import { PROJECT_DIR } from "@warpforge/protocol";
import type { BacklogStorageMode } from "@warpforge/protocol";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Choice, ErrorLine, Group, Row, SectionHeader, fail } from "./primitives";

const STORAGE = [
  { value: "sqlite", label: "SQLite" },
  { value: "yaml", label: "YAML files" },
] as const;

/** Rare, app-wide switches: where the backlog is stored. */
export function AdvancedSection() {
  const [mode, setMode] = useState<BacklogStorageMode>("sqlite");
  const [error, setError] = useState<string | null>(null);

  function load() {
    void daemon
      .backlogSettings()
      .then((settings) => {
        setMode(settings.mode);
        setError(null);
      })
      .catch((err: unknown) => setError(fail(err, "Could not read the backlog storage")));
  }

  useEffect(load, []);

  return (
    <>
      <SectionHeader
        title="Advanced"
        scope="Rarely needed. Every change here applies to all projects."
      />

      <Group title="Storage">
        {error && <ErrorLine message={error} onRetry={load} />}
        <Row
          title="Backlog storage"
          description={`SQLite stays in OrchestrAI's data folder. YAML files live in ${PROJECT_DIR}/backlog and can be committed.`}
          control={
            <Choice
              label="Backlog storage"
              value={mode}
              options={STORAGE}
              onChange={(next) => {
                setMode(next);
                void daemon
                  .setBacklogStorage(next)
                  .then(() => toast.success("Backlog storage saved"))
                  .catch((err: unknown) =>
                    toast.error(fail(err, "Could not save the backlog storage")),
                  );
              }}
            />
          }
        />
      </Group>
    </>
  );
}
