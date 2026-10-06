import { toast } from "sonner";

/** Show a project path in the system file manager, or open it with the default app. */
export async function revealPath(relative: string, root: string | undefined, inDir: boolean): Promise<void> {
  if (!("__TAURI_INTERNALS__" in window) || !root) {
    toast.info("Reveal and Open in the default app work in the desktop window");
    return;
  }
  const absolute = `${root.replace(/\/+$/, "")}/${relative}`;
  const { openPath, revealItemInDir } = await import("@tauri-apps/plugin-opener");
  if (inDir) await revealItemInDir(absolute);
  else await openPath(absolute);
}
