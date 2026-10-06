import { expect, test } from "vitest";
import { formatWorktreeSize, worktreeConfirm } from "./worktree-format";

test("reclaim and remove explain what they delete", () => {
  expect(worktreeConfirm("reclaim", true).title).toBe("Reclaim build artifacts?");
  expect(worktreeConfirm("remove", true).body).toContain("archives the task");
  expect(worktreeConfirm("remove", false).body).toContain("deletes the checkout");
});

test("sizes stay short", () => {
  expect(formatWorktreeSize(48 * 1024 * 1024)).toBe("48 MB");
  expect(formatWorktreeSize(null)).toBe("—");
});
