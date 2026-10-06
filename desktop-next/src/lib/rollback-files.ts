import type { FileDiff } from "@warpforge/protocol";

/** Hunks to reject when rolling a file back. Added files have a single empty side. */
export function rollbackHunkIndexes(file: { status: FileDiff["status"]; hunks: readonly unknown[] }): number[] {
  if (file.status === "added") return [0];
  return file.hunks.map((_, index) => index).reverse();
}
