import { Button } from "@warpforge/ui/components/button";
import { Kbd } from "@warpforge/ui/components/kbd";
import { useEffect, useSyncExternalStore } from "react";
import { useShell } from "../../lib/shell-store";
import { updater, type UpdaterState } from "../../lib/updater";
import { Group, Row, SectionHeader } from "./primitives";

function updateLabel(state: UpdaterState): string {
  switch (state.status) {
    case "checking":
      return "Checking…";
    case "upToDate":
      return "Up to date";
    case "available":
      return `${state.nextVersion ?? "An update"} is available`;
    case "downloading":
    case "installing":
      return "Installing…";
    case "ready":
      return "Restart to update";
    default:
      return "Check for updates";
  }
}

/** Where to find every action, and the app's version with an update check. */
export function HelpSection() {
  const state = useSyncExternalStore(updater.subscribe, updater.getState);
  useEffect(() => {
    void updater.initialize();
  }, []);
  const off = state.status === "off";
  const unsupported = state.status === "unsupported" || off;
  const idle = state.status === "idle" || state.status === "upToDate" || state.status === "error";

  return (
    <>
      <SectionHeader title="Help" scope="Answers without leaving the app." />

      <Group title="Find it">
        <Row
          title="Search every action"
          description="The command palette has everything the app can do, each with its shortcut."
          control={
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => useShell.getState().openPalette("actions")}
            >
              Open palette <Kbd className="text-xs">⌘K</Kbd>
            </Button>
          }
        />
      </Group>

      <Group title="About">
        <Row
          title={`OrchestrAI ${state.currentVersion}`}
          description={
            off
              ? "Automatic updates are off until OrchestrAI publishes its own signed releases."
              : unsupported
              ? "Updates are checked in the desktop app."
              : state.status === "error"
                ? `The last check failed: ${state.error ?? "unknown error"}`
                : "Checked a few times a day while the app is open."
          }
          control={
            !unsupported && (
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                disabled={!idle}
                onClick={() => void updater.check()}
              >
                {updateLabel(state)}
              </Button>
            )
          }
        />
      </Group>
    </>
  );
}
