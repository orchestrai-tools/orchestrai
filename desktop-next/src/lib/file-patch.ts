import type { FileDiff } from "@warpforge/protocol";

/** The diff of one file, in the shape a conversation can quote. */
export function formatFileDiff(file: FileDiff): string {
  const header =
    file.oldPath && file.oldPath !== file.path
      ? `diff --git a/${file.oldPath} b/${file.path}`
      : `diff --git a/${file.path} b/${file.path}`;
  const statusLine =
    file.status === "added"
      ? "new file mode 100644"
      : file.status === "deleted"
        ? "deleted file mode 100644"
        : file.status === "renamed"
          ? `rename from ${file.oldPath}\nrename to ${file.path}`
          : "index ---..+++ 100644";
  const hunks = file.hunks.map((hunk) => `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`);
  const lines = file.hunks.flatMap((hunk) => hunk.lines);
  return `${header}\n${statusLine}\n${hunks.join("\n")}\n${lines.join("\n")}`;
}

/** Minimal unified diff of one file, suitable for `git apply`. */
export function toUnifiedPatch(file: FileDiff): string {
  const old = file.oldPath ?? file.path;
  const out = [`--- a/${old}`, `+++ b/${file.path}`];
  for (const hunk of file.hunks) {
    out.push(`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`);
    out.push(...hunk.lines);
  }
  return `${out.join("\n")}\n`;
}
