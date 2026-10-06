import { useState } from "react"

import { MarkdownPage } from "@/components/common/markdown"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"

type Mode = "read" | "split" | "edit"

/**
 * The plan is a markdown page: read it rendered, or edit the source beside a
 * preview that follows as you type (Zed's synced preview). Only this page
 * re-renders while typing.
 */
export function MarkdownEditor({ initial, label }: { initial: string; label: string }) {
  const [source, setSource] = useState(initial)
  const [mode, setMode] = useState<Mode>("read")

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          spacing={0}
          value={mode}
          onValueChange={(next) => next && setMode(next as Mode)}
          aria-label="Plan view"
          className="ml-auto"
        >
          <ToggleGroupItem value="read" className="px-2.5 text-xs">Read</ToggleGroupItem>
          <ToggleGroupItem value="split" className="px-2.5 text-xs">Split</ToggleGroupItem>
          <ToggleGroupItem value="edit" className="px-2.5 text-xs">Edit</ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div className={cn("grid min-h-0 gap-4", mode === "split" && "grid-cols-2")}>
        {mode !== "read" && (
          <textarea
            aria-label={`${label} source`}
            value={source}
            onChange={(event) => setSource(event.target.value)}
            spellCheck={false}
            className="min-h-96 w-full resize-none rounded-md border bg-muted/30 p-3 font-mono text-xs leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          />
        )}
        {mode !== "edit" && <MarkdownPage markdown={source} className="max-w-[68ch]" />}
      </div>
    </div>
  )
}
