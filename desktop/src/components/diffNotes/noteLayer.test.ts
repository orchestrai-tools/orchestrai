import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createNoteLayer, type LineSpan, type NoteLayerCallbacks } from "./noteLayer";

const LINE_PX = 10;
const DOC = ["one", "two", "three", "four", "five", "six"].join("\n");

function setup() {
  const picks: LineSpan[] = [];
  const mounted = new Map<string, HTMLElement>();
  const callbacks: NoteLayerCallbacks = {
    mount: (id, dom) => mounted.set(id, dom),
    pick: (span) => picks.push(span),
    unmount: (id, dom) => {
      if (mounted.get(id) === dom) mounted.delete(id);
    },
  };
  const layer = createNoteLayer(callbacks);
  const parent = document.createElement("div");
  document.body.append(parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({ doc: DOC, extensions: [layer.extension] }),
  });
  // jsdom lays nothing out: map a pointer's y straight to a line.
  vi.spyOn(view, "documentTop", "get").mockReturnValue(0);
  const blockAt = (height: number) =>
    view.lineBlockAt(view.state.doc.line(Math.floor(height / LINE_PX) + 1).from);
  vi.spyOn(view, "elementAtHeight").mockImplementation(blockAt);
  vi.spyOn(view, "lineBlockAtHeight").mockImplementation(blockAt);
  layer.attach(view);
  return { layer, mounted, picks, view };
}

function slotLines(view: EditorView): number[] {
  return [...view.contentDOM.querySelectorAll(".cm-note-slot")].map(
    (dom) => view.state.doc.lineAt(view.posAtDOM(dom)).number,
  );
}

function pressGutter(view: EditorView, line: number) {
  const gutter = view.dom.querySelector(".cm-note-gutter");
  const clientY = (line - 1) * LINE_PX + 1;
  gutter?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, clientY }));
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("note layer", () => {
  it("mounts a slot under each note's last line and highlights the range", () => {
    const { layer, mounted, view } = setup();
    layer.sync(
      [
        { id: "a", line: 2 },
        { id: "b", line: 5 },
      ],
      { end: 4, start: 3 },
    );
    expect([...mounted.keys()].sort()).toEqual(["a", "b"]);
    expect(view.contentDOM.querySelectorAll(".cm-note-range")).toHaveLength(2);
    view.destroy();
    expect(mounted.size).toBe(0);
  });

  it("keeps slots on their lines when the whole document is replaced", () => {
    const { layer, view } = setup();
    layer.sync([{ id: "a", line: 3 }], null);
    view.dispatch({ changes: { from: 0, insert: `${DOC}\nseven`, to: view.state.doc.length } });
    expect(slotLines(view)).toEqual([3]);
  });

  it("clamps a slot past the end of a shorter file onto its last line", () => {
    const { layer, view } = setup();
    layer.sync([{ id: "a", line: 40 }], null);
    expect(slotLines(view)).toEqual([6]);
  });

  it("applies what was synced before the editor attached", () => {
    const layer = createNoteLayer({
      mount: vi.fn<NoteLayerCallbacks["mount"]>(),
      pick: vi.fn<NoteLayerCallbacks["pick"]>(),
      unmount: vi.fn<NoteLayerCallbacks["unmount"]>(),
    });
    layer.sync([{ id: "a", line: 1 }], null);
    const view = new EditorView({
      parent: document.body,
      state: EditorState.create({ doc: DOC, extensions: [layer.extension] }),
    });
    layer.attach(view);
    expect(view.contentDOM.querySelectorAll(".cm-note-slot")).toHaveLength(1);
  });

  it("picks the line a gutter click lands on", () => {
    const { picks, view } = setup();
    pressGutter(view, 3);
    window.dispatchEvent(new MouseEvent("mouseup"));
    expect(picks).toEqual([{ end: 3, start: 3 }]);
  });

  it("picks the dragged range, ordered, when the drag runs upwards", () => {
    const { picks, view } = setup();
    pressGutter(view, 5);
    window.dispatchEvent(new MouseEvent("mousemove", { clientY: 1 * LINE_PX + 1 }));
    expect(view.contentDOM.querySelectorAll(".cm-note-range")).toHaveLength(4);
    window.dispatchEvent(new MouseEvent("mouseup"));
    expect(picks).toEqual([{ end: 5, start: 2 }]);
  });
});
