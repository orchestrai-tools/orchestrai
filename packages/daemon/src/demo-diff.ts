import type { HunkResolution, TaskDiff } from "@warpforge/protocol";

function hunkKey(taskId: string, file: string, index: string): string {
  return `${taskId}\0${file}\0${index}`;
}

/** Remember one hunk decision for the demo diff. */
export function rememberDemoHunk(
  resolutions: Map<string, HunkResolution>,
  params: Record<string, unknown>,
): void {
  const resolution = params.resolution === "reject" ? "reject" : "accept";
  resolutions.set(
    hunkKey(String(params.task_id), String(params.file), String(params.hunk_index)),
    resolution,
  );
}

/** Overlay remembered decisions onto a fixture diff. */
export function applyDemoHunkResolutions(
  diff: TaskDiff,
  taskId: string,
  resolutions: Map<string, HunkResolution>,
): TaskDiff {
  return {
    ...diff,
    files: diff.files.map((file) => ({
      ...file,
      hunks: file.hunks.map((hunk, index) => {
        const resolution = resolutions.get(hunkKey(taskId, file.path, String(index)));
        return resolution ? { ...hunk, resolution } : hunk;
      }),
    })),
  };
}
