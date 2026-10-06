import { Fragment, useState } from "react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

/** Splits a trailing ` # comment` off a line so it can be shown quieter than the value. */
function splitComment(line: string): [string, string] {
  if (line.trimStart().startsWith("#")) return ["", line]
  const at = line.indexOf(" # ")
  return at === -1 ? [line, ""] : [line.slice(0, at), line.slice(at)]
}

export function YamlView({ text }: { text: string }) {
  const lines = text.replace(/\n$/, "").split("\n")
  return (
    <pre className="overflow-x-auto rounded-md bg-muted/50 py-3 font-mono text-xs leading-5">
      <code className="grid grid-cols-[auto_minmax(0,1fr)]">
        {lines.map((line, index) => {
          const [value, comment] = splitComment(line)
          return (
            <Fragment key={index}>
              <span className="pr-4 pl-3 text-right text-muted-foreground/60 tabular-nums select-none">{index + 1}</span>
              <span className="pr-3 whitespace-pre">
                {value}
                {comment && <span className="text-muted-foreground">{comment}</span>}
                {!line && " "}
              </span>
            </Fragment>
          )
        })}
      </code>
    </pre>
  )
}

/** The file is the source of truth; the editor writes it and the daemon reads it back. */
export function YamlEditor({
  file,
  initial,
  onSave,
  onCancel,
}: {
  file: string
  initial: string
  onSave: (text: string) => void
  onCancel: () => void
}) {
  const [text, setText] = useState(initial)
  const changed = text !== initial
  return (
    <div className="flex flex-col gap-2">
      <Textarea
        aria-label={`Edit ${file}`}
        autoFocus
        spellCheck={false}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "s" && event.metaKey) {
            event.preventDefault()
            onSave(text)
          }
        }}
        className="min-h-96 font-mono text-xs leading-5"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={!changed} onClick={() => onSave(text)}>
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <p className="text-xs text-muted-foreground">
          Saving writes <span className="font-mono">{file}</span>. OrchestrAI reads it again; a file that does not load stays listed,
          greyed, with the reason.
        </p>
      </div>
    </div>
  )
}
