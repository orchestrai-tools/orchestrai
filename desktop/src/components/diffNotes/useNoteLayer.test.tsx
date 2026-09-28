import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DiffNote } from "@/lib/diffNotes";
import type { TaskInfo } from "@/protocol";
import { useDiffNotesStore } from "@/store/diffNotes";

import { DiffNotesProvider } from "./DiffNotesContext";
import { useNoteLayer } from "./useNoteLayer";

vi.mock("@/daemon", () => ({ daemon: { request: vi.fn<() => Promise<unknown>>() } }));

const TASK: TaskInfo = {
  agent: "claude",
  blockedReason: null,
  createdAt: 1,
  filesChanged: 1,
  id: "t_1",
  project: "warpforge",
  prompt: "do it",
  status: "waiting",
  tags: [],
  title: "",
  updatedAt: 1,
};

const TEXT = ["alpha", "beta", "gamma", "delta"].join("\n");

let editor: EditorView | null = null;

function Editor({ text }: { text: string }) {
  const host = useRef<HTMLDivElement>(null);
  const notes = useNoteLayer("src/a.ts", text);
  useEffect(() => {
    const view = new EditorView({
      parent: host.current ?? undefined,
      state: EditorState.create({ doc: text, extensions: [notes.extension] }),
    });
    vi.spyOn(view, "documentTop", "get").mockReturnValue(0);
    vi.spyOn(view, "lineBlockAtHeight").mockImplementation((height) =>
      view.lineBlockAt(view.state.doc.line(Math.floor(height / 10) + 1).from),
    );
    editor = view;
    notes.attach(view);
    return () => {
      notes.attach(null);
      view.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <>
      <div ref={host} />
      {notes.portals}
    </>
  );
}

function renderEditor(text = TEXT) {
  const view = render(
    <DiffNotesProvider task={TASK}>
      <Editor text={text} />
    </DiffNotesProvider>,
  );
  return {
    rerender: (next: string) =>
      view.rerender(
        <DiffNotesProvider task={TASK}>
          <Editor text={next} />
        </DiffNotesProvider>,
      ),
  };
}

function clickGutterLine(line: number) {
  const gutter = editor?.dom.querySelector(".cm-note-gutter");
  const clientY = (line - 1) * 10 + 1;
  act(() => {
    gutter?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, clientY }));
    window.dispatchEvent(new MouseEvent("mouseup"));
  });
}

function stored(): DiffNote[] {
  return useDiffNotesStore.getState().byTask.t_1 ?? [];
}

beforeEach(() => {
  useDiffNotesStore.setState({ byTask: {} });
});

describe("useNoteLayer", () => {
  it("writes a note on a picked line and saves it with ⌘⏎", async () => {
    renderEditor();
    clickGutterLine(2);
    const box = await screen.findByRole("textbox", { name: "Review note" });
    expect(screen.getByText("Note on src/a.ts:2")).toBeInTheDocument();
    await userEvent.type(box, "Rename beta");
    await userEvent.keyboard("{Meta>}{Enter}{/Meta}");

    expect(stored()).toMatchObject([
      { body: "Rename beta", endLine: 2, path: "src/a.ts", snippet: ["beta"], startLine: 2 },
    ]);
    expect(screen.queryByRole("textbox", { name: "Review note" })).not.toBeInTheDocument();
    expect(await screen.findByText("Rename beta")).toBeInTheDocument();
  });

  it("drops the draft on Esc", async () => {
    renderEditor();
    clickGutterLine(3);
    const box = await screen.findByRole("textbox", { name: "Review note" });
    await userEvent.type(box, "never mind");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("textbox", { name: "Review note" })).not.toBeInTheDocument();
    expect(stored()).toEqual([]);
  });

  it("re-anchors a note when the agent inserts lines above it, and marks it outdated once its lines are gone", async () => {
    useDiffNotesStore.setState({
      byTask: {
        t_1: [
          {
            body: "Check gamma",
            createdAt: 1,
            endLine: 3,
            id: "n1",
            path: "src/a.ts",
            snippet: ["gamma"],
            startLine: 3,
          },
        ],
      },
    });
    const { rerender } = renderEditor();
    expect(await screen.findByText("src/a.ts:3")).toBeInTheDocument();

    rerender(["// added", "// added", TEXT].join("\n"));
    expect(await screen.findByText("src/a.ts:5")).toBeInTheDocument();
    expect(stored()[0]).toMatchObject({ endLine: 5, startLine: 5 });
    expect(stored()[0].outdated).toBeFalsy();

    rerender(["alpha", "beta", "GAMMA!", "delta"].join("\n"));
    expect(await screen.findByText("Outdated")).toBeInTheDocument();
    expect(stored()[0]).toMatchObject({ outdated: true });
  });
});
