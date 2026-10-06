import { XIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { useToast } from "@/pages/changes/toast-store"

/** Sits over the bottom of the page for a few seconds; the page under it never moves. */
export function PageToast() {
  const toast = useToast((store) => store.toast)
  const dismiss = useToast((store) => store.dismiss)
  if (!toast) return null
  return (
    <div
      role="status"
      className={cn(
        "absolute bottom-4 left-1/2 z-10 flex max-w-[min(36rem,90%)] -translate-x-1/2 items-center gap-2 rounded-md px-3 py-1.5 text-xs shadow-md",
        toast.tone === "error" ? "bg-red-600 text-white" : "bg-foreground text-background"
      )}
    >
      <span className="truncate">{toast.text}</span>
      <button type="button" aria-label="Dismiss" onClick={dismiss} className="opacity-70 hover:opacity-100">
        <XIcon className="size-3.5" />
      </button>
    </div>
  )
}
