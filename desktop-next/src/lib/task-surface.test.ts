import { expect, test } from "vitest";
import { pageForSurface, surfaceForPage } from "./task-surface";

test("a task remembers Files, Changes, and Services", () => {
  expect(surfaceForPage("files")).toBe("files");
  expect(surfaceForPage("changes")).toBe("diff");
  expect(surfaceForPage("services")).toBe("runtime");
  expect(surfaceForPage("github")).toBeNull();
  expect(pageForSurface("files")).toBe("files");
  expect(pageForSurface("diff")).toBe("changes");
  expect(pageForSurface("terminal")).toBeNull();
});
