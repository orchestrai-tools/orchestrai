import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DiffNote } from "@/lib/diffNotes";
import type { TaskInfo, TaskStatus } from "@/protocol";
import { useDiffNotesStore } from "@/store/diffNotes";

import { DiffNotesBar } from "./DiffNotesBar";
import { DiffNotesProvider } from "./DiffNotesContext";

const request = vi.fn<(method: string, params: unknown) => Promise<unknown>>(async () => ({}));

vi.mock("@/daemon", () => ({
  daemon: {
    request: (method: string, params: unknown) => request(method, params),
  },
}));

function task(status: TaskStatus): TaskInfo {
  return {
    agent: "claude",
    blockedReason: null,
    createdAt: 1,
    filesChanged: 1,
    id: "t_1",
    project: "warpforge",
    prompt: "do it",
    status,
    tags: [],
    title: "",
    updatedAt: 1,
  };
}

function note(id: string, overrides: Partial<DiffNote> = {}): DiffNote {
  return {
    body: `Fix ${id}.`,
    createdAt: 1,
    endLine: 3,
    id,
    path: "src/a.ts",
    snippet: ["const x = 1;"],
    startLine: 3,
    ...overrides,
  };
}

function renderBar(status: TaskStatus) {
  return render(
    <DiffNotesProvider task={task(status)}>
      <DiffNotesBar onJump={vi.fn<(path: string) => void>()} />
    </DiffNotesProvider>,
  );
}

beforeEach(() => {
  request.mockClear();
  useDiffNotesStore.setState({ byTask: {} });
});

describe("DiffNotesBar", () => {
  it("renders nothing without notes", () => {
    const { container } = renderBar("waiting");
    expect(container).toBeEmptyDOMElement();
  });

  it("sends every unsent note as one prompt while the agent is busy", async () => {
    useDiffNotesStore.setState({
      byTask: { t_1: [note("a"), note("b", { startLine: 9, endLine: 9 })] },
    });
    renderBar("running");
    const button = screen.getByRole("button", { name: /Send 2 notes/ });
    expect(button).toBeEnabled();
    expect(button).toHaveAttribute("title", expect.stringContaining("queue"));

    await userEvent.click(button);

    expect(request).toHaveBeenCalledTimes(1);
    const [method, params] = request.mock.calls[0];
    expect(method).toBe("session.prompt");
    expect(params).toMatchObject({ attachments: [], task_id: "t_1" });
    const text = (params as { text: string }).text;
    expect(text).toContain("1. src/a.ts:3\n   > const x = 1;\n   Fix a.");
    expect(text).toContain("2. src/a.ts:9");
    const stored = useDiffNotesStore.getState().byTask.t_1;
    expect(stored.every((entry) => typeof entry.sentAt === "number")).toBe(true);
    expect(screen.getByRole("button", { name: /Resend 2 notes/ })).toBeInTheDocument();
  });

  it("sends only the notes not yet sent, and resends the rest once all went out", async () => {
    useDiffNotesStore.setState({
      byTask: { t_1: [note("a", { sentAt: 5 }), note("b", { startLine: 7, endLine: 7 })] },
    });
    renderBar("waiting");
    await userEvent.click(screen.getByRole("button", { name: /Send 1 note$/ }));
    const text = (request.mock.calls[0][1] as { text: string }).text;
    expect(text).toContain("Fix b.");
    expect(text).not.toContain("Fix a.");

    act(() => useDiffNotesStore.getState().remove("t_1", ["b"]));
    await userEvent.click(screen.getByRole("button", { name: /Resend 1 note$/ }));
    expect((request.mock.calls[1][1] as { text: string }).text).toContain("Fix a.");
  });

  it("will not send into a finished task", () => {
    useDiffNotesStore.setState({ byTask: { t_1: [note("a")] } });
    renderBar("done");
    expect(screen.getByRole("button", { name: /Send 1 note/ })).toBeDisabled();
  });

  it("keeps the notes unsent and shows the error when the send fails", async () => {
    request.mockRejectedValueOnce(new Error("no session"));
    useDiffNotesStore.setState({ byTask: { t_1: [note("a")] } });
    renderBar("waiting");
    await userEvent.click(screen.getByRole("button", { name: /Send 1 note/ }));
    expect(screen.getByText("no session")).toBeInTheDocument();
    expect(useDiffNotesStore.getState().byTask.t_1[0].sentAt).toBeUndefined();
  });
});
