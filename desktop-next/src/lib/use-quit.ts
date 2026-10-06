import { daemon } from "@warpforge/daemon";
import { useEffect, useRef, useState } from "react";

const QUIT_CHECK_TIMEOUT_MS = 3_000;
const QUIT_RPC_TIMEOUT_MS = 15_000;
const QUITTING = "__orchestraiQuitting";

function isQuitting(): boolean {
  return (window as unknown as Record<string, unknown>)[QUITTING] === true;
}

export interface PendingQuit {
  blockers: string[];
  confirm: () => Promise<void>;
  cancel: () => void;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise.catch(() => null),
    new Promise<null>((resolve) => window.setTimeout(() => resolve(null), ms)),
  ]);
}

let askQuit: (() => void) | null = null;

/** The palette and ⌘Q ask the desktop quit path. False when this window cannot quit. */
export function requestQuit(): boolean {
  if (!askQuit) return false;
  askQuit();
  return true;
}

/** Close, ⌘Q, and Dock → Quit share one path: ask what is running, then quit. */
export function useTauriClose(): PendingQuit | null {
  const [pending, setPending] = useState<string[] | null>(null);
  const ownedRef = useRef(false);
  const quitRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    let disposed = false;
    let unlistenWindow: (() => void) | undefined;
    let unlistenEvent: (() => void) | undefined;

    void Promise.all([
      import("@tauri-apps/api/window"),
      import("@tauri-apps/api/event"),
      import("@tauri-apps/api/core"),
    ])
      .then(async ([{ getCurrentWindow }, { listen }, { invoke }]) => {
        if (disposed) return;
        const quit = async () => {
          (window as unknown as Record<string, unknown>)[QUITTING] = true;
          try {
            if (ownedRef.current) await withTimeout(daemon.quitRuntime(), QUIT_RPC_TIMEOUT_MS);
            await invoke("quit_app");
          } catch (error) {
            delete (window as unknown as Record<string, unknown>)[QUITTING];
            throw error;
          }
        };
        quitRef.current = quit;
        const handle = async (event?: { preventDefault?: () => void }) => {
          if (isQuitting()) return;
          event?.preventDefault?.();
          void invoke("quit_ui_ready");
          const check = await withTimeout(daemon.quitCheck(), QUIT_CHECK_TIMEOUT_MS);
          ownedRef.current = check?.owned ?? false;
          if (!check || check.blockers.length === 0) {
            await quit().catch(() => {});
            return;
          }
          setPending(check.blockers);
        };
        askQuit = () => {
          void handle();
        };
        unlistenWindow = await getCurrentWindow().onCloseRequested((event) => {
          void handle(event);
        });
        unlistenEvent = await listen("app:quit-requested", () => {
          void handle();
        });
        if (disposed) {
          unlistenWindow();
          unlistenEvent();
        }
      })
      .catch(() => {});

    return () => {
      disposed = true;
      quitRef.current = null;
      askQuit = null;
      unlistenWindow?.();
      unlistenEvent?.();
    };
  }, []);

  if (!pending) return null;
  return {
    blockers: pending,
    confirm: async () => {
      await quitRef.current?.();
    },
    cancel: () => setPending(null),
  };
}
