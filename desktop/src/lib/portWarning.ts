import type { PortWarning } from "../protocol";

/**
 * The user-facing sentence for a service that ignores its allocated port.
 * @param warning - The warning reported by the daemon.
 * @returns The message shown on the service row and detail pane.
 */
export function portWarningText(warning: PortWarning): string {
  const fix = "pass $PORT to its command, e.g. `--port $PORT`";
  return warning.announced
    ? `Listening on ${warning.announced}, not ${warning.expected} — ${fix}`
    : `Nothing answers on port ${warning.expected} — ${fix}`;
}
