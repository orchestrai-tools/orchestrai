import { act, cleanup, render } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import script from "../../../../src-tauri/src/browser_agent.js?raw";

interface Result {
  url: string;
  title: string;
  tree?: string;
  truncated?: boolean;
  note?: string;
  error?: string;
  messages?: { level: string; text: string }[];
}

type Agent = (call: Record<string, unknown>) => string;

/** The entry point the script installs on the page's window. */
const ENTRY = "__wfAgent";
const page = window as unknown as Record<string, unknown>;

function agent(call: Record<string, unknown>): Result {
  const run = page[ENTRY] as Agent;
  let out = "";
  act(() => {
    out = run(call);
  });
  return JSON.parse(out) as Result;
}

/** The ref the outline gave the first line containing `label`. */
function refOf(tree: string, label: string): string {
  const line = tree.split("\n").find((l) => l.includes(label));
  const ref = line?.match(/\[(e\d+)\]/)?.[1];
  if (!ref) throw new Error(`no ref for ${label} in:\n${tree}`);
  return ref;
}

beforeAll(() => {
  // jsdom has no layout: give every element a box and make scrolling a no-op.
  Element.prototype.getBoundingClientRect = () =>
    ({ x: 0, y: 0, top: 0, left: 0, right: 20, bottom: 20, width: 20, height: 20 }) as DOMRect;
  Element.prototype.scrollIntoView = () => {};
  new Function(script)();
});

afterEach(cleanup);

describe("page agent", () => {
  it("drives a React button with the pointer sequence, as untrusted events", () => {
    const seen: string[] = [];
    let trusted: boolean | null = null;
    function Page() {
      return (
        <button
          type="button"
          onPointerDown={() => seen.push("pointerdown")}
          onMouseDown={() => seen.push("mousedown")}
          onFocus={() => seen.push("focus")}
          onMouseUp={() => seen.push("mouseup")}
          onClick={(e) => {
            seen.push("click");
            trusted = e.nativeEvent.isTrusted;
          }}
        >
          Save
        </button>
      );
    }
    render(<Page />);
    const { tree = "" } = agent({ action: "snapshot" });
    const result = agent({ action: "click", ref: refOf(tree, '"Save"') });

    expect(result.error).toBeUndefined();
    expect(seen).toEqual(["pointerdown", "mousedown", "focus", "mouseup", "click"]);
    expect(trusted).toBe(false);
  });

  it("a site that insists on isTrusted ignores the click", () => {
    let handled = false;
    render(
      <button
        type="button"
        onClick={(e) => {
          if (e.nativeEvent.isTrusted) handled = true;
        }}
      >
        Pay
      </button>,
    );
    const { tree = "" } = agent({ action: "snapshot" });
    agent({ action: "click", ref: refOf(tree, '"Pay"') });
    expect(handled).toBe(false);
  });

  it("types into a controlled React input through the native setter", () => {
    const changes: string[] = [];
    function Page() {
      const [value, setValue] = useState("");
      return (
        <label>
          Email
          <input
            value={value}
            onChange={(e) => {
              changes.push(e.target.value);
              setValue(e.target.value);
            }}
          />
        </label>
      );
    }
    const { container } = render(<Page />);
    const { tree = "" } = agent({ action: "snapshot" });
    agent({ action: "type", ref: refOf(tree, 'textbox "Email"'), text: "a@b.co" });

    expect(changes).toEqual(["a@b.co"]);
    expect(container.querySelector("input")?.value).toBe("a@b.co");
  });

  it("assigning value directly is invisible to React, which is why the setter is used", () => {
    const changes: string[] = [];
    function Page() {
      const [value, setValue] = useState("");
      return (
        <input
          aria-label="plain"
          value={value}
          onChange={(e) => {
            changes.push(e.target.value);
            setValue(e.target.value);
          }}
        />
      );
    }
    const { container } = render(<Page />);
    const input = container.querySelector("input")!;
    act(() => {
      input.value = "typed";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(changes).toEqual([]);
  });

  it("submit presses Enter and submits the form; checkboxes toggle on click", () => {
    let submitted = 0;
    render(
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submitted += 1;
        }}
      >
        <input aria-label="Search" defaultValue="" />
        <label>
          <input type="checkbox" /> Remember
        </label>
      </form>,
    );
    const { tree = "" } = agent({ action: "snapshot" });
    agent({ action: "type", ref: refOf(tree, '"Search"'), text: "q", submit: true });
    expect(submitted).toBe(1);

    const box = refOf(tree, "checkbox");
    agent({ action: "click", ref: box });
    const after = agent({ action: "snapshot" }).tree ?? "";
    expect(after).toContain(`[${box}] checked`);
  });

  it("outlines the page with stable refs, hides what is hidden, and names links", () => {
    render(
      <main>
        <h1>Dashboard</h1>
        <p>Welcome back</p>
        <a href="/settings">Settings</a>
        <button type="button" style={{ display: "none" }}>
          Secret
        </button>
        <select aria-label="Team" defaultValue="b">
          <option value="a">Alpha</option>
          <option value="b">Beta</option>
        </select>
      </main>,
    );
    const first = agent({ action: "snapshot" });
    const second = agent({ action: "snapshot" });
    const tree = first.tree ?? "";

    expect(tree).toContain('heading "Dashboard" (h1)');
    expect(tree).toContain('text "Welcome back"');
    expect(tree).toMatch(/link "Settings" \[e\d+\] → \/settings/);
    expect(tree).toContain('value="Beta" options: Alpha | Beta');
    expect(tree).not.toContain("Secret");
    expect(refOf(second.tree ?? "", '"Settings"')).toBe(refOf(tree, '"Settings"'));
  });

  it("a ref for an element that left the page is an error, not a click on something else", () => {
    const { unmount } = render(<button type="button">Gone</button>);
    const ref = refOf(agent({ action: "snapshot" }).tree ?? "", '"Gone"');
    unmount();
    expect(agent({ action: "click", ref }).error).toContain("take a new browser_snapshot");
  });

  it("keeps console messages and uncaught errors", () => {
    console.warn("disk almost full", { free: 3 });
    window.dispatchEvent(
      new ErrorEvent("error", { message: "boom", filename: "app.js", lineno: 4 }),
    );
    const messages = agent({ action: "console" }).messages ?? [];
    expect(messages).toContainEqual(
      expect.objectContaining({ level: "warn", text: 'disk almost full {"free":3}' }),
    );
    expect(messages).toContainEqual(
      expect.objectContaining({ level: "error", text: "Uncaught boom (app.js:4)" }),
    );
  });

  it("a page script cannot replace the entry point", () => {
    const original = page[ENTRY];
    try {
      page[ENTRY] = () => "{}";
    } catch {
      // Strict-mode assignment to a read-only property throws.
    }
    expect(page[ENTRY]).toBe(original);
  });
});
