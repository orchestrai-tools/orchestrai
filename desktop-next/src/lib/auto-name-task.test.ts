import { beforeEach, describe, expect, it, vi } from "vitest";
const daemon = vi.hoisted(() => ({ generateText: vi.fn(), setTaskTitle: vi.fn() }));
vi.mock("@warpforge/daemon", () => ({ daemon }));
import { autoNameCreatedTask } from "./auto-name-task";
import { useShell } from "./shell-store";

describe("automatic titles for new tasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useShell.setState({
      autoNameTasks: true,
      textGenAgentId: "codex",
      textGenModel: "selected-model",
    });
  });
  it("uses the configured writer and model, and saves a clean title", async () => {
    daemon.generateText.mockResolvedValue("```text\nFix the app\n```");
    await autoNameCreatedTask("t1");
    expect(daemon.generateText).toHaveBeenCalledWith("t1", "codex", "task_title", "selected-model");
    expect(daemon.setTaskTitle).toHaveBeenCalledWith("t1", "Fix the app");
  });
  it("does not run when naming is off or no writer is selected", async () => {
    useShell.setState({ autoNameTasks: false });
    await autoNameCreatedTask("t1");
    useShell.setState({ autoNameTasks: true, textGenAgentId: "" });
    await autoNameCreatedTask("t2");
    expect(daemon.generateText).not.toHaveBeenCalled();
  });
  it("keeps task creation successful if the naming agent fails", async () => {
    daemon.generateText.mockRejectedValue(new Error("offline"));
    await expect(autoNameCreatedTask("t1")).resolves.toBeUndefined();
    expect(daemon.setTaskTitle).not.toHaveBeenCalled();
  });
});
