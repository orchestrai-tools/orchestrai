// @vitest-environment happy-dom
import { act, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  shots: new Set<(event: { captureId: string; pngBase64: string }) => void>(),
  events: new Map<string, Set<(event: { payload: unknown }) => void>>(),
  subscribe: vi.fn(),
  capture: vi.fn(),
  visible: vi.fn(),
  error: vi.fn(),
}));
vi.mock("./browser-client", () => ({
  IS_TAURI: true,
  browser: { captureElement: mock.capture, setVisible: mock.visible },
  onBrowserShot: mock.subscribe,
}));
vi.mock("sonner", () => ({ toast: { error: mock.error, success: vi.fn() } }));

import { useBrowserTabs } from "../pages/task/use-browser-tabs";
import {
  CAPTURE_TIMEOUT_MS,
  installBrowserCaptures,
  requestContextCapture,
} from "./browser-captures";
import { attachContext, contextImages, useComposerChips } from "./composer-chips";
import { useShell } from "./shell-store";

const rect = { x: 1, y: 2, width: 30, height: 40 };
let root: Root;
let stop: () => void;
function addChip(taskId = "task", id = "chip") {
  useComposerChips.getState().addContext({ taskId, id, label: "button", body: "selected button" });
}
function shot(captureId: string, pngBase64 = "PNG") {
  for (const handler of mock.shots) handler({ captureId, pngBase64 });
}
function captureId() {
  return mock.capture.mock.lastCall![1] as string;
}
function pending<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function Pane({ close }: { close: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const address = useRef<HTMLInputElement>(null);
  useBrowserTabs({
    taskId: "task",
    project: "demo",
    host,
    address,
    onPick: (text, label) => {
      const id = attachContext("demo", label, text);
      close();
      return id;
    },
  });
  return null;
}
function AnnotationPage() {
  const [shown, setShown] = useState(true);
  return shown ? <Pane close={() => setShown(false)} /> : null;
}

beforeEach(async () => {
  // Exercise the real event adapter without invoking a running native app.
  await import("@tauri-apps/api/event");
  vi.useFakeTimers();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const callbacks = new Map<number, (event: { payload: unknown }) => void>();
  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    configurable: true,
    value: {
      transformCallback(handler: (event: { payload: unknown }) => void) {
        const id = callbacks.size + 1;
        callbacks.set(id, handler);
        return id;
      },
      invoke(command: string, args: { event: string; handler: number }) {
        if (command === "plugin:event|listen") {
          const handlers = mock.events.get(args.event) ?? new Set();
          handlers.add(callbacks.get(args.handler)!);
          mock.events.set(args.event, handlers);
          return Promise.resolve(args.handler);
        }
        return Promise.resolve();
      },
    },
  });
  Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
    configurable: true,
    value: {
      unregisterListener(event: string, id: number) {
        mock.events.get(event)?.delete(callbacks.get(id)!);
      },
    },
  });
  localStorage.clear();
  useShell.setState({ taskId: "task", project: "demo", taskTab: "browser" });
  useComposerChips.setState({ contexts: [], diffs: [] });
  root = createRoot(document.createElement("div"));
  mock.shots.clear();
  mock.events.clear();
  mock.subscribe.mockReset().mockImplementation((handler) => {
    mock.shots.add(handler);
    return Promise.resolve(() => mock.shots.delete(handler));
  });
  mock.capture.mockReset().mockResolvedValue(undefined);
  mock.visible.mockReset().mockResolvedValue(undefined);
  mock.error.mockReset();
  stop = () => {};
});
afterEach(async () => {
  await act(async () => root.unmount());
  stop();
  Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  Reflect.deleteProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__");
  vi.useRealTimers();
});

it("attaches a late native screenshot after annotation switches away and unmounts the pane", async () => {
  stop = installBrowserCaptures();
  await act(async () => root.render(<AnnotationPage />));
  await act(async () => {
    for (const handler of mock.events.get("browser:annotation")!)
      handler({
        payload: {
          tabId: "task-task",
          annotation: {
            url: "http://localhost",
            selector: "button",
            role: "button",
            text: "Save",
            rect,
          },
        },
      });
  });
  expect(useShell.getState().taskTab).toBe("conversation");
  expect(mock.events.get("browser:annotation")?.size).toBe(0);
  expect(mock.shots.size).toBe(1);
  expect(useComposerChips.getState().contexts[0]).toMatchObject({
    taskId: "task",
    pendingImage: true,
  });
  await act(async () => shot(captureId()));
  expect(useComposerChips.getState().contexts[0]).toMatchObject({
    pendingImage: false,
    image: { data: "PNG" },
  });
  const sent = useComposerChips.getState().take("task");
  expect(contextImages(sent.contexts)).toEqual([
    { type: "image", name: `element-${captureId()}.png`, mimeType: "image/png", data: "PNG" },
  ]);
  shot(captureId(), "duplicate");
  expect(useComposerChips.getState().contexts).toEqual([]);
  expect(contextImages(useComposerChips.getState().take("task").contexts)).toEqual([]);
});

it("marks the chip pending immediately and waits for listener registration before native capture", async () => {
  const ready = pending<() => void>();
  mock.subscribe.mockReturnValueOnce(ready.promise);
  stop = installBrowserCaptures();
  addChip();
  const capture = requestContextCapture("task", "chip", "tab", rect);
  expect(useComposerChips.getState().contexts[0].pendingImage).toBe(true);
  expect(mock.capture).not.toHaveBeenCalled();
  ready.resolve(() => {});
  await capture;
  expect(mock.capture).toHaveBeenCalledWith("tab", expect.any(String), rect);
});

it("times out a missing native result, releases busy state and ignores a late result", async () => {
  stop = installBrowserCaptures();
  addChip();
  await requestContextCapture("task", "chip", "tab", rect);
  vi.advanceTimersByTime(CAPTURE_TIMEOUT_MS);
  expect(useComposerChips.getState().contexts[0].pendingImage).toBe(false);
  expect(mock.error).toHaveBeenCalledWith(
    expect.stringMatching(/took too long.*annotation is still attached/),
  );
  shot(captureId());
  expect(useComposerChips.getState().contexts[0].image).toBeUndefined();
});

it("releases busy state and gives feedback when native capture fails", async () => {
  stop = installBrowserCaptures();
  addChip();
  mock.capture.mockRejectedValueOnce(new Error("native failure"));
  await requestContextCapture("task", "chip", "tab", rect);
  expect(useComposerChips.getState().contexts[0].pendingImage).toBe(false);
  expect(mock.error).toHaveBeenCalledWith(
    expect.stringMatching(/Could not capture.*annotation is still attached/),
  );
  vi.advanceTimersByTime(CAPTURE_TIMEOUT_MS);
  expect(mock.error).toHaveBeenCalledTimes(1);
});

it("handles listener failure before invoking a native request", async () => {
  mock.subscribe.mockRejectedValueOnce(new Error("listener unavailable"));
  stop = installBrowserCaptures();
  addChip();
  await requestContextCapture("task", "chip", "tab", rect);
  expect(mock.capture).not.toHaveBeenCalled();
  expect(useComposerChips.getState().contexts[0].pendingImage).toBe(false);
  expect(mock.error).toHaveBeenCalledWith(
    expect.stringMatching(/Could not receive browser screenshots/),
  );
});

it("rejects empty shots and refuses to capture a chip owned by another task", async () => {
  stop = installBrowserCaptures();
  addChip();
  await requestContextCapture("other", "chip", "tab", rect);
  expect(mock.capture).not.toHaveBeenCalled();
  await requestContextCapture("task", "chip", "tab", rect);
  shot(captureId(), "");
  expect(useComposerChips.getState().contexts[0]).toMatchObject({ pendingImage: false });
  expect(useComposerChips.getState().contexts[0].image).toBeUndefined();
  expect(mock.error).toHaveBeenCalledTimes(1);
});

it("cancels removed task chips without feedback or resurrection and leaves other tasks alone", async () => {
  stop = installBrowserCaptures();
  addChip();
  addChip("other", "other-chip");
  await requestContextCapture("task", "chip", "tab", rect);
  const removedId = captureId();
  await requestContextCapture("other", "other-chip", "other-tab", rect);
  const otherId = captureId();
  useComposerChips.getState().forget("task");
  shot(removedId);
  shot(otherId);
  expect(useComposerChips.getState().contexts).toMatchObject([
    { taskId: "other", pendingImage: false, image: { data: "PNG" } },
  ]);
  vi.advanceTimersByTime(CAPTURE_TIMEOUT_MS);
  expect(mock.error).not.toHaveBeenCalled();
});

it("does not issue a native capture when the task was forgotten while the listener was starting", async () => {
  const ready = pending<() => void>();
  mock.subscribe.mockReturnValueOnce(ready.promise);
  stop = installBrowserCaptures();
  addChip();
  const capture = requestContextCapture("task", "chip", "tab", rect);
  useComposerChips.getState().forget("task");
  ready.resolve(() => {});
  await capture;
  expect(mock.capture).not.toHaveBeenCalled();
  vi.advanceTimersByTime(CAPTURE_TIMEOUT_MS);
  expect(mock.error).not.toHaveBeenCalled();
});

it("cancels an individually removed chip and cleans up pending captures on shutdown", async () => {
  stop = installBrowserCaptures();
  addChip();
  await requestContextCapture("task", "chip", "tab", rect);
  useComposerChips.getState().remove("chip");
  shot(captureId());
  expect(useComposerChips.getState().contexts).toEqual([]);
  addChip("task", "pending");
  await requestContextCapture("task", "pending", "tab", rect);
  stop();
  expect(mock.shots.size).toBe(0);
  expect(useComposerChips.getState().contexts[0].pendingImage).toBe(false);
  vi.advanceTimersByTime(CAPTURE_TIMEOUT_MS);
  expect(mock.error).not.toHaveBeenCalled();
});
