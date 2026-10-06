import { useEffect, useRef } from "react";

export interface ContextMenuEntry {
  type: "item";
  id: string;
  label: string;
  disabled?: boolean;
}

/** Open the native menu at the cursor. Outside the desktop window this does nothing. */
export async function showContextMenu(requestId: string, items: ContextMenuEntry[]): Promise<boolean> {
  if (!("__TAURI_INTERNALS__" in window)) return false;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("show_context_menu", { request: { requestId, items } });
  return true;
}

/** Run the handler for the item the native menu picked. */
export function useContextMenu(requestId: string, handlers: Map<string, () => void>): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void import("@tauri-apps/api/event").then(async ({ listen }) => {
      if (disposed) return;
      unlisten = await listen<{ requestId: string; itemId: string }>("context-menu:clicked", (event) => {
        if (event.payload.requestId !== requestId) return;
        handlersRef.current.get(event.payload.itemId)?.();
      });
      if (disposed) unlisten();
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [requestId]);
}
