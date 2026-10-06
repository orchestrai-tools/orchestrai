import { daemon } from "@warpforge/daemon";
import type { TerminalInfo } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import { cn } from "@warpforge/ui/lib/utils";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";

import "@xterm/xterm/css/xterm.css";
import { ChevronDownIcon, ChevronUpIcon, PlusIcon, XIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { useAppearance } from "../lib/appearance";
import { terminalLabel } from "../lib/running-terminals";
import { useShell } from "../lib/shell-store";
import { useDaemon } from "../lib/use-daemon";

const NO_TERMINALS: TerminalInfo[] = [];

/** xterm only parses hex and rgb, so resolve a theme token through the canvas. */
function cssColor(token: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  if (!value) return fallback;
  const context = document.createElement("canvas").getContext("2d");
  if (!context) return fallback;
  context.fillStyle = fallback;
  context.fillStyle = value;
  return context.fillStyle;
}

function useProjectTerminals() {
  const project = useShell((state) => state.project);
  const terminalId = useShell((state) => state.terminalId);
  const open = useShell((state) => state.terminal);
  const all = useDaemon().snapshot.terminals ?? NO_TERMINALS;
  const sessions = all.filter((terminal) => terminal.project === project);
  const active = sessions.find((terminal) => terminal.id === terminalId) ?? sessions[0];
  return { project, sessions, active, open };
}

function label(terminal: TerminalInfo): string {
  return terminalLabel(terminal.command);
}

/**
 * When each project last asked for a shell. The drawer opens before the new
 * terminal reaches the snapshot, and must not start another in that gap.
 */
const spawnedAt = new Map<string, number>();
const SPAWN_GRACE_MS = 10_000;

function spawning(project: string): boolean {
  return Date.now() - (spawnedAt.get(project) ?? 0) < SPAWN_GRACE_MS;
}

async function newTerminal(project: string | null) {
  if (!project) return;
  spawnedAt.set(project, Date.now());
  try {
    const id = await daemon.spawnTerminal(project, 100, 24);
    if (id) useShell.getState().openTerminal(id);
    else spawnedAt.delete(project);
  } catch (err) {
    spawnedAt.delete(project);
    toast.error(err instanceof Error ? err.message : "Could not start a terminal");
  }
}

/** The terminal itself, shown above the strip while the drawer is open. */
export function TerminalPanel() {
  const { project, active } = useProjectTerminals();
  const themeId = useAppearance((state) => state.themeId);
  const monoSize = useAppearance((state) => state.monoFontSize);
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!project) return;
    if (active) spawnedAt.delete(project);
    else if (!spawning(project)) void newTerminal(project);
  }, [active, project]);

  useEffect(() => {
    if (!active || !host.current) return;
    const term = new Terminal({
      fontSize: monoSize,
      fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
      cursorBlink: true,
      theme: {
        background: cssColor("--background", "#ffffff"),
        foreground: cssColor("--foreground", "#111111"),
        cursor: cssColor("--foreground", "#111111"),
        selectionBackground: cssColor("--accent", "#dddddd"),
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host.current);
    const id = active.id;
    const stop = daemon.subscribeTerminalData(id, (bytes) => term.write(bytes));
    const input = term.onData((data) =>
      daemon.sendTerminalInput(id, new TextEncoder().encode(data)),
    );
    const resize = term.onResize(({ cols, rows }) => daemon.resizeTerminal(id, cols, rows));
    const element = host.current;
    let disposed = false;
    // Fitting a disposed terminal, or one in a collapsed drawer, throws inside xterm.
    const refit = () => {
      if (!disposed && element.clientWidth > 0 && element.clientHeight > 0) fit.fit();
    };
    const observer = new ResizeObserver(refit);
    observer.observe(element);
    refit();
    term.focus();
    return () => {
      disposed = true;
      observer.disconnect();
      input.dispose();
      resize.dispose();
      stop();
      // xterm queues a scroll-area sync on open; disposing first makes that timer throw.
      setTimeout(() => term.dispose(), 0);
    };
  }, [active?.id, themeId, monoSize]);

  return (
    <div className="flex h-full flex-col bg-background">
      {active ? (
        <div ref={host} className="min-h-0 flex-1 px-3 py-1" />
      ) : (
        <p className="p-4 font-mono text-xs text-muted-foreground">
          Starting a shell in {project}…
        </p>
      )}
    </div>
  );
}

function StripTab({ terminal, selected }: { terminal: TerminalInfo; selected: boolean }) {
  const shell = useShell();
  return (
    <div
      className={cn(
        "group/strip flex h-full max-w-56 items-center border-r",
        selected ? "bg-background text-foreground" : "text-muted-foreground hover:bg-foreground/5",
      )}
    >
      <button
        type="button"
        role="tab"
        aria-selected={selected}
        onClick={() => (selected ? shell.toggle("terminal") : shell.openTerminal(terminal.id))}
        className="flex h-full min-w-0 items-center gap-1.5 pr-1 pl-3 text-[11px] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-emerald-500" />
        <span className="truncate font-mono">{label(terminal)}</span>
        <span className="text-muted-foreground">{terminal.taskId ? "task" : "running"}</span>
      </button>
      <button
        type="button"
        aria-label={`Stop ${label(terminal)}`}
        onClick={() => void daemon.killTerminal(terminal.id)}
        className="mr-1 rounded-sm p-0.5 opacity-0 group-hover/strip:opacity-100 hover:bg-foreground/10 focus-visible:opacity-100"
      >
        <XIcon className="size-3" />
      </button>
    </div>
  );
}

/**
 * The drawer strip: about 28 px, one tab per terminal with its status, always
 * visible at the bottom so a running server is a mark at the edge.
 */
export function TerminalStrip() {
  const { project, sessions, active, open } = useProjectTerminals();
  const toggle = useShell((state) => state.toggle);

  return (
    <div
      role="tablist"
      aria-label="Terminals"
      className="flex h-7 shrink-0 items-stretch border-t bg-muted/50"
    >
      {sessions.map((terminal) => (
        <StripTab
          key={terminal.id}
          terminal={terminal}
          selected={open && terminal.id === active?.id}
        />
      ))}
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="New terminal"
        onClick={() => void newTerminal(project)}
        className="m-auto mx-1 rounded-sm"
      >
        <PlusIcon />
      </Button>
      <span className="ml-auto flex items-center px-2 text-[11px] text-muted-foreground">
        {sessions.length ? `${sessions.length} running` : "Nothing running"}
      </span>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={open ? "Close terminal drawer" : "Open terminal drawer"}
        title="Toggle terminal drawer (⌃`)"
        onClick={() => toggle("terminal")}
        className="m-auto mr-1 rounded-sm"
      >
        {open ? <ChevronDownIcon /> : <ChevronUpIcon />}
      </Button>
    </div>
  );
}
