import { daemon } from "@warpforge/daemon";
import type { LinearTeam } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { SelectMenu } from "../../components/common/select-menu";
import { openSettingsSection } from "./nav-store";
import { ErrorLine, Group, ROW_SELECT, Row, SectionHeader, fail } from "./primitives";

/** Which Linear team this project's backlog imports from. Accounts live under Integrations. */
export function TrackerSection({ project }: { project: string }) {
  const [teams, setTeams] = useState<LinearTeam[]>([]);
  const [teamId, setTeamId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);

  function load() {
    void daemon
      .trackerStatus()
      .then(async (status) => {
        const linked = Boolean(status.linear);
        setConnected(linked);
        setTeams(linked ? await daemon.linearTeams() : []);
        setError(null);
      })
      .catch((err: unknown) => setError(fail(err, "Could not list Linear teams")));
    void daemon
      .trackerProjectSettings(project)
      .then((settings) => setTeamId(settings.linearTeamId ?? ""))
      .catch(() => {});
  }

  useEffect(load, [project]);

  return (
    <>
      <SectionHeader
        title="Issue tracker"
        scope="How this project reaches its issue tracker. Accounts and tokens are app-wide, under Integrations."
      >
        <Button
          variant="outline"
          size="sm"
          className="text-xs"
          onClick={() => openSettingsSection(project, "integrations")}
        >
          Integrations
        </Button>
      </SectionHeader>

      <Group
        title="Linear"
        note="The backlog mirrors the team's issues, and a task started from one links back to it."
      >
        {error && <ErrorLine message={error} onRetry={load} />}
        <Row
          title="Linear team"
          description={
            connected === false
              ? "Linear isn't connected. Connect it to import a team's issues into this backlog."
              : "Imports issues from this team into the project's backlog."
          }
          control={
            connected === false ? (
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => openSettingsSection(project, "integrations")}
              >
                Connect Linear…
              </Button>
            ) : (
              <SelectMenu
                label="Linear team"
                value={teamId}
                onChange={(next) => {
                  setTeamId(next);
                  const team = teams.find((item) => item.id === next) ?? null;
                  void daemon
                    .setProjectLinearTeam(project, team)
                    .catch((err: unknown) => toast.error(fail(err, "Could not set the team")));
                }}
                options={[
                  { value: "", label: "None" },
                  ...teams.map((team) => ({ value: team.id, label: `${team.key} ${team.name}` })),
                ]}
                className={ROW_SELECT}
              />
            )
          }
        />
      </Group>
    </>
  );
}
