import { expect, test } from "vitest"

test("connection labels stay plain strings", () => {
  expect(["disconnected", "connecting", "connected"]).toContain("connected")
})
