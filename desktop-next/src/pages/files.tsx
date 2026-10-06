import { daemon } from "@warpforge/daemon";
import type { SymbolMatch } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import { Input } from "@warpforge/ui/components/input";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@warpforge/ui/components/resizable";
import { FilePlusIcon, FileTextIcon, FolderPlusIcon, RefreshCwIcon, SearchIcon } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmRequestDialog, type ConfirmRequest } from "../components/common/confirm-dialog";
import { PageToolbar } from "../components/common/page-toolbar";
import { activeTheme, useAppearance } from "../lib/appearance";
import { useEditorLsp } from "../lib/editor-lsp";
import { fileTaskId, useShell } from "../lib/shell-store";
import { rankSymbolMatches } from "../lib/symbol-matches";
import { useDaemon } from "../lib/use-daemon";
import { ChangeStrip } from "./files/change-strip";
import { EditorToolbar } from "./files/editor-toolbar";
import { FileSurface, previewKind, type Symbols } from "./files/file-surface";
import { FileTabsBar } from "./files/file-tabs-bar";
import { FileTreePanel } from "./files/file-tree-panel";
import { NameDialog, type NameRequest } from "./files/name-dialog";
import { SearchResults } from "./files/search-results";
import { jumpTo, useFileDoc } from "./files/use-file-doc";
import { fileAct, useFileFind, useProjectFiles } from "./files/use-files";

/**
 * The worktree's files: a tree and find-in-files on the left, the open file
 * on the right with language-server marks, the lines changed since the last
 * commit, and tools to revert, copy or commit one change.
 */
export function Files() {
  const shell = useShell();
  const snapshot = useDaemon().snapshot;
  const project = shell.project ?? "";
  const taskId = fileTaskId(shell, snapshot.tasks);
  const task = snapshot.tasks.find((item) => item.id === taskId);
  const worktree = task?.worktree || undefined;
  const root = (taskId && task?.worktree) || snapshot.projects.find((item) => item.name === project)?.path;
  const dark = useAppearance((state) => activeTheme(state.themeId).mode === "dark");

  const list = useProjectFiles(project, taskId);
  const find = useFileFind(project, taskId, worktree);
  const file = useFileDoc(project, taskId, worktree);
  const [preview, setPreview] = useState(false);
  const [symbols, setSymbols] = useState<Symbols | null>(null);
  const [naming, setNaming] = useState<NameRequest | null>(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const askSelection = useRef<(() => boolean) | null>(null);
  const lsp = useEditorLsp({ project, taskId, path: shell.lspEnabled ? file.path : null, text: file.draft });

  if (!project) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
        <FileTextIcon className="size-5 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Open a project to browse its files.</p>
      </div>
    );
  }

  async function define(offset: number, word: string) {
    const hit = await lsp.defineAt(offset);
    if (hit) {
      file.open(hit.path);
      file.setJump(hit);
      return;
    }
    try {
      const matches = (await daemon.request("file.search", {
        project,
        query: word,
        task_id: taskId,
        limit: 5,
      })) as SymbolMatch[];
      const ranked = rankSymbolMatches(matches, word, file.path ?? "");
      setSymbols(ranked.length ? { query: word, matches: ranked } : null);
      if (!ranked.length) toast.info(`No definition for ${word}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not find a definition");
    }
  }

  async function submitName(request: NameRequest, path: string): Promise<boolean> {
    const ok =
      request.kind === "rename"
        ? await fileAct(project, taskId, "Renamed", "file.rename", { path: request.path, new_path: path })
        : await fileAct(project, taskId, "Created", "file.create", { path, directory: request.kind === "folder" });
    if (!ok) return false;
    list.load();
    if (request.kind === "rename") file.renamed(request.path, path);
    else if (request.kind === "file") file.open(path);
    return true;
  }

  const askDelete = (path: string) =>
    setConfirm({
      title: `Delete ${path.split("/").pop()}?`,
      description: "It is removed from disk. Committed files can be brought back from git; anything else is gone.",
      items: [path],
      confirmLabel: "Delete",
      destructive: true,
      onConfirm: () =>
        void fileAct(project, taskId, "Deleted", "file.delete", { path }).then((ok) => {
          if (!ok) return;
          file.forget(path);
          list.load();
        }),
    });

  const pick = (match: SymbolMatch) => {
    file.open(match.path);
    file.setJump(jumpTo(match));
  };
  const doc = file.doc;
  const changeLine = file.changes[file.changeAt];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageToolbar
        title="Files"
        meta={`${list.files.length} ${list.files.length === 1 ? "file" : "files"} · ${task ? task.title || "Task worktree" : "Project checkout"}`}
        className="px-4 pt-4 pb-3"
      >
        <Button variant="ghost" size="icon-sm" title="Refresh" onClick={list.load}>
          <RefreshCwIcon />
          <span className="sr-only">Refresh files</span>
        </Button>
      </PageToolbar>

      <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1 border-t">
        <ResizablePanel id="files-tree" defaultSize="28%" minSize="18%" maxSize="50%">
          <div className="flex h-full min-h-0 flex-col bg-sidebar/40">
            <form
              className="flex items-center gap-1 px-2 py-2"
              onSubmit={(event) => {
                event.preventDefault();
                void find.search();
              }}
            >
              <div className="relative min-w-0 flex-1">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="file-find"
                  value={find.query}
                  placeholder="Find in files"
                  aria-label="Find in files"
                  onChange={(event) => find.setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") find.setQuery("");
                  }}
                  className="h-7 pl-7 text-xs"
                />
              </div>
              <Button type="button" variant="ghost" size="icon-xs" title="New file" onClick={() => setNaming({ kind: "file", path: "" })}>
                <FilePlusIcon />
                <span className="sr-only">New file…</span>
              </Button>
              <Button type="button" variant="ghost" size="icon-xs" title="New folder" onClick={() => setNaming({ kind: "folder", path: "" })}>
                <FolderPlusIcon />
                <span className="sr-only">New folder…</span>
              </Button>
            </form>
            {find.query.trim() ? (
              find.error ? (
                <p className="px-3 py-2 text-xs text-red-600 dark:text-red-400">
                  {find.error}{" "}
                  <button type="button" className="underline" onClick={() => void find.search()}>
                    Retry
                  </button>
                </p>
              ) : find.searched && find.hits.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">No matches.</p>
              ) : (
                <SearchResults
                  query={find.query}
                  matches={find.hits}
                  project={project}
                  taskId={taskId}
                  worktree={worktree}
                  onPick={pick}
                />
              )
            ) : (
              <FileTreePanel
                files={list.files}
                loading={list.loading}
                error={list.error}
                selected={file.path}
                root={root}
                taskId={taskId}
                project={project}
                worktree={worktree}
                onOpen={file.open}
                onRefresh={list.load}
                onName={setNaming}
                onDelete={askDelete}
              />
            )}
          </div>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel id="files-editor" minSize="40%">
          <form
            className="flex h-full min-h-0 flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              void file.save();
            }}
          >
            <FileTabsBar tabs={file.tabs} active={file.path} dirty={file.dirty} onSelect={file.setPath} onClose={file.close} />
            {!doc ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
                <FileTextIcon className="size-5 text-muted-foreground" />
                <p className="text-sm font-medium">{file.path ? `Opening ${file.path}…` : "No file open"}</p>
                {!file.path && (
                  <p className="max-w-sm text-xs text-muted-foreground">
                    Pick a file in the tree, or find one by its contents.
                  </p>
                )}
              </div>
            ) : (
              <>
                <EditorToolbar
                  path={doc.path}
                  dirty={file.dirty}
                  saved={file.saved !== null}
                  previewable={previewKind(doc.path) !== null}
                  preview={preview}
                  changes={file.changes.length}
                  changeAt={file.changeAt}
                  onPreview={() => setPreview((value) => !value)}
                  onStep={file.step}
                  onRevertAll={file.revertAll}
                  onAsk={() => {
                    if (!askSelection.current?.()) toast.error("Select lines in the editor first");
                  }}
                  onRename={() => setNaming({ kind: "rename", path: doc.path })}
                  onDelete={() => askDelete(doc.path)}
                />
                {lsp.missing ? (
                  <div className="flex shrink-0 items-center gap-2 border-b bg-amber-500/10 px-3 py-1.5 text-xs">
                    <span className="min-w-0 truncate">{lsp.status}</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      className="ml-auto"
                      disabled={lsp.installBusy}
                      onClick={() => void lsp.install()}
                    >
                      {lsp.installBusy ? "Installing…" : "Install"}
                    </Button>
                  </div>
                ) : (
                  lsp.status && <p className="shrink-0 border-b px-3 py-1 text-xs text-muted-foreground">{lsp.status}</p>
                )}
                {changeLine != null && !preview && (
                  <ChangeStrip
                    key={`${doc.path}:${changeLine}`}
                    oldText={doc.oldText}
                    draft={file.draft}
                    line={changeLine}
                    busy={file.committing}
                    onRevert={file.revertChange}
                    onCopy={() => void file.copyChange()}
                    onCommit={file.commit}
                  />
                )}
                <FileSurface
                  doc={doc}
                  draft={file.draft}
                  preview={preview}
                  project={project}
                  dark={dark}
                  diagnostics={lsp.diagnostics}
                  jump={file.jump}
                  changes={file.changes}
                  symbols={symbols}
                  complete={lsp.completeAt}
                  onDraft={file.setDraft}
                  onSave={() => void file.save()}
                  onDefine={(offset, word) => void define(offset, word)}
                  onBindAsk={(ask) => {
                    askSelection.current = ask;
                  }}
                  onOpen={file.open}
                  onJump={file.setJump}
                  onSymbols={setSymbols}
                  onChangeAt={file.setChangeAt}
                />
              </>
            )}
          </form>
        </ResizablePanel>
      </ResizablePanelGroup>

      <NameDialog request={naming} onClose={() => setNaming(null)} onSubmit={submitName} />
      <ConfirmRequestDialog request={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}
