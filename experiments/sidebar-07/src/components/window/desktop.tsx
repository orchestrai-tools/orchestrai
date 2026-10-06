import { Button } from "@/components/ui/button"
import { APPS } from "@/lib/apps"
import { cn } from "@/lib/utils"
import { useWindowStore } from "@/lib/window-store"

/**
 * The emulated desktop behind the app windows: wallpaper and a dock with
 * one tile per app. A tile shows its window (restoring or reopening it) and
 * brings it to the front; the dot under it marks a running app.
 */
export function Desktop({ dock = true }: { dock?: boolean }) {
  const sessions = useWindowStore((state) => state.sessions)
  const setWindowState = useWindowStore((state) => state.setWindowState)
  const nothingOnScreen = APPS.every(({ id }) => sessions[id].state !== "normal")

  return (
    <div className="fixed inset-0 z-0 flex flex-col items-center justify-center bg-linear-to-br from-sky-200 via-indigo-100 to-rose-100 dark:from-slate-900 dark:via-indigo-950 dark:to-slate-950">
      {nothingOnScreen && (
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-sm text-muted-foreground">No windows open.</p>
          <div className="flex gap-2">
            {APPS.map(({ id, name }) => (
              <Button key={id} variant="outline" onClick={() => setWindowState(id, "normal")}>
                Open {name}
              </Button>
            ))}
          </div>
        </div>
      )}

      {dock && (
        <nav
          aria-label="Dock"
          className="absolute bottom-3 flex items-end gap-2 rounded-2xl border border-white/40 bg-white/40 p-2 shadow-lg backdrop-blur-xl dark:border-white/10 dark:bg-white/10"
        >
          {APPS.map(({ id, name, icon: Icon, tile }) => {
            const running = sessions[id].state !== "closed"
            return (
              <button
                key={id}
                type="button"
                onClick={() => setWindowState(id, "normal")}
                aria-label={running ? `Show ${name}` : `Open ${name}`}
                title={name}
                className={cn(
                  "relative flex size-12 items-center justify-center rounded-xl shadow-md transition-transform outline-none hover:-translate-y-1 focus-visible:ring-2 focus-visible:ring-ring",
                  tile
                )}
              >
                <Icon className="size-6" />
                {running && (
                  <span aria-hidden className="absolute -bottom-1.5 size-1 rounded-full bg-foreground/70" />
                )}
              </button>
            )
          })}
        </nav>
      )}
    </div>
  )
}
