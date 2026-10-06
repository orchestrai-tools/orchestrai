import { css } from "@codemirror/lang-css";
import { go } from "@codemirror/lang-go";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { rust } from "@codemirror/lang-rust";
import { yaml } from "@codemirror/lang-yaml";
import { lintGutter, setDiagnostics, type Diagnostic } from "@codemirror/lint";
import { oneDark } from "@codemirror/theme-one-dark";
import { autocompletion, type CompletionSource } from "@codemirror/autocomplete";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { daemon } from "@warpforge/daemon";
import { Button } from "@warpforge/ui/components/button";
import { cn } from "@warpforge/ui/lib/utils";
import { basicSetup } from "codemirror";
import { MessageSquarePlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { diagnosticSpan, type EditorDiagnostic } from "../lib/diagnostic-range";
import {
  applyEditorCursor,
  rememberEditorCursor,
  savedEditorCursor,
  watchEditorCursor,
} from "../lib/editor-session";
import { fileTaskId, useShell } from "../lib/shell-store";
import { changeGutterExtension } from "../lib/change-gutter";
import { bindEditorCommands } from "../lib/editor-commands";

const EMPTY_DIAGNOSTICS: EditorDiagnostic[] = [];

/** CodeMirror with language-server marks, change gutter, and send-to-chat for selected lines. */
export function CodeEditor({
  path,
  text,
  dark,
  diagnostics = EMPTY_DIAGNOSTICS,
  onChange,
  onSave,
  complete,
  onDefine,
  onAsk,
  onBindAsk,
  jump,
  className,
  baseline,
  onGutter,
}: {
  path: string;
  text: string;
  dark: boolean;
  diagnostics?: EditorDiagnostic[];
  onChange: (text: string) => void;
  onSave: () => void;
  complete?: (offset: number) => Promise<string[]>;
  onDefine?: (offset: number, word: string) => void;
  /** Send the selected lines to the conversation. Lines are 1-based. */
  onAsk?: (start: number, end: number) => void;
  onBindAsk?: (ask: () => boolean) => void;
  jump?: { line: number; character: number } | null;
  className?: string;
  /** Last committed text. When set, the gutter marks lines that differ. */
  baseline?: string;
  /** A gutter mark was clicked. `line` is 1-based. */
  onGutter?: (line: number) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  const completeRef = useRef(complete);
  const defineRef = useRef(onDefine);
  const askRef = useRef(onAsk);
  const bindAskRef = useRef(onBindAsk);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const gutterRef = useRef(onGutter);
  gutterRef.current = onGutter;
  onChangeRef.current = onChange;
  onSaveRef.current = onSave;
  completeRef.current = complete;
  defineRef.current = onDefine;
  askRef.current = onAsk;
  bindAskRef.current = onBindAsk;

  useEffect(() => {
    const parent = host.current;
    if (!parent) return;
    const language = languageFor(path);
    const source: CompletionSource = async (context) => {
      const request = completeRef.current;
      if (!request) return null;
      const labels = await request(context.pos);
      if (labels.length === 0) return null;
      const word = context.matchBefore(/[\w$]+/);
      return { from: word?.from ?? context.pos, options: labels.map((label) => ({ label })) };
    };
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: text,
        extensions: [
          basicSetup,
          lintGutter(),
          EditorView.lineWrapping,
          keymap.of([
            {
              key: "Mod-b",
              preventDefault: true,
              run: (view) => defineAtCursor(view, defineRef.current),
            },
            {
              key: "Mod-l",
              preventDefault: true,
              run: (editor) => askLines(editor, askRef.current),
            },
            {
              key: "Mod-s",
              preventDefault: true,
              run: () => {
                onSaveRef.current();
                return true;
              },
            },
          ]),
          autocompletion({ activateOnTyping: false, override: [source] }),
          ...(language ? [language] : []),
          ...(dark ? [oneDark] : []),
          ...(baseline != null
            ? [changeGutterExtension(baseline, (info) => gutterRef.current?.(info.line))]
            : []),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString());
            if (!update.selectionSet && !update.docChanged && !update.geometryChanged) return;
            const selection = update.state.selection.main;
            const coords = selection.empty ? null : update.view.coordsAtPos(selection.from);
            const hostRect = parent.getBoundingClientRect();
            if (!coords || !askRef.current) {
              setMenu(null);
              return;
            }
            setMenu({ x: coords.left - hostRect.left, y: coords.bottom - hostRect.top + 6 });
          }),
        ],
      }),
    });
    viewRef.current = view;
    (parent as HTMLDivElement & { editor?: EditorView }).editor = view;
    let cancelSession = false;
    let stopSession = () => {};
    const shell = useShell.getState();
    const tasks = daemon.getState().snapshot.tasks;
    const onFiles = Boolean(shell.project && shell.pages[shell.project] === "files");
    const taskId = onFiles ? fileTaskId(shell, tasks) : (shell.taskId ?? "");
    const task = tasks.find((item) => item.id === taskId);
    if (shell.project && (onFiles || task)) {
      const project = shell.project;
      const worktree = task?.worktree || undefined;
      void savedEditorCursor(taskId, project, path, worktree).then((saved) => {
        if (cancelSession || !saved || viewRef.current !== view) return;
        applyEditorCursor(view, saved);
      });
      stopSession = watchEditorCursor(view, (position) => {
        rememberEditorCursor(taskId, project, path, position, worktree);
      });
    }
    bindAskRef.current?.(() => askLines(view, askRef.current));
    bindEditorCommands({
      save: () => onSaveRef.current(),
      define: () => defineAtCursor(view, defineRef.current),
    });
    return () => {
      cancelSession = true;
      stopSession();
      delete (parent as HTMLDivElement & { editor?: EditorView }).editor;
      bindEditorCommands(null);
      view.destroy();
      viewRef.current = null;
    };
    // A new file or theme rebuilds the editor. Text typed later is synced below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, dark, baseline]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === text) return;
    view.dispatch({ changes: { from: 0, to: current.length, insert: text } });
  }, [text]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const doc = view.state.doc.toString();
    const marks: Diagnostic[] = diagnostics.map((item) => {
      const span = diagnosticSpan(doc, item);
      return {
        from: span.from,
        to: span.to,
        severity: item.severity,
        message: item.message,
        source: "language server",
      };
    });
    view.dispatch(setDiagnostics(view.state, marks));
  }, [diagnostics, text]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !jump) return;
    const lineNo = Math.min(view.state.doc.lines, Math.max(1, jump.line + 1));
    const line = view.state.doc.line(lineNo);
    const pos = Math.min(line.to, line.from + jump.character);
    view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
  }, [jump, text]);

  return (
    <div ref={host} className={cn("relative", className)}>
      {menu && (
        <Button
          type="button"
          size="xs"
          className="absolute z-10 shadow-md"
          style={{ left: menu.x, top: menu.y }}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            const view = viewRef.current;
            if (view && askLines(view, askRef.current)) setMenu(null);
          }}
        >
          <MessageSquarePlus />
          Send to chat
        </Button>
      )}
    </div>
  );
}

function defineAtCursor(
  view: EditorView,
  define?: (offset: number, word: string) => void,
): boolean {
  const head = view.state.selection.main.head;
  const word = view.state.wordAt(head);
  const text = word ? view.state.sliceDoc(word.from, word.to) : "";
  if (!text) return false;
  define?.(head, text);
  return true;
}

function askLines(view: EditorView, ask?: (start: number, end: number) => void): boolean {
  const selection = view.state.selection.main;
  if (selection.empty || !ask) return false;
  const start = view.state.doc.lineAt(selection.from).number;
  const end = view.state.doc.lineAt(Math.max(selection.from, selection.to - 1)).number;
  ask(start, end);
  return true;
}

function languageFor(path: string): Extension | null {
  const ext = path.split(".").pop()?.toLowerCase();
  if (ext === "ts" || ext === "tsx" || ext === "mts" || ext === "cts")
    return javascript({ typescript: true, jsx: true });
  if (ext === "js" || ext === "jsx" || ext === "mjs" || ext === "cjs")
    return javascript({ jsx: true });
  if (ext === "md" || ext === "mdx") return markdown();
  if (ext === "rs") return rust();
  if (ext === "py") return python();
  if (ext === "json") return json();
  if (ext === "go") return go();
  if (ext === "css") return css();
  if (ext === "html" || ext === "htm") return html();
  if (ext === "yml" || ext === "yaml") return yaml();
  return null;
}
