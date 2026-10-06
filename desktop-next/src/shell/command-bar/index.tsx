import {
  Command,
  CommandField,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@warpforge/ui/components/command";
import { Popover, PopoverAnchor, PopoverContent } from "@warpforge/ui/components/popover";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@warpforge/ui/components/sidebar";
import { BookmarkIcon, CornerDownLeftIcon, SquareTerminalIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { runningTerminals } from "../../lib/running-terminals";
import { readSaved, toggleSaved } from "../../lib/shell-commands";
import { fileTaskId, useShell } from "../../lib/shell-store";
import { useDaemon } from "../../lib/use-daemon";
import { barGroups, runPlace, searchText, type BarItem } from "./model";
import { RunOutput, RunningTerminals } from "./output";
import { RunDialog } from "./run-dialog";
import { useCommandRun } from "./run-store";

function ItemRow({ item }: { item: BarItem }) {
  const c = item.command;
  const label = c ? (c.source === "just" ? c.name : c.command) : item.line;
  return (
    <>
      <span className="truncate">{label}</span>
      {c?.isDefault && <span className="shrink-0 font-sans text-[10px] text-muted-foreground">default</span>}
      {c?.aliases?.length ? (
        <span className="shrink-0 text-[10px] text-muted-foreground">{c.aliases.join(" ")}</span>
      ) : null}
      {c?.description && (
        <span className="min-w-0 truncate font-sans text-muted-foreground">{c.description}</span>
      )}
      {runPlace(c, false) === "terminal" && (
        <SquareTerminalIcon
          aria-label="Opens in a terminal"
          className="ml-auto shrink-0 text-muted-foreground"
        />
      )}
    </>
  );
}

/**
 * A `$` field for shell commands only, scoped to the selected worktree: the
 * project's just recipes, package scripts, and Makefile targets, plus saved and
 * recent lines. It never sends a prompt to an agent.
 */
export function CommandBar() {
  const shell = useShell();
  const state = useDaemon();
  const project = shell.project ?? "";
  const taskId = fileTaskId(shell, state.snapshot.tasks);
  const where = state.snapshot.tasks.find((task) => task.id === taskId)?.title || "the checkout";
  const running = runningTerminals(state.snapshot.terminals, project);
  const { detected, loadError, history, busy, load, choose, execute } = useCommandRun();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState<string[]>([]);
  const field = useRef<HTMLInputElement>(null);
  const shift = useRef(false);
  const sidebar = useSidebar();

  useEffect(() => {
    setSaved(project ? readSaved(project) : []);
    if (project) load();
  }, [project, taskId, load]);

  useEffect(() => {
    if (!open) return;
    const track = (event: KeyboardEvent) => {
      shift.current = event.shiftKey;
    };
    window.addEventListener("keydown", track);
    window.addEventListener("keyup", track);
    return () => {
      window.removeEventListener("keydown", track);
      window.removeEventListener("keyup", track);
    };
  }, [open]);

  if (!project) return null;

  const pick = (item: BarItem) => {
    setOpen(false);
    setValue("");
    choose(item, shift.current);
  };
  const groups = barGroups(saved, detected, history);
  const notes = [
    ...(detected?.errors ?? []).map((note) => ({ ...note, error: true })),
    ...(detected?.hints ?? []).map((note) => ({ ...note, error: false })),
  ];

  return (
    <>
      <SidebarMenu className="hidden group-data-[collapsible=icon]:flex">
        <SidebarMenuItem>
          <SidebarMenuButton
            tooltip="Run command"
            aria-label="Run command"
            onClick={() => {
              sidebar.setOpen(true);
              requestAnimationFrame(() => field.current?.focus());
            }}
          >
            <SquareTerminalIcon />
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>

      <div className="flex flex-col gap-1 px-1 group-data-[collapsible=icon]:hidden">
        <RunningTerminals terminals={running} />
        <RunOutput />

        <Command
          className="overflow-visible bg-transparent"
          shouldFilter
          filter={(text, search) => (text.toLowerCase().includes(search.trim().toLowerCase()) ? 1 : 0)}
        >
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverAnchor asChild>
              <label className="flex h-8 items-center gap-2 rounded-md border bg-background px-2 font-mono text-xs focus-within:ring-2 focus-within:ring-ring/50">
                <span aria-hidden className="text-muted-foreground">
                  $
                </span>
                <CommandField
                  ref={field}
                  value={value}
                  disabled={busy}
                  onValueChange={(next) => {
                    setValue(next);
                    setOpen(true);
                  }}
                  onFocus={() => {
                    setOpen(true);
                    load();
                  }}
                  onClick={() => setOpen(true)}
                  onKeyDown={(event) => {
                    shift.current = event.shiftKey;
                    if (event.key === "Escape") setOpen(false);
                  }}
                  placeholder={busy ? "Running…" : `Run in ${where}`}
                  aria-label={`Run a shell command in ${where}`}
                  className="min-w-0 flex-1 bg-transparent outline-none placeholder:font-sans placeholder:text-muted-foreground"
                />
                {value.trim() && (
                  <button
                    type="button"
                    aria-label={saved.includes(value.trim()) ? "Forget command" : "Save command"}
                    title={saved.includes(value.trim()) ? "Forget command" : "Save command"}
                    onClick={() => setSaved(toggleSaved(project, value))}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <BookmarkIcon
                      className={saved.includes(value.trim()) ? "size-3.5 fill-current" : "size-3.5"}
                    />
                  </button>
                )}
              </label>
            </PopoverAnchor>
            <PopoverContent
              side="top"
              align="start"
              sideOffset={6}
              onOpenAutoFocus={(event) => event.preventDefault()}
              onInteractOutside={(event) => {
                if ((event.target as Element).closest("[data-command-bar]")) event.preventDefault();
              }}
              className="w-96 p-0"
            >
              <CommandList data-command-bar className="max-h-80">
                {value.trim() && (
                  <CommandItem
                    forceMount
                    value={`run ${value}`}
                    onSelect={() => {
                      setOpen(false);
                      setValue("");
                      void execute(value, shift.current ? "terminal" : "here");
                    }}
                    className="font-mono text-xs"
                  >
                    <CornerDownLeftIcon />
                    Run <span className="truncate">{value}</span>
                  </CommandItem>
                )}
                {groups.map(({ heading, items }) => (
                  <CommandGroup key={heading} heading={heading}>
                    {items.map((item) => (
                      <CommandItem
                        key={item.key}
                        value={`${item.key} ${searchText(item)}`}
                        onMouseDown={(event) => {
                          shift.current = event.shiftKey;
                        }}
                        onSelect={() => pick(item)}
                        className="gap-2 font-mono text-xs"
                      >
                        <ItemRow item={item} />
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ))}
              </CommandList>
              <div data-command-bar className="flex flex-col gap-0.5 border-t px-2 py-1.5 text-[11px] text-muted-foreground">
                {loadError && <p className="text-destructive">{loadError}</p>}
                {notes.map((note) => (
                  <p key={`${note.source}-${note.message}`} className={note.error ? "text-destructive" : undefined}>
                    {note.source === "npm" ? "package.json" : note.source === "make" ? "Makefile" : "justfile"}:{" "}
                    {note.message}
                  </p>
                ))}
                <p>Long-running commands open in a terminal. ⇧↵ runs it the other way.</p>
              </div>
            </PopoverContent>
          </Popover>
        </Command>
      </div>
      <RunDialog />
    </>
  );
}
