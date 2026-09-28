import { StateEffect, StateField, type EditorState, type Extension } from "@codemirror/state";
import {
  BlockType,
  Decoration,
  type DecorationSet,
  EditorView,
  GutterMarker,
  gutter,
  ViewPlugin,
  WidgetType,
} from "@codemirror/view";

import { orderedRange } from "@/lib/diffNotes";

/** A block under `line` that React renders a note or the composer into. */
export interface NoteSlot {
  id: string;
  line: number;
}

export interface LineSpan {
  start: number;
  end: number;
}

export interface NoteLayerCallbacks {
  /** A line or a dragged range was picked from the gutter. */
  pick: (span: LineSpan) => void;
  mount: (id: string, dom: HTMLElement) => void;
  unmount: (id: string, dom: HTMLElement) => void;
}

/** The editor side of review notes: gutter "+", range highlight, note slots. */
export interface NoteLayer {
  extension: Extension;
  /** Bind to the editor that carries `extension`, or unbind with null. */
  attach: (view: EditorView | null) => void;
  /** Show these slots and this highlighted range. */
  sync: (slots: readonly NoteSlot[], range: LineSpan | null) => void;
}

const setSlots = StateEffect.define<readonly NoteSlot[]>();
const setRange = StateEffect.define<LineSpan | null>();
const setHover = StateEffect.define<number | null>();

interface LayerValue {
  slots: readonly NoteSlot[];
  range: LineSpan | null;
  decorations: DecorationSet;
}

class SlotWidget extends WidgetType {
  constructor(
    readonly id: string,
    readonly callbacks: NoteLayerCallbacks,
  ) {
    super();
  }

  eq(other: SlotWidget): boolean {
    return other.id === this.id;
  }

  toDOM(view: EditorView): HTMLElement {
    const dom = document.createElement("div");
    dom.className = "cm-note-slot";
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => view.requestMeasure());
      observer.observe(dom);
      observers.set(dom, observer);
    }
    this.callbacks.mount(this.id, dom);
    return dom;
  }

  destroy(dom: HTMLElement): void {
    observers.get(dom)?.disconnect();
    observers.delete(dom);
    this.callbacks.unmount(this.id, dom);
  }

  ignoreEvent(): boolean {
    return true;
  }
}

const observers = new WeakMap<HTMLElement, ResizeObserver>();

const rangeLine = Decoration.line({ class: "cm-note-range" });

function clampLine(state: EditorState, line: number): number {
  return Math.min(Math.max(1, line), state.doc.lines);
}

/**
 * Decorations for the slots and the range, positioned by line number against
 * the current document, so a whole-document replace cannot collapse them.
 * @param state Editor state to position against.
 * @param value Slots and highlighted range.
 * @param callbacks Handed to each slot widget.
 * @returns The decoration set.
 */
export function buildNoteDecorations(
  state: EditorState,
  value: Pick<LayerValue, "slots" | "range">,
  callbacks: NoteLayerCallbacks,
): DecorationSet {
  const ranges = [];
  if (value.range) {
    const start = clampLine(state, value.range.start);
    const end = clampLine(state, value.range.end);
    for (let line = start; line <= end; line += 1) {
      ranges.push(rangeLine.range(state.doc.line(line).from));
    }
  }
  for (const slot of value.slots) {
    const widget = Decoration.widget({
      block: true,
      side: 1,
      widget: new SlotWidget(slot.id, callbacks),
    });
    ranges.push(widget.range(state.doc.line(clampLine(state, slot.line)).to));
  }
  return Decoration.set(ranges, true);
}

function lineAtY(view: EditorView, clientY: number): number | null {
  const block = view.elementAtHeight(clientY - view.documentTop);
  if (block.type !== BlockType.Text) return null;
  return view.state.doc.lineAt(block.from).number;
}

class AddMarker extends GutterMarker {
  toDOM(): Node {
    const dom = document.createElement("span");
    dom.className = "cm-note-add";
    dom.textContent = "+";
    dom.title = "Add a review note (drag for a range)";
    return dom;
  }
}

const addMarker = new AddMarker();

class RangeMarker extends GutterMarker {
  toDOM(): Node {
    const dom = document.createElement("span");
    dom.className = "cm-note-range-bar";
    return dom;
  }
}

const rangeMarker = new RangeMarker();

/**
 * Build the note layer for one editor.
 * @param callbacks Where picks and slot mounts are reported.
 * @returns The extension plus the handles to drive it.
 */
export function createNoteLayer(callbacks: NoteLayerCallbacks): NoteLayer {
  let view: EditorView | null = null;
  let pending: { slots: readonly NoteSlot[]; range: LineSpan | null } = { range: null, slots: [] };

  const field = StateField.define<LayerValue>({
    create: () => ({ decorations: Decoration.none, range: null, slots: [] }),
    update(value, tr) {
      let { slots, range } = value;
      let changed = tr.docChanged;
      for (const effect of tr.effects) {
        if (effect.is(setSlots)) {
          slots = effect.value;
          changed = true;
        } else if (effect.is(setRange)) {
          range = effect.value;
          changed = true;
        }
      }
      if (!changed) return value;
      return {
        decorations: buildNoteDecorations(tr.state, { range, slots }, callbacks),
        range,
        slots,
      };
    },
    provide: (f) => EditorView.decorations.from(f, (value) => value.decorations),
  });

  const hover = StateField.define<number | null>({
    create: () => null,
    update(value, tr) {
      for (const effect of tr.effects) if (effect.is(setHover)) value = effect.value;
      return value;
    },
  });

  const hoverTracker = ViewPlugin.fromClass(
    class {
      constructor(readonly editor: EditorView) {
        editor.scrollDOM.addEventListener("mousemove", this.move);
        editor.scrollDOM.addEventListener("mouseleave", this.leave);
      }
      move = (event: MouseEvent) => this.show(lineAtY(this.editor, event.clientY));
      leave = () => this.show(null);
      show(line: number | null) {
        if (this.editor.state.field(hover) !== line) {
          this.editor.dispatch({ effects: setHover.of(line) });
        }
      }
      destroy() {
        this.editor.scrollDOM.removeEventListener("mousemove", this.move);
        this.editor.scrollDOM.removeEventListener("mouseleave", this.leave);
      }
    },
  );

  const startDrag = (editor: EditorView, first: number) => {
    let last = first;
    editor.dispatch({ effects: setRange.of({ end: first, start: first }) });
    const move = (event: MouseEvent) => {
      const line = lineAtY(editor, event.clientY);
      if (line === null || line === last) return;
      last = line;
      editor.dispatch({ effects: setRange.of(orderedRange(first, line)) });
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      callbacks.pick(orderedRange(first, last));
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const noteGutter = gutter({
    class: "cm-note-gutter",
    domEventHandlers: {
      mousedown(editor, line, event) {
        if ((event as MouseEvent).button !== 0) return false;
        event.preventDefault();
        startDrag(editor, editor.state.doc.lineAt(line.from).number);
        return true;
      },
    },
    initialSpacer: () => addMarker,
    lineMarker(editor, line) {
      const number = editor.state.doc.lineAt(line.from).number;
      const range = editor.state.field(field).range;
      if (range && number >= range.start && number <= range.end) return rangeMarker;
      return editor.state.field(hover) === number ? addMarker : null;
    },
    lineMarkerChange: (update) =>
      update.startState.field(hover) !== update.state.field(hover) ||
      update.startState.field(field).range !== update.state.field(field).range,
  });

  const theme = EditorView.theme({
    ".cm-note-gutter .cm-gutterElement": { cursor: "pointer", padding: "0 2px" },
    ".cm-note-add": {
      background: "hsl(var(--primary))",
      borderRadius: "3px",
      color: "hsl(var(--primary-foreground))",
      display: "inline-block",
      fontWeight: "600",
      lineHeight: "14px",
      textAlign: "center",
      width: "14px",
    },
    // The gutter bar marks the range even where the diff's own backgrounds hide the tint.
    ".cm-note-range-bar": {
      background: "hsl(var(--primary))",
      borderRadius: "1px",
      display: "inline-block",
      height: "100%",
      minHeight: "14px",
      verticalAlign: "top",
      width: "4px",
    },
    // An image layer, so the tint shows over the merge view's changed-line background.
    ".cm-note-range": {
      backgroundImage: "linear-gradient(hsl(var(--primary) / 0.16), hsl(var(--primary) / 0.16))",
      boxShadow: "inset 2px 0 0 hsl(var(--primary))",
    },
  });

  const push = () => {
    view?.dispatch({ effects: [setSlots.of(pending.slots), setRange.of(pending.range)] });
  };

  return {
    attach(next) {
      view = next;
      push();
    },
    extension: [field, hover, hoverTracker, noteGutter, theme],
    sync(slots, range) {
      pending = { range, slots };
      push();
    },
  };
}
