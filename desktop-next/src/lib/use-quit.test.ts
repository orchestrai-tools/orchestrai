import { expect, test } from "vitest";
import { requestQuit } from "./use-quit";

test("quit waits for the desktop window", () => {
  expect(requestQuit()).toBe(false);
});
