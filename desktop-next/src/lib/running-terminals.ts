/** Terminals already running in this project. */
export function runningTerminals<T extends { project: string; command: string }>(
  terminals: T[],
  project: string,
): T[] {
  return terminals.filter(
    (terminal) => terminal.project === project && terminal.command.trim().length > 0,
  );
}

/** A short name for a terminal's tab: the login shell the drawer opens is just "Shell". */
export function terminalLabel(command: string): string {
  const trimmed = command.trim().split("\n")[0] ?? "";
  if (!trimmed || trimmed.startsWith('exec "${SHELL')) return "Shell";
  return trimmed.split(/\s+/).slice(0, 3).join(" ");
}
