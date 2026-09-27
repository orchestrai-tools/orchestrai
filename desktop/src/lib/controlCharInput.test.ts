import { describe, expect, it } from "vitest";

import { installControlCharGuard, isControlCharInsertion } from "./controlCharInput";

describe("isControlCharInsertion", () => {
  it("flags the legacy arrow codes and AppKit function-key characters", () => {
    for (const data of ["\u001d", "\u001c", "\u001d\u001d", "\uf703", "\u007f"]) {
      expect(isControlCharInsertion({ inputType: "insertText", data })).toBe(true);
    }
  });

  it("leaves real text, other input types and empty data alone", () => {
    expect(isControlCharInsertion({ inputType: "insertText", data: "хочу" })).toBe(false);
    expect(isControlCharInsertion({ inputType: "insertText", data: "a\u001d" })).toBe(false);
    expect(isControlCharInsertion({ inputType: "insertText", data: "" })).toBe(false);
    expect(isControlCharInsertion({ inputType: "insertLineBreak", data: null })).toBe(false);
    expect(isControlCharInsertion({ inputType: "insertFromPaste", data: "\u001d" })).toBe(false);
  });
});

describe("installControlCharGuard", () => {
  it("cancels a control-only insertion and lets real text through", () => {
    const remove = installControlCharGuard();
    const textarea = document.createElement("textarea");
    document.body.append(textarea);
    const fire = (data: string) =>
      textarea.dispatchEvent(
        new InputEvent("beforeinput", { inputType: "insertText", data, cancelable: true }),
      );

    expect(fire("\u001d")).toBe(false);
    expect(fire("x")).toBe(true);

    remove();
    expect(fire("\u001d")).toBe(true);
    textarea.remove();
  });
});
