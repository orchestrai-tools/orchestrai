import type { FileDoc, SymbolMatch } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import { XIcon } from "lucide-react";
import { CodeEditor } from "../../components/code-editor";
import { Markdown } from "../../components/markdown";
import { deliverToConversation } from "../../lib/composer-insert";
import type { EditorDiagnostic } from "../../lib/diagnostic-range";
import { mentionToken } from "../../lib/mention-path";
import { jumpTo, type Jump } from "./use-file-doc";

/** Which rendered view a file has besides the editor, if any. */
export function previewKind(path: string): "markdown" | "html" | "svg" | null {
  const ext = path.split(".").pop()?.toLowerCase();
  if (ext === "md" || ext === "mdx") return "markdown";
  if (ext === "html" || ext === "htm") return "html";
  if (ext === "svg") return "svg";
  return null;
}

function mimeOf(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "gif") return "image/gif";
  if (ext === "webp") return "image/webp";
  return "image/png";
}

export interface Symbols {
  query: string;
  matches: SymbolMatch[];
}

/** The open file: an image, a rendered preview, or the editor with diagnostics and the change gutter. */
export function FileSurface({
  doc,
  draft,
  preview,
  project,
  dark,
  diagnostics,
  jump,
  changes,
  symbols,
  complete,
  onDraft,
  onSave,
  onDefine,
  onBindAsk,
  onOpen,
  onJump,
  onSymbols,
  onChangeAt,
}: {
  doc: FileDoc;
  draft: string;
  preview: boolean;
  project: string;
  dark: boolean;
  diagnostics: EditorDiagnostic[];
  jump: Jump | null;
  changes: number[];
  symbols: Symbols | null;
  complete: (offset: number) => Promise<string[]>;
  onDraft: (text: string) => void;
  onSave: () => void;
  onDefine: (offset: number, word: string) => void;
  onBindAsk: (ask: () => boolean) => void;
  onOpen: (path: string) => void;
  onJump: (jump: Jump) => void;
  onSymbols: (next: Symbols | null) => void;
  onChangeAt: (index: number) => void;
}) {
  const kind = previewKind(doc.path);
  if (doc.newDataBase64) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-muted/30 p-6">
        <img
          alt={doc.path}
          src={`data:${mimeOf(doc.path)};base64,${doc.newDataBase64}`}
          className="max-h-full max-w-full object-contain"
        />
      </div>
    );
  }
  if (preview && kind === "markdown") {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        <Markdown>{draft || "_Nothing written yet._"}</Markdown>
      </div>
    );
  }
  if (preview && kind === "html") {
    return <iframe title={doc.path} sandbox="allow-scripts" srcDoc={draft} className="min-h-0 flex-1 bg-white" />;
  }
  if (preview && kind === "svg") {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-muted/30 p-6">
        <img
          alt={doc.path}
          src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(draft)}`}
          className="max-h-full max-w-full"
        />
      </div>
    );
  }
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {symbols && (
        <div
          role="listbox"
          aria-label={`Definitions for ${symbols.query}`}
          className="absolute top-2 right-3 z-20 flex max-h-72 w-96 flex-col overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md"
        >
          <div className="flex items-center gap-2 border-b px-3 py-1.5">
            <span className="text-xs font-medium">Definitions for {symbols.query}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="ml-auto"
              aria-label="Close"
              onClick={() => onSymbols(null)}
            >
              <XIcon />
            </Button>
          </div>
          <div className="overflow-y-auto p-1">
            {symbols.matches.map((match) => (
              <button
                key={`${match.path}:${match.line}`}
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => {
                  onSymbols(null);
                  onOpen(match.path);
                  onJump(jumpTo(match));
                }}
                className="flex w-full flex-col items-start rounded-sm px-2 py-1 text-left hover:bg-muted"
              >
                <span className="font-mono text-xs">
                  {match.path}:{match.line}
                </span>
                <span className="w-full truncate font-mono text-xs text-muted-foreground">
                  {match.text.trim() || "(empty line)"}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      <CodeEditor
        path={doc.path}
        text={draft}
        dark={dark}
        diagnostics={diagnostics}
        onChange={onDraft}
        onSave={onSave}
        onDefine={onDefine}
        onAsk={(start, end) => deliverToConversation(project, mentionToken(doc.path, { start, end }))}
        onBindAsk={onBindAsk}
        jump={jump?.path === doc.path ? jump : null}
        baseline={doc.oldText}
        onGutter={(line) => {
          const index = changes.indexOf(line - 1);
          if (index >= 0) onChangeAt(index);
          onJump({ path: doc.path, line: line - 1, character: 0 });
        }}
        complete={complete}
        className="min-h-0 flex-1 overflow-hidden text-sm [&_.cm-editor]:h-full [&_.cm-editor]:outline-none"
      />
    </div>
  );
}
