import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  shell: { project: "one", taskId: "", openTerminal: vi.fn() },
  request: vi.fn(),
  terminal: vi.fn(),
  histories: new Map<string, string[]>(),
}));
vi.mock("@warpforge/daemon", () => ({
  daemon: {
    getState: () => ({ snapshot: { tasks: [] } }),
    request: mocks.request,
    runInTerminal: mocks.terminal,
  },
}));
vi.mock("../../lib/shell-store", () => ({
  useShell: { getState: () => mocks.shell },
  fileTaskId: (shell: typeof mocks.shell) => shell.taskId,
}));
vi.mock("../../lib/shell-commands", () => ({
  readHistory: (project: string) => mocks.histories.get(project) ?? [],
  writeHistory: (project: string, lines: string[]) => {
    mocks.histories.set(project, lines);
    return lines;
  },
}));
import { useCommandRun } from "./run-store";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const initial = useCommandRun.getState();
const store = () => useCommandRun.getState();
function select(project: string, taskId = "") {
  Object.assign(mocks.shell, { project, taskId });
  store().load();
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.histories.clear();
  Object.assign(mocks.shell, { project: "one", taskId: "" });
  useCommandRun.setState(initial, true);
  mocks.request.mockResolvedValue({ commands: [] });
});

describe("command checkout isolation", () => {
  it("keeps late results and running status in their original checkout", async () => {
    const first = deferred<{ stdout: string }>();
    const second = deferred<{ stdout: string }>();
    mocks.request.mockImplementation((method, args) =>
      method === "shell.run"
        ? args.task_id
          ? second.promise
          : first.promise
        : Promise.resolve({ commands: [] }),
    );
    select("one");
    const rootRun = store().execute("npm test", "here");
    select("one", "task");
    expect(store().busy).toBe(false);
    expect(store().result).toBeNull();
    const taskRun = store().execute("npm test", "here");
    first.resolve({ stdout: "root Jest output" });
    await rootRun;
    expect(store().busy).toBe(true);
    expect(store().result).toBeNull();
    second.resolve({ stdout: "task Jest output" });
    await taskRun;
    expect(store().result?.text).toBe("task Jest output");
    select("one");
    expect(store().result?.text).toBe("root Jest output");
    store().dismiss();
    select("two");
    select("one");
    expect(store().result).toBeNull();
  });

  it("retries a timeout in the captured project and task without navigating another project", async () => {
    select("one", "task");
    mocks.request.mockRejectedValueOnce(new Error("Command ran longer than 30 seconds"));
    await store().execute("slow-test", "here");
    const result = store().result!;
    expect(result.timedOut).toBe(true);
    select("two");
    mocks.terminal.mockResolvedValue("terminal-1");
    await store().execute(result.command, "terminal", result.context);
    expect(mocks.terminal).toHaveBeenCalledWith("one", "slow-test", "task");
    expect(mocks.shell.openTerminal).not.toHaveBeenCalled();
    expect(store().result).toBeNull();
    expect(mocks.histories.get("two")).toBeUndefined();
  });

  it("does not let old discovery completion clear the new checkout's loading state", async () => {
    const old = deferred<unknown>();
    const current = deferred<unknown>();
    mocks.request.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    select("one");
    select("two");
    old.resolve({ commands: ["old"] });
    await old.promise;
    await Promise.resolve();
    await Promise.resolve();
    expect(store().loading).toBe(true);
    expect(store().detected).toBeNull();
    current.resolve({ commands: [] });
    await current.promise;
    await Promise.resolve();
    await Promise.resolve();
    expect(store().loading).toBe(false);
  });

  it("does not open a delayed terminal over another checkout", async () => {
    const terminal = deferred<string>();
    mocks.terminal.mockReturnValue(terminal.promise);
    select("one");
    const run = store().execute("npm run watch", "terminal");
    select("two");
    terminal.resolve("terminal-1");
    await run;
    expect(mocks.shell.openTerminal).not.toHaveBeenCalled();
  });
});
