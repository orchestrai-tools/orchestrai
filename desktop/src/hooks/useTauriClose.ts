import { useEffect, useRef, useState } from "react";

import { daemon } from "@/daemon";

/** How long the daemon check waits before a quit leaves anyway. */
const QUIT_CHECK_TIMEOUT_MS = 3_000;
/**
 * The confirmed quit stops whole service process trees, so it gets longer. The
 * Rust side waits at least this long before killing the daemon.
 */
const QUIT_RPC_TIMEOUT_MS = 15_000;

/**
 * A quit already under way, parked on `window` so a hot reload's stale listener
 * and the fresh one agree. Without it, each generation refuses the close on
 * behalf of its own private flag and the window cannot be closed at all.
 */
const QUITTING = "__warpforgeQuitting";

function isQuitting(): boolean {
  return (window as unknown as Record<string, unknown>)[QUITTING] === true;
}

/**
 * A quit that is waiting on an answer, because something is still running.
 * The window has already refused to close; nothing happens until `confirm`.
 */
export interface PendingQuit {
  /** One line per thing a quit would stop, from `app.quitCheck`. */
  blockers: string[];
  confirm: () => Promise<void>;
  cancel: () => void;
}

/** Resolve `null` instead of hanging if `promise` does not settle in time. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise.catch(() => null),
    new Promise<null>((resolve) => window.setTimeout(() => resolve(null), ms)),
  ]);
}

/**
 * One quit path for the window's close button, ⌘Q and Dock → Quit. It asks
 * `app.quitCheck`; nothing running quits at once, otherwise the blockers come
 * out as a dialog. The final exit is the Rust `quit_app` command.
 */
export function useTauriClose(): PendingQuit | null {
  const [pending, setPending] = useState<string[] | null>(null);
  // Whether the daemon may be shut down is known only once the check answers,
  // and the dialog's confirm runs later — so it travels in a ref.
  const ownedRef = useRef(false);
  const quitRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) {
      return;
    }

    let disposed = false;
    let unlistenWindow: (() => void) | undefined;
    let unlistenEvent: (() => void) | undefined;

    void Promise.all([
      import("@tauri-apps/api/window"),
      import("@tauri-apps/api/event"),
      import("@tauri-apps/api/core"),
    ])
      .then(async ([{ getCurrentWindow }, { listen }, { invoke }]) => {
        if (disposed) {
          return;
        }

        const quit = async () => {
          (window as unknown as Record<string, unknown>)[QUITTING] = true;
          try {
            if (ownedRef.current) {
              await withTimeout(daemon.quitRuntime(), QUIT_RPC_TIMEOUT_MS);
            }
            await invoke("quit_app");
          } catch (error) {
            // The quit did not go through; let the next close request try again.
            delete (window as unknown as Record<string, unknown>)[QUITTING];
            throw error;
          }
        };
        quitRef.current = quit;

        const handle = async (event?: { preventDefault?: () => void }) => {
          if (isQuitting()) {
            return;
          }
          event?.preventDefault?.();
          // The shell stands its no-answer fallback down once the UI has it.
          void invoke("quit_ui_ready");

          const check = await withTimeout(daemon.quitCheck(), QUIT_CHECK_TIMEOUT_MS);
          ownedRef.current = check?.owned ?? false;
          if (!check || check.blockers.length === 0) {
            await quit().catch(() => {});
            return;
          }
          setPending(check.blockers);
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
          unlistenWindow = undefined;
          unlistenEvent = undefined;
        }
      })
      .catch(() => {});

    return () => {
      disposed = true;
      quitRef.current = null;
      unlistenWindow?.();
      unlistenEvent?.();
    };
  }, []);

  if (!pending) return null;
  return {
    blockers: pending,
    // No `setPending(null)` on the way out: the app is quitting, and a dialog
    // that clears itself first would flash the app back into view.
    confirm: async () => {
      await quitRef.current?.();
    },
    cancel: () => setPending(null),
  };
}
