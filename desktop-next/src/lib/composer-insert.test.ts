import { beforeEach, describe, expect, it } from "vitest";
import { useComposerInsert } from "./composer-insert";

describe("composer insert", () => {
  beforeEach(() => {
    useComposerInsert.setState({ pending: null });
  });

  it("lets one caller claim an insert", () => {
    useComposerInsert.getState().append("see @README.md#L1");
    const id = useComposerInsert.getState().pending?.id;
    expect(id).toBeTypeOf("number");
    expect(useComposerInsert.getState().claim(id!)).toBe(true);
    expect(useComposerInsert.getState().claim(id!)).toBe(false);
    expect(useComposerInsert.getState().pending).toBeNull();
  });
});
