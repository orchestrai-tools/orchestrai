import { useMemo } from "react"

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command"
import { useActionContext } from "@/hooks/use-action-context"
import { ACTION_GROUPS, buildActions, buildHomeActions } from "@/lib/actions"
import { useAppSession } from "@/lib/app-instance"
import { useDialog } from "@/lib/dialog-store"
import { findProject } from "@/lib/projects"
import { cn } from "@/lib/utils"

/**
 * One palette, one shortcut (⌘K), every action. Each entry shows its
 * shortcut so the palette teaches the keyboard (Superhuman). Search is fuzzy.
 */
export function CommandPalette() {
  const { current, close } = useDialog()
  const project = useAppSession((session) => session.project)
  const home = useAppSession((session) => session.home)
  const ctx = useActionContext()
  const open = current === "palette"
  // Rebuilt each time the palette opens, so it reflects sessions forked or agents installed since.
  const actions = useMemo(() => (!open ? [] : home ? buildHomeActions() : buildActions(project)), [open, home, project])
  const scope = home ? "every project" : findProject(project).name

  return (
    <CommandDialog
      open={open}
      onOpenChange={(open) => !open && close()}
      title="Command palette"
      description={`Actions for ${scope}, then everything else.`}
    >
      <CommandInput placeholder={`Search actions in ${scope}…`} />
      <CommandList>
        <CommandEmpty>No matching action.</CommandEmpty>
        {ACTION_GROUPS.map((group) => {
          const items = actions.filter((action) => action.group === group)
          if (!items.length) return null
          return (
            <CommandGroup key={group} heading={group}>
              {items.map(({ id, title, icon: Icon, shortcut, keywords, danger, run }) => (
                <CommandItem
                  key={id}
                  value={`${title} ${keywords ?? ""}`}
                  onSelect={() => {
                    close()
                    run(ctx)
                  }}
                  className={cn(danger && "text-destructive data-[selected=true]:text-destructive")}
                >
                  {Icon ? <Icon /> : <span className="size-4" />}
                  <span className="truncate">{title}</span>
                  {shortcut && <CommandShortcut>{shortcut}</CommandShortcut>}
                </CommandItem>
              ))}
            </CommandGroup>
          )
        })}
      </CommandList>
      <div className="flex items-center gap-3 border-t px-3 py-2 text-[11px] text-muted-foreground">
        <span>↑↓ to move</span>
        <span>↵ to run</span>
        <span className="ml-auto">esc to close</span>
      </div>
    </CommandDialog>
  )
}
