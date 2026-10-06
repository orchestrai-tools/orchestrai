import { Fragment, type ReactNode } from "react";
import { splitSnippet } from "../../lib/memory-labels";

const MARK = "rounded-sm bg-yellow-200/70 text-foreground dark:bg-yellow-500/30";

function code(text: string, render: (segment: string, key: string) => ReactNode) {
  return text.split("`").map((segment, index) =>
    index % 2 ? (
      <code key={index} className="font-mono">
        {render(segment, `code-${index}`)}
      </code>
    ) : (
      <Fragment key={index}>{render(segment, `text-${index}`)}</Fragment>
    ),
  );
}

/** Inline `code` rendered as text, so stored content is never read as markup. */
export function InlineText({ text }: { text: string }) {
  return <>{code(text, (segment) => segment)}</>;
}

/** A search hit's snippet, with the daemon's `<b>` matches as marks and nothing else read as markup. */
export function SnippetText({ snippet }: { snippet: string }) {
  return (
    <>
      {splitSnippet(snippet).map((run) =>
        run.match ? (
          <mark key={run.at} className={MARK}>
            {run.text}
          </mark>
        ) : (
          <Fragment key={run.at}>{code(run.text, (segment) => segment)}</Fragment>
        ),
      )}
    </>
  );
}

export const KIND_LABEL: Record<string, string> = {
  fact: "Fact",
  decision: "Decision",
  preference: "Preference",
  gotcha: "Gotcha",
  note: "Note",
};

export function kindLabel(kind: string): string {
  return KIND_LABEL[kind] ?? kind;
}

export function when(seconds: number): string {
  if (!seconds) return "Unknown";
  return new Date(seconds * 1000).toLocaleString();
}
