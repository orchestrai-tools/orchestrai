import type { EditorView } from "@codemirror/view";
import { chooseChangeIndex } from "./line-changes";
import {
  loadProject,
  loadTask,
  setProjectEditorView,
  setTaskEditorView,
  type EditorViewState,
} from "@warpforge/core/sessionStore";

function clamp(value: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(Math.round(value), 0), max);
}

/** Cycle the selected change while the cursor stays on it. A moved cursor starts a new step. */
export function jumpChangeIndex(current: number, delta: number, lines: readonly number[]): number {
  return chooseChangeIndex(current, delta, lines, editorCursorLine());
}

/** The 0-based line of the open editor, or -1 when no editor is on the page. */
export function editorCursorLine(): number {
  if (typeof document === "undefined") return -1;
  const host = document.querySelector(".cm-editor")?.parentElement as
    | (HTMLElement & { editor?: EditorView })
    | null;
  const view = host?.editor;
  if (!view) return -1;
  return view.state.doc.lineAt(view.state.selection.main.head).number - 1;
}

/** Put the cursor and scroll back where this file was left. */
export function applyEditorCursor(view: EditorView, restore: EditorViewState): void {
  const max = view.state.doc.length;
  view.dispatch({
    selection: { anchor: clamp(restore.anchor, max), head: clamp(restore.head, max) },
  });
  requestAnimationFrame(() => {
    view.scrollDOM.scrollTop = restore.scrollTop;
    view.scrollDOM.scrollLeft = restore.scrollLeft;
  });
}

/** The saved place for this file, once the session store has been read. */
export async function savedEditorCursor(
  taskId: string,
  project: string,
  path: string,
  worktree?: string,
): Promise<EditorViewState | null> {
  const views = taskId
    ? (await loadTask(taskId, project, worktree)).files.views
    : (await loadProject(project)).files.views;
  return views[path] ?? null;
}

/** A short file must not replace a saved scroll with zero. The cursor is always kept. */
export function editorPlaceToStore(
  place: Pick<EditorViewState, "anchor" | "head" | "scrollTop" | "scrollLeft">,
  roomY: number,
  roomX: number,
): Pick<EditorViewState, "anchor" | "head"> &
  Partial<Pick<EditorViewState, "scrollTop" | "scrollLeft">> {
  return {
    anchor: place.anchor,
    head: place.head,
    ...(roomY <= 1 && place.scrollTop === 0 ? {} : { scrollTop: place.scrollTop }),
    ...(roomX <= 1 && place.scrollLeft === 0 ? {} : { scrollLeft: place.scrollLeft }),
  };
}

/** Remember cursor and scroll in the same store the previous app writes. */
export function watchEditorCursor(
  view: EditorView,
  onChange: (
    position: Pick<EditorViewState, "anchor" | "head"> &
      Partial<Pick<EditorViewState, "scrollTop" | "scrollLeft">>,
  ) => void,
): () => void {
  let pending = false;
  const report = () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      const scroller = view.scrollDOM;
      onChange(
        editorPlaceToStore(
          {
            anchor: view.state.selection.main.anchor,
            head: view.state.selection.main.head,
            scrollLeft: scroller.scrollLeft,
            scrollTop: scroller.scrollTop,
          },
          scroller.scrollHeight - scroller.clientHeight,
          scroller.scrollWidth - scroller.clientWidth,
        ),
      );
    });
  };
  view.scrollDOM.addEventListener("scroll", report, { passive: true });
  view.dom.addEventListener("keyup", report);
  view.dom.addEventListener("mouseup", report);
  return () => {
    view.scrollDOM.removeEventListener("scroll", report);
    view.dom.removeEventListener("keyup", report);
    view.dom.removeEventListener("mouseup", report);
  };
}

export function rememberEditorCursor(
  taskId: string,
  project: string,
  path: string,
  position: Pick<EditorViewState, "anchor" | "head"> &
    Partial<Pick<EditorViewState, "scrollTop" | "scrollLeft">>,
  worktree?: string,
): void {
  if (taskId) setTaskEditorView(taskId, project, path, position, worktree);
  else setProjectEditorView(project, path, position);
}
