import { useShell } from "../lib/shell-store";
import { useProjectMarks } from "./project-marks";

/**
 * In focus mode, anything that genuinely needs the person still gets through
 * as a quiet mark at the edge, not a dialog.
 */
export function FocusEdge() {
  const shell = useShell();
  const { marks, waiting: everywhere } = useProjectMarks();
  const home = shell.home || !shell.project;
  const waiting = home ? everywhere : (marks.get(shell.project ?? "")?.waiting ?? 0);
  const openWaiting = () => {
    shell.toggle("focus");
    if (shell.project) {
      shell.openProject(shell.project);
      shell.setPage("inbox");
    }
  };

  return (
    <div className="pointer-events-none absolute right-3 bottom-3 z-20 flex items-center gap-2 text-[11px] text-muted-foreground">
      {waiting > 0 && (
        <button
          type="button"
          onClick={openWaiting}
          className="pointer-events-auto flex items-center gap-1.5 rounded-full border bg-background/90 px-2 py-0.5 shadow-xs hover:text-foreground"
        >
          <span aria-hidden className="size-1.5 rounded-full bg-amber-500" />
          {waiting} need you
        </button>
      )}
      <button
        type="button"
        onClick={() => shell.toggle("focus")}
        className="pointer-events-auto rounded-full border bg-background/90 px-2 py-0.5 shadow-xs hover:text-foreground"
      >
        Focus · esc
      </button>
    </div>
  );
}
