import { useState } from "react"
import { Command as CommandPrimitive } from "cmdk"
import { CornerDownLeftIcon, SquareTerminalIcon } from "lucide-react"

import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import { useCurrentWorktree } from "@/components/sidebar/worktree-switcher"
import { QUICK_RUN, TERMINALS, type TerminalStatus } from "@/data/terminals"
import { useAppActions, useAppSession } from "@/lib/app-instance"
import { cn } from "@/lib/utils"

const STATUS_TONE: Record<TerminalStatus, string> = {
  starting: "bg-amber-500",
  running: "bg-emerald-500",
  exited: "bg-muted-foreground/40",
}

const GROUPS = [
  { key: "saved", heading: "Saved" },
  { key: "scripts", heading: "Package scripts" },
  { key: "history", heading: "History" },
] as const

/**
 * Daintree's QuickRun: a `$` field for shell commands only, scoped to the
 * selected worktree, with running commands listed above it. It never sends a
 * prompt to an agent; that is the composer's job.
 */
export function CommandBar() {
  const project = useAppSession((session) => session.project)
  const worktree = useCurrentWorktree()
  const { selectTerminal, toggleTerminal } = useAppActions()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState("")
  const running = TERMINALS[project].filter((terminal) => terminal.status !== "exited")

  const run = () => {
    setValue("")
    setOpen(false)
    selectTerminal(TERMINALS[project].at(-1)?.id ?? "dev")
  }

  return (
    <>
      <SidebarMenu className="hidden group-data-[collapsible=icon]:flex">
        <SidebarMenuItem>
          <SidebarMenuButton tooltip="Run command" onClick={() => toggleTerminal(true)}>
            <SquareTerminalIcon />
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>

      <div className="flex flex-col gap-1 px-1 group-data-[collapsible=icon]:hidden">
        {running.map((terminal) => (
          <button
            key={terminal.id}
            type="button"
            onClick={() => selectTerminal(terminal.id)}
            className="flex h-6 items-center gap-2 rounded-sm px-1.5 text-left font-mono text-[11px] text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
          >
            <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", STATUS_TONE[terminal.status])} />
            <span className="truncate">{terminal.blocks[0]?.command ?? terminal.title}</span>
            <span className="ml-auto shrink-0 font-sans">{terminal.status}</span>
          </button>
        ))}

        <Command className="overflow-visible bg-transparent">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverAnchor asChild>
              <label className="flex h-8 items-center gap-2 rounded-md border bg-background px-2 font-mono text-xs focus-within:ring-2 focus-within:ring-ring/50">
                <span aria-hidden className="text-muted-foreground">$</span>
                <CommandPrimitive.Input
                  value={value}
                  onValueChange={setValue}
                  onFocus={() => setOpen(true)}
                  onKeyDown={(event) => event.key === "Escape" && setOpen(false)}
                  placeholder={`Run in ${worktree.branch}`}
                  aria-label={`Run a shell command in ${worktree.branch}`}
                  className="min-w-0 flex-1 bg-transparent outline-none placeholder:font-sans placeholder:text-muted-foreground"
                />
              </label>
            </PopoverAnchor>
            <PopoverContent
              side="top"
              align="start"
              sideOffset={6}
              onOpenAutoFocus={(event) => event.preventDefault()}
              onInteractOutside={(event) => {
                if ((event.target as Element).closest("[data-command-bar]")) event.preventDefault()
              }}
              className="w-80 p-0"
            >
              <CommandList data-command-bar>
                {value && (
                  <CommandItem forceMount value={`run ${value}`} onSelect={run} className="font-mono text-xs">
                    <CornerDownLeftIcon />
                    Run <span className="truncate">{value}</span>
                  </CommandItem>
                )}
                {GROUPS.map(({ key, heading }) => (
                  <CommandGroup key={key} heading={heading}>
                    {QUICK_RUN[key].map((command) => (
                      <CommandItem key={command} value={command} onSelect={run} className="font-mono text-xs">
                        {command}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ))}
              </CommandList>
            </PopoverContent>
          </Popover>
        </Command>
      </div>
    </>
  )
}
