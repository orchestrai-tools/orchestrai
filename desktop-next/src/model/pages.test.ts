import { expect, test } from "vitest";
import { pageForGoKey } from "./pages";

test("G then a letter opens every sidebar page", () => {
  expect(pageForGoKey("b")).toBe("board");
  expect(pageForGoKey("L")).toBe("backlog");
  expect(pageForGoKey("m")).toBe("memory");
  expect(pageForGoKey("w")).toBe("workflows");
  expect(pageForGoKey("a")).toBe("automations");
  expect(pageForGoKey("r")).toBe("services");
  expect(pageForGoKey("e")).toBe("agents");
  expect(pageForGoKey(",")).toBe("settings");
  expect(pageForGoKey("z")).toBeNull();
});
