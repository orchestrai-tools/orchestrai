import { describe, expect, it } from "vitest";
import { escapeClosesDialog } from "./close-on-escape";

class MenuNode {
  constructor(
    readonly role: string | null,
    readonly parent: MenuNode | null,
  ) {}

  closest(selector: string) {
    if (selector !== "[role=menu]") return null;
    const walk = (node: MenuNode | null): MenuNode | null => {
      if (!node) return null;
      if (node.role === "menu") return node;
      return walk(node.parent);
    };
    return walk(this);
  }
}

describe("escapeClosesDialog", () => {
  it("closes on Escape and leaves an open menu alone", () => {
    Object.defineProperty(globalThis, "Element", { configurable: true, value: MenuNode });
    expect(escapeClosesDialog({ key: "Escape", target: null })).toBe(true);
    expect(escapeClosesDialog({ key: "Enter", target: null })).toBe(false);
    const menu = new MenuNode("menu", null);
    const item = new MenuNode(null, menu);
    expect(escapeClosesDialog({ key: "Escape", target: item as unknown as EventTarget })).toBe(
      false,
    );
  });
});
