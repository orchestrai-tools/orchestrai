import { Fragment } from "react"

/** Backticks become code; with `mentions`, an @handle reads in weight rather than colour. */
export function InlineText({ text, mentions = false }: { text: string; mentions?: boolean }) {
  return (
    <>
      {text.split(/(`[^`]+`)/g).map((part, index) =>
        part.length > 1 && part.startsWith("`") && part.endsWith("`") ? (
          <code key={index} className="rounded-sm bg-muted px-1 font-mono">
            {part.slice(1, -1)}
          </code>
        ) : (
          <Fragment key={index}>
            {mentions
              ? part.split(/(@[a-z0-9-]+)/gi).map((piece, inner) =>
                  piece.startsWith("@") ? (
                    <span key={inner} className="font-medium text-foreground">
                      {piece}
                    </span>
                  ) : (
                    <Fragment key={inner}>{piece}</Fragment>
                  )
                )
              : part}
          </Fragment>
        )
      )}
    </>
  )
}
