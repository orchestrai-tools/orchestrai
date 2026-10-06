/** The mark a plan step shows: done, in progress, or still waiting. */
export function planMark(status: string): { mark: string; label: string; done: boolean } {
  if (status === "completed") return { mark: "✓", label: "Completed", done: true };
  if (status === "in_progress") return { mark: "◐", label: "In progress", done: false };
  return { mark: "○", label: "Pending", done: false };
}
