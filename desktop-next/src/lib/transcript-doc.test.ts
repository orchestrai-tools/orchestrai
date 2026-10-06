import { taskForTranscript, transcriptPath, transcriptToMarkdown } from "./transcript-doc";
import { describe, expect, it } from "vitest";

describe("transcript doc", () => {
  it("writes a conversation as markdown under transcripts/", () => {
    expect(transcriptPath("Sketch the shell", "demo-task")).toBe("transcripts/sketch-the-shell.md");
    expect(
      transcriptToMarkdown("Sketch the shell", [
        { kind: "user_message", text: "Name the columns" },
        { kind: "agent_text", text: "Done." },
      ]),
    ).toBe("# Sketch the shell\n\n## You\n\nName the columns\n\n## Agent\n\nDone.\n");
    expect(
      taskForTranscript("transcripts/sketch-the-shell.md", [
        { id: "demo-task", title: "Sketch the shell", prompt: "Sketch the project-first shell" },
        { id: "other", title: "Queue the column", prompt: "" },
      ]),
    ).toBe("demo-task");
    expect(
      taskForTranscript("README.md", [{ id: "demo-task", title: "Sketch the shell", prompt: "" }]),
    ).toBe(null);
  });
});
