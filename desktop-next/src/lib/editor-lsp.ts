import { daemon } from "@warpforge/daemon";
import type { LspStartResult } from "@warpforge/protocol";
import { useEffect, useRef, useState } from "react";
import { locationFromDefinition, pathFromFileUri } from "./editor-nav";
import { type DiagnosticSeverity, type EditorDiagnostic } from "./diagnostic-range";

export type { EditorDiagnostic } from "./diagnostic-range";

interface LspPosition {
  line?: number;
  character?: number;
}

interface LspMessage {
  id?: number;
  method?: string;
  result?: unknown;
  params?: {
    diagnostics?: {
      message?: string;
      severity?: number;
      range?: { start?: LspPosition; end?: LspPosition };
    }[];
  };
}

const SEVERITY = ["", "error", "warning", "info", "hint"];

function languageOf(path: string): string | null {
  const ext = path.split(".").pop()?.toLowerCase();
  if (ext === "ts" || ext === "tsx") return "typescript";
  if (ext === "js" || ext === "jsx") return "javascript";
  if (ext === "rs") return "rust";
  if (ext === "py") return "python";
  if (ext === "go") return "go";
  return null;
}

function fileUri(root: string, path: string): string {
  const full = `${root.replace(/\/$/, "")}/${path}`;
  return `file://${full}`;
}

export function useEditorLsp(input: { project: string; taskId: string; path: string | null; text: string }) {
  const [diagnostics, setDiagnostics] = useState<EditorDiagnostic[]>([]);
  const [completions, setCompletions] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const [missing, setMissing] = useState<string | null>(null);
  const [installBusy, setInstallBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const text = useRef(input.text);
  text.current = input.text;
  const session = useRef<{
    serverId: string;
    uri: string;
    version: number;
    root: string;
    send: (method: string, params: unknown) => void;
  } | null>(null);

  useEffect(() => {
    const path = input.path;
    const language = path ? languageOf(path) : null;
    if (!path || !language) {
      setDiagnostics([]);
      setStatus("");
      return;
    }
    let stopped = false;
    let serverId = "";
    let nextId = 1;
    const pending = new Map<number, (result: unknown) => void>();
    const off = daemon.subscribeEvents((event) => {
      if (event.event !== "lsp.message" || event.data.server_id !== serverId) return;
      const message = event.data.payload as LspMessage;
      if (message.id != null && pending.has(message.id)) {
        pending.get(message.id)?.(message.result);
        pending.delete(message.id);
        return;
      }
      if (message.method === "textDocument/publishDiagnostics") {
        setDiagnostics(readDiagnostics(message));
      }
    });

    function send(method: string, params: unknown, expectReply: boolean) {
      const id = expectReply ? nextId++ : undefined;
      const payload = id == null ? { jsonrpc: "2.0", method, params } : { jsonrpc: "2.0", id, method, params };
      const wait = expectReply
        ? new Promise<unknown>((resolve) => {
            pending.set(id!, resolve);
          })
        : Promise.resolve(undefined);
      void daemon.request("lsp.send", { server_id: serverId, payload });
      return wait;
    }

    void (async () => {
      const started = (await daemon.request("lsp.start", {
        task_id: input.taskId,
        language,
        project: input.project,
      })) as LspStartResult;
      if (stopped) return;
      if (!started?.available || !started.serverId) {
        setMissing(language);
        setStatus(`${language} server is not installed.`);
        return;
      }
      setMissing(null);
      setStatus(`${language} language server`);
      serverId = started.serverId;
      const uri = fileUri(started.rootPath, path);
      await send("initialize", {
        processId: null,
        rootUri: started.rootPath ? `file://${started.rootPath}` : null,
        capabilities: {
          textDocument: {
            synchronization: { dynamicRegistration: false },
            publishDiagnostics: {},
            completion: { completionItem: { snippetSupport: false } },
            definition: { dynamicRegistration: false },
            diagnostic: {},
          },
        },
      }, true);
      if (stopped) return;
      send("initialized", {}, false);
      send(
        "textDocument/didOpen",
        { textDocument: { uri, languageId: language, version: 1, text: text.current } },
        false,
      );
      session.current = {
        serverId,
        uri,
        version: 1,
        root: started.rootPath ?? "",
        send: (method, params) => send(method, params, false),
      };
    })().catch((err: unknown) => {
      if (!stopped) setStatus(err instanceof Error ? err.message : "Could not start the language server");
    });

    return () => {
      stopped = true;
      session.current = null;
      off();
      if (serverId) void daemon.request("lsp.stop", { server_id: serverId });
    };
  }, [input.path, input.project, input.taskId, retry]);

  useEffect(() => {
    const current = session.current;
    if (!current) return;
    const timer = window.setTimeout(() => {
      current.version += 1;
      current.send("textDocument/didChange", {
        textDocument: { uri: current.uri, version: current.version },
        contentChanges: [{ text: text.current }],
      });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [input.text]);

  async function completeAt(offset: number): Promise<string[]> {
    const current = session.current;
    if (!current) return [];
    const before = text.current.slice(0, offset);
    const line = before.split("\n").length - 1;
    const character = before.length - before.lastIndexOf("\n") - 1;
    const result = await new Promise<unknown>((resolve) => {
      const id = Date.now();
      let off = () => {};
      const timer = window.setTimeout(() => {
        off();
        resolve(null);
      }, 4000);
      off = daemon.subscribeEvents((event) => {
        if (event.event !== "lsp.message" || event.data.server_id !== current.serverId) return;
        const message = event.data.payload as LspMessage;
        if (message.id === id) {
          window.clearTimeout(timer);
          off();
          resolve(message.result);
        }
      });
      void daemon.request("lsp.send", {
        server_id: current.serverId,
        payload: {
          jsonrpc: "2.0",
          id,
          method: "textDocument/completion",
          params: { textDocument: { uri: current.uri }, position: { line, character } },
        },
      });
    });
    const items = Array.isArray(result)
      ? result
      : ((result as { items?: { label?: string }[] } | null)?.items ?? []);
    const labels = items.map((item) => (typeof item === "string" ? item : item.label ?? "")).filter(Boolean).slice(0, 12);
    setCompletions(labels);
    return labels;
  }

  async function defineAt(offset: number): Promise<{ path: string; line: number; character: number } | null> {
    const current = session.current;
    if (!current) return null;
    const before = text.current.slice(0, offset);
    const line = before.split("\n").length - 1;
    const character = before.length - before.lastIndexOf("\n") - 1;
    const result = await new Promise<unknown>((resolve) => {
      const id = Date.now();
      let stop = () => {};
      const timer = window.setTimeout(() => {
        stop();
        resolve(null);
      }, 4000);
      stop = daemon.subscribeEvents((event) => {
        if (event.event !== "lsp.message" || event.data.server_id !== current.serverId) return;
        const message = event.data.payload as LspMessage;
        if (message.id !== id) return;
        window.clearTimeout(timer);
        stop();
        resolve(message.result);
      });
      void daemon.request("lsp.send", {
        server_id: current.serverId,
        payload: {
          jsonrpc: "2.0",
          id,
          method: "textDocument/definition",
          params: { textDocument: { uri: current.uri }, position: { line, character } },
        },
      });
    });
    const location = locationFromDefinition(result);
    if (!location) return null;
    return { path: pathFromFileUri(location.uri, current.root), line: location.line, character: location.character };
  }

  async function install() {
    if (!missing) return;
    setInstallBusy(true);
    try {
      const result = await daemon.installLanguageServer(missing);
      if (!result.ok) throw new Error(result.output || "Could not install the language server");
      setRetry((value) => value + 1);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not install the language server");
    } finally {
      setInstallBusy(false);
    }
  }

  return { completions, completeAt, defineAt, diagnostics, install, installBusy, missing, setCompletions, status };
}

function readDiagnostics(message: LspMessage): EditorDiagnostic[] {
  return (message.params?.diagnostics ?? []).flatMap((item) => {
    const severity = SEVERITY[item.severity ?? 1];
    if (!isSeverity(severity)) return [];
    const start = item.range?.start;
    const end = item.range?.end ?? start;
    return [
      {
        fromLine: start?.line ?? 0,
        fromChar: start?.character ?? 0,
        toLine: end?.line ?? start?.line ?? 0,
        toChar: end?.character ?? start?.character ?? 0,
        message: item.message ?? "",
        severity,
      },
    ];
  });
}

function isSeverity(value: string | undefined): value is DiagnosticSeverity {
  return value === "error" || value === "warning" || value === "info" || value === "hint";
}
