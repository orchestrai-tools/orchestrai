import { Fragment, type ReactNode } from "react"

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** Inline `code` and search marks rendered as text, so stored content is never read as markup. */
export function InlineText({ text, marks = [] }: { text: string; marks?: readonly string[] }) {
  const pattern = marks.length ? new RegExp(`(\\b(?:${marks.map(escape).join("|")})\\w*)`, "gi") : null
  const highlight = (segment: string, key: string): ReactNode =>
    pattern
      ? segment.split(pattern).map((part, index) =>
          index % 2 ? (
            <mark key={`${key}-${index}`} className="rounded-sm bg-yellow-200/70 text-foreground dark:bg-yellow-500/30">
              {part}
            </mark>
          ) : (
            <Fragment key={`${key}-${index}`}>{part}</Fragment>
          )
        )
      : segment
  return (
    <>
      {text.split("`").map((segment, index) =>
        index % 2 ? (
          <code key={index} className="font-mono">
            {highlight(segment, `code-${index}`)}
          </code>
        ) : (
          <Fragment key={index}>{highlight(segment, `text-${index}`)}</Fragment>
        )
      )}
    </>
  )
}
