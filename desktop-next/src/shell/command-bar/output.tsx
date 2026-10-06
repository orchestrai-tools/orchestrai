import type { TerminalInfo } from "@warpforge/protocol";
import { XIcon } from "lucide-react";

import { terminalLabel } from "../../lib/running-terminals";
import { useShell } from "../../lib/shell-store";
import { useCommandRun } from "./run-store";

/** Commands still running in a terminal tab; a click opens that tab. */
export function RunningTerminals({ terminals }: { terminals: TerminalInfo[] }) {
  const openTerminal = useShell((state) => state.openTerminal);
  return terminals.map((terminal) => (
    <button
      key={terminal.id}
      type="button"
      onClick={() => openTerminal(terminal.id)}
      className="flex h-6 items-center gap-2 rounded-sm px-1.5 text-left font-mono text-[11px] text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
    >
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-emerald-500" />
      <span className="truncate">{terminalLabel(terminal.command)}</span>
      <span className="ml-auto shrink-0 font-sans">running</span>
    </button>
  ));
}

/** The last command's exit code and output, with a way into a terminal when it ran out of time. */
export function RunOutput() {
  const result = useCommandRun((state) => state.result);
  const dismiss = useCommandRun((state) => state.dismiss);
  const execute = useCommandRun((state) => state.execute);
  if (!result) return null;
  return (
    <div className="relative rounded-md border bg-background">
      <div className="flex items-center gap-2 border-b px-2 py-1 font-mono text-[11px]">
        <span className="truncate" title={result.cwd ? `Ran in ${result.cwd}` : undefined}>
          $ {result.command}
        </span>
        {result.code != null && (
          <span
            className={
              result.code === 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
            }
          >
            exit {result.code}
          </span>
        )}
        <button
          type="button"
          aria-label="Dismiss output"
          onClick={dismiss}
          className="ml-auto text-muted-foreground hover:text-foreground"
        >
          <XIcon className="size-3" />
        </button>
      </div>
      {result.cwd && (
        <p
          className="truncate border-b px-2 py-0.5 font-mono text-[10px] text-muted-foreground"
          title={result.cwd}
        >
          {result.cwd}
        </p>
      )}
      <pre className="max-h-32 overflow-auto px-2 py-1 font-mono text-[11px] whitespace-pre-wrap text-muted-foreground">
        {result.text}
      </pre>
      {result.timedOut && (
        <button
          type="button"
          onClick={() => void execute(result.command, "terminal", result.context)}
          className="w-full border-t px-2 py-1 text-left text-[11px] text-foreground hover:bg-muted"
        >
          Run in a terminal instead
        </button>
      )}
    </div>
  );
}
