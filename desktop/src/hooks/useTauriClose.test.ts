import { renderHook, waitFor } from "@testing-library/react";
import { createElement, StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { daemon } from "@/daemon";

import { useTauriClose } from "./useTauriClose";

/** The close-requested handler the hook registers with the window. */
type CloseHandler = (event: { preventDefault: () => void }) => void;

const { invoke, unlistenWindow, unlistenEvent } = vi.hoisted(() => ({
  invoke: vi.fn<(command: string) => Promise<void>>(),
  unlistenWindow: vi.fn<() => void>(),
  unlistenEvent: vi.fn<() => void>(),
}));

function quitAppCalls(): number {
  return invoke.mock.calls.filter(([command]) => command === "quit_app").length;
}

let closeHandler: CloseHandler | null = null;
let quitRequestedHandler: (() => void) | null = null;

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    onCloseRequested: (handler: CloseHandler) => {
      closeHandler = handler;
      return Promise.resolve(unlistenWindow);
    },
  }),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: (_event: string, handler: () => void) => {
    quitRequestedHandler = handler;
    return Promise.resolve(unlistenEvent);
  },
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

function check(blockers: string[], owned: boolean) {
  vi.spyOn(daemon, "quitCheck").mockResolvedValue({ blockers, owned });
}

/**
 * Render the hook and wait until it has registered with the window. Under
 * StrictMode, because the app runs that way: the double mount unregisters the
 * first listener while the second is still resolving its dynamic imports, which
 * is exactly where a quit can end up with a listener nobody answers.
 */
async function renderRegistered() {
  const view = renderHook(() => useTauriClose(), {
    wrapper: ({ children }) => createElement(StrictMode, null, children),
  });
  await waitFor(() => expect(closeHandler).not.toBeNull());
  await waitFor(() => expect(quitRequestedHandler).not.toBeNull());
  return view;
}

beforeEach(() => {
  closeHandler = null;
  quitRequestedHandler = null;
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  delete (window as unknown as Record<string, unknown>).__warpforgeQuitting;
  invoke.mockClear().mockResolvedValue(undefined);
  vi.spyOn(daemon, "quitRuntime").mockResolvedValue(undefined);
  check([], true);
});

afterEach(() => {
  vi.useRealTimers();
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  delete (window as unknown as Record<string, unknown>).__warpforgeQuitting;
  vi.restoreAllMocks();
  unlistenWindow.mockClear();
  unlistenEvent.mockClear();
});

describe("useTauriClose", () => {
  it("quits straight away when nothing is running", async () => {
    const { result } = await renderRegistered();

    const event = { preventDefault: vi.fn<() => void>() };
    closeHandler!(event);

    // The close is refused first, then the app quits through the Rust command
    // once the daemon has been asked to stop.
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("quit_app"));
    expect(invoke).toHaveBeenCalledWith("quit_ui_ready");
    expect(event.preventDefault).toHaveBeenCalled();
    expect(daemon.quitRuntime).toHaveBeenCalled();
    expect(result.current).toBeNull();
  });

  it("asks first when work is running, and quits on the answer", async () => {
    check(["2 agent task(s) are active", "1 service(s) are running"], true);
    const { result, rerender } = await renderRegistered();

    closeHandler!({ preventDefault: vi.fn<() => void>() });
    await waitFor(() => expect(result.current).not.toBeNull());
    rerender();

    expect(quitAppCalls()).toBe(0);
    expect(result.current?.blockers).toEqual([
      "2 agent task(s) are active",
      "1 service(s) are running",
    ]);

    await result.current!.confirm();
    expect(daemon.quitRuntime).toHaveBeenCalled();
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("quit_app"));
  });

  it("does nothing when the user chooses Wait", async () => {
    check(["1 terminal session(s) are active"], true);
    const { result, rerender } = await renderRegistered();

    closeHandler!({ preventDefault: vi.fn<() => void>() });
    await waitFor(() => expect(result.current).not.toBeNull());

    result.current!.cancel();
    rerender();

    expect(result.current).toBeNull();
    expect(daemon.quitRuntime).not.toHaveBeenCalled();
    expect(quitAppCalls()).toBe(0);
  });

  it("leaves a daemon it does not own running", async () => {
    check([], false);
    await renderRegistered();

    closeHandler!({ preventDefault: vi.fn<() => void>() });

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("quit_app"));
    expect(daemon.quitRuntime).not.toHaveBeenCalled();
  });

  it("answers ⌘Q and Dock → Quit through the same flow", async () => {
    check(["1 service(s) are running"], true);
    const { result, rerender } = await renderRegistered();

    quitRequestedHandler!();
    await waitFor(() => expect(result.current).not.toBeNull());
    rerender();

    expect(result.current?.blockers).toEqual(["1 service(s) are running"]);
  });

  it("quits anyway when the daemon check fails", async () => {
    vi.spyOn(daemon, "quitCheck").mockRejectedValue(new Error("daemon offline"));
    await renderRegistered();

    closeHandler!({ preventDefault: vi.fn<() => void>() });

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("quit_app"));
  });

  it("quits anyway when the daemon never answers the shutdown", async () => {
    vi.spyOn(daemon, "quitRuntime").mockReturnValue(new Promise<void>(() => {}));
    await renderRegistered();
    vi.useFakeTimers();

    closeHandler!({ preventDefault: vi.fn<() => void>() });
    await vi.advanceTimersByTimeAsync(15_001);

    expect(invoke).toHaveBeenCalledWith("quit_app");
  });

  it("retries the next quit when the quit command fails", async () => {
    await renderRegistered();
    invoke.mockImplementation(async (command) => {
      if (command === "quit_app") throw new Error("quit failed");
    });

    closeHandler!({ preventDefault: vi.fn<() => void>() });
    await waitFor(() => expect(quitAppCalls()).toBe(1));
    await waitFor(() =>
      expect((window as unknown as Record<string, unknown>).__warpforgeQuitting).toBeUndefined(),
    );

    invoke.mockResolvedValue(undefined);
    closeHandler!({ preventDefault: vi.fn<() => void>() });
    await waitFor(() => expect(quitAppCalls()).toBe(2));
  });

  // A hot reload leaves the previous generation's listener registered with the
  // window. Refusing the close on behalf of a flag only that generation can see
  // is how a dev session ends up with a window that will not close at all.
  it("does not refuse a quit another listener has already started", async () => {
    check(["1 service(s) are running"], true);
    const stale = await renderRegistered();
    const staleHandler = closeHandler!;
    closeHandler = null;
    const fresh = await renderRegistered();
    const freshHandler = closeHandler!;

    freshHandler({ preventDefault: vi.fn<() => void>() });
    await waitFor(() => expect(fresh.result.current).not.toBeNull());
    await fresh.result.current!.confirm();
    expect(invoke).toHaveBeenCalled();

    const event = { preventDefault: vi.fn<() => void>() };
    staleHandler(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(stale.result.current).toBeNull();
  });
});
