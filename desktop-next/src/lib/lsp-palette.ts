import { daemon } from "@warpforge/daemon";
import type { DetectedLanguageServer } from "@warpforge/protocol";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { create } from "zustand";
import { openSettingsAt } from "./actions";
import type { PaletteAction } from "./task-palette";

/** Bumps when the palette asks the language-server list to load again. */
export const useLspRefresh = create<{ tick: number; refresh: () => void }>((set) => ({
  tick: 0,
  refresh: () => set((state) => ({ tick: state.tick + 1 })),
}));

function lastLine(output: string): string {
  const lines = output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !/A complete log of this run/.test(line));
  return lines[lines.length - 1] ?? "install failed";
}

/** Install, update, and refresh the language servers listed in settings. */
export function useLspPalette(open: boolean): PaletteAction[] {
  const [servers, setServers] = useState<DetectedLanguageServer[]>([]);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void daemon
      .detectLanguageServers()
      .then((rows) => {
        if (!cancelled) setServers(rows);
      })
      .catch(() => {
        if (!cancelled) setServers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);
  return [
    {
      id: "refresh-lsp",
      label: "Refresh language servers",
      run: () => {
        openSettingsAt("integrations");
        useLspRefresh.getState().refresh();
      },
    },
    ...servers.flatMap((server) => {
      const behind = server.status === "behind";
      if (!server.canManage || (server.installed && !behind)) return [];
      return [
        {
          id: `lsp-${server.id}`,
          label: server.installed ? `Update ${server.language}` : `Install ${server.language}`,
          run: () => {
            openSettingsAt("integrations");
            void daemon
              .installLanguageServer(server.id)
              .then((result) => {
                if (!result.ok) toast.error(lastLine(result.output));
                else
                  toast.success(
                    server.installed
                      ? `Updated ${server.language}`
                      : `Installed ${server.language}`,
                  );
                useLspRefresh.getState().refresh();
              })
              .catch((err: unknown) =>
                toast.error(err instanceof Error ? err.message : "install failed"),
              );
          },
        },
      ];
    }),
  ];
}
