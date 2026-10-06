import { toast } from "sonner";

import type { PaletteAction } from "./task-palette";
import { syncTrackers, trackerSyncMessage } from "./tracker-sync";

/** Import the project's new tracker issues and pull status for every linked work item. */
export function trackerPaletteActions(project: string): PaletteAction[] {
  return [
    {
      id: "sync-tracker",
      label: "Sync tracker issues",
      run: () => {
        void syncTrackers(project)
          .then((result) => toast.success(trackerSyncMessage(result)))
          .catch((err: unknown) =>
            toast.error(err instanceof Error ? err.message : "Could not sync"),
          );
      },
    },
  ];
}
