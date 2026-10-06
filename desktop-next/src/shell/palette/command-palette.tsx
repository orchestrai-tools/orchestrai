import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@warpforge/ui/components/command";
import { cn } from "@warpforge/ui/lib/utils";
import { useShell } from "../../lib/shell-store";
import { PALETTE_GROUPS, usePaletteActions } from "./palette-actions";
import { QuickOpen } from "./quick-open";

/**
 * One palette, one shortcut (⌘K), every action. Each entry shows its
 * shortcut so the palette teaches the keyboard. Search is fuzzy.
 */
function ActionPalette() {
  const shell = useShell();
  const open = shell.palette && shell.paletteMode === "actions";
  const { actions, queueError } = usePaletteActions(open);
  const scope = shell.home || !shell.project ? "every project" : shell.project;
  const close = () => useShell.setState({ palette: false });

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => !next && close()}
      title="Command palette"
      description={`Actions for ${scope}, then everything else.`}
    >
      <CommandInput placeholder={`Search actions in ${scope}…`} />
      <CommandList>
        <CommandEmpty>No matching action.</CommandEmpty>
        {PALETTE_GROUPS.map((group) => {
          const items = actions.filter((action) => action.group === group);
          if (!items.length) return null;
          return (
            <CommandGroup key={group} heading={group}>
              {items.map((action) => (
                <CommandItem
                  key={`${group}:${action.id}`}
                  value={`${action.title} ${action.keywords ?? ""} ${group}:${action.id}`}
                  onSelect={() => {
                    close();
                    action.run();
                  }}
                  className={cn(action.danger && "text-destructive data-[selected=true]:text-destructive")}
                >
                  <span className="truncate">{action.title}</span>
                  {action.shortcut && <CommandShortcut>{action.shortcut}</CommandShortcut>}
                </CommandItem>
              ))}
            </CommandGroup>
          );
        })}
        {queueError && <p className="px-3 py-2 text-xs text-destructive">{queueError}</p>}
      </CommandList>
      <div className="flex items-center gap-3 border-t px-3 py-2 text-[11px] text-muted-foreground">
        <span>↑↓ to move</span>
        <span>↵ to run</span>
        <span className="ml-auto">esc to close</span>
      </div>
    </CommandDialog>
  );
}

export function CommandPalette() {
  return (
    <>
      <ActionPalette />
      <QuickOpen />
    </>
  );
}
