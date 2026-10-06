import { useId, useState } from "react"
import { TriangleAlertIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover"
import { Switch } from "@/components/ui/switch"
import { RANGE_SOURCE_HINT, RANGE_SOURCE_LABEL, RUNTIMES, type ProjectRuntime } from "@/data/services"
import type { ProjectId } from "@/lib/projects"
import { parseRange, useRuntimeStore } from "@/pages/services/runtime-store"
import { Notice } from "@/pages/services/status"

/** Writes a machine-local range (`portRangeOverride` in the registry); the team's file is never touched. */
export function RangeForm({ project, onDone }: { project: ProjectId; onDone?: () => void }) {
  const [value, setValue] = useState("")
  const [error, setError] = useState<string | null>(null)
  const apply = () => {
    const parsed = parseRange(value)
    if (typeof parsed === "string") return setError(parsed)
    useRuntimeStore.getState().setLocalRange(project, parsed)
    setValue("")
    onDone?.()
  }
  return (
    <form
      className="flex flex-col gap-1.5"
      onSubmit={(event) => {
        event.preventDefault()
        apply()
      }}
    >
      <div className="flex items-center gap-2">
        <Input
          value={value}
          onChange={(event) => {
            setValue(event.target.value)
            setError(null)
          }}
          placeholder="e.g. 4500-4599"
          aria-label="Port range for this machine"
          aria-invalid={error !== null}
          className="h-7 w-36 font-mono text-xs md:text-xs"
        />
        <Button type="submit" size="sm" className="text-xs">
          Set on this machine
        </Button>
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </form>
  )
}

export function RangeConflict({ project, runtime }: { project: ProjectId; runtime: ProjectRuntime }) {
  const { start, end, conflictWith } = runtime.range
  if (!conflictWith) return null
  return (
    <div role="alert" className="mx-4 mb-3 flex flex-col gap-2 rounded-md border border-red-500/30 px-3 py-2.5">
      <p className="text-sm font-medium text-red-600 dark:text-red-400">Port range conflict with {conflictWith}</p>
      <p className="text-xs text-muted-foreground">
        Both projects declare ports {start}–{end} in their team config, so services here refuse to start instead of taking {conflictWith}'s
        ports. Pick another block for this machine. The shared config stays as it is.
      </p>
      <RangeForm project={project} />
    </div>
  )
}

export function LocalConfigError({ runtime }: { runtime: ProjectRuntime }) {
  if (!runtime.localError) return null
  return (
    <div className="mx-4 mb-3">
      <Notice tone="warn">
        <TriangleAlertIcon className="mt-px size-3.5 shrink-0" />
        <span>
          Your local config (<span className="font-mono">{runtime.localFile}</span>) has an error and is ignored, so this shows the shared
          config only: <span className="font-mono">{runtime.localError}</span>
        </span>
      </Notice>
    </div>
  )
}

export function PortRangeFooter({ project, runtime }: { project: ProjectId; runtime: ProjectRuntime }) {
  const [open, setOpen] = useState(false)
  const switchId = useId()
  const { range, autoStart } = runtime
  const size = range.end - range.start + 1
  const used = runtime.services.filter((svc) => svc.port >= range.start && svc.port <= range.end).length
  const declared = RUNTIMES[project].range.source === "declared"

  return (
    <div className="flex flex-col gap-3 border-t px-4 py-3 text-xs">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-medium tabular-nums">
            Ports {range.start}–{range.end}
          </p>
          <p className="text-muted-foreground" title={RANGE_SOURCE_HINT[range.source]}>
            {RANGE_SOURCE_LABEL[range.source]} · {used} of {size} in use
          </p>
        </div>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="xs" className="text-xs">
              Change
            </Button>
          </PopoverTrigger>
          <PopoverContent side="top" align="end" className="w-80">
            <PopoverHeader>
              <PopoverTitle>Port range on this machine</PopoverTitle>
              <PopoverDescription className="text-xs">
                {declared
                  ? "Overrides the team's ports.range here only. To move it for everyone, edit ports.range in the workspace file."
                  : "Replaces the automatic assignment here only. Each project gets its own block of 100 ports from 4000 up."}
              </PopoverDescription>
            </PopoverHeader>
            <RangeForm project={project} onDone={() => setOpen(false)} />
            {range.source === "local-override" && (
              <Button variant="outline" size="sm" className="self-start text-xs" onClick={() => useRuntimeStore.getState().setLocalRange(project, null)}>
                Clear override
              </Button>
            )}
          </PopoverContent>
        </Popover>
      </div>
      <div className="flex items-start gap-3">
        <label htmlFor={switchId} className="min-w-0 flex-1">
          <span className="block font-medium">Start when the project opens</span>
          <span className="block text-muted-foreground">Starts every service in dependency order.</span>
        </label>
        <Switch id={switchId} size="sm" checked={autoStart} onCheckedChange={(on) => useRuntimeStore.getState().setAutoStart(project, on)} />
      </div>
    </div>
  )
}
