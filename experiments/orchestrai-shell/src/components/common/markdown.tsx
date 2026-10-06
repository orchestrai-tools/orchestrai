import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"

import { cn } from "@/lib/utils"

/** The reading surface: rendered GitHub-flavoured markdown at a comfortable measure. */
export function MarkdownPage({ markdown, className }: { markdown: string; className?: string }) {
  return (
    <article
      className={cn(
        "prose prose-sm prose-neutral max-w-none dark:prose-invert prose-headings:font-semibold prose-h1:text-xl prose-h2:text-base prose-a:text-foreground prose-code:rounded-sm prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:font-normal prose-code:before:content-none prose-code:after:content-none prose-pre:rounded-md prose-pre:bg-muted prose-pre:text-foreground prose-table:text-xs [&_.contains-task-list]:list-none [&_.contains-task-list]:pl-0",
        className
      )}
    >
      <Markdown remarkPlugins={[remarkGfm]}>{markdown}</Markdown>
    </article>
  )
}
