import {
  Children,
  createContext,
  isValidElement,
  useContext,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { cn } from "@warpforge/ui/lib/utils";
import { isExternalLink, openExternalLink } from "../lib/external-link";
import { resolveMention } from "../lib/mention-path";
import { useAppearance } from "../lib/appearance";
import { MermaidDiagram } from "./mermaid-diagram";
import { blurEmails } from "./email-text";

/** The reading surface: rendered GitHub-flavoured markdown at a comfortable measure. */
const PROSE =
  "prose prose-sm prose-neutral max-w-none dark:prose-invert prose-headings:font-semibold prose-h1:text-xl prose-h2:text-base prose-a:text-foreground prose-code:rounded-sm prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:font-normal prose-code:before:content-none prose-code:after:content-none prose-pre:rounded-md prose-pre:bg-muted prose-pre:text-foreground prose-table:text-xs [&_.contains-task-list]:list-none [&_.contains-task-list]:pl-0";

const EMPTY_PATHS = new Set<string>();
const OpenFile = createContext<{
  known: ReadonlySet<string>;
  open?: (path: string, line: number) => void;
}>({ known: EMPTY_PATHS });

export { blurEmails } from "./email-text";

function blurNode(node: ReactNode, on: boolean): ReactNode {
  if (!on) return node;
  if (typeof node === "string") return blurEmails(node);
  if (Array.isArray(node)) return node.map((child) => blurNode(child, true));
  return node;
}

function MarkdownCode({ children, className }: { children?: ReactNode; className?: string }) {
  const files = useContext(OpenFile);
  const text = String(children ?? "");
  const mention = text.includes("\n") ? null : resolveMention(text, files.known);
  if (mention && files.open) {
    return (
      <button
        type="button"
        className="rounded-sm bg-muted px-1 py-0.5 font-mono text-[0.9em] text-foreground underline decoration-muted-foreground/50 underline-offset-2 hover:decoration-foreground"
        onClick={() => files.open?.(mention.path, mention.line)}
      >
        {text}
      </button>
    );
  }
  return <code className={className}>{children}</code>;
}

const components: Components = {
  a: ({ children, href }) => {
    const files = useContext(OpenFile);
    const external = Boolean(href && isExternalLink(href));
    const mention = href && !external ? resolveMention(href, files.known) : null;
    return (
      <a
        href={href}
        target={external ? "_blank" : undefined}
        rel={external ? "noreferrer" : undefined}
        onClick={(event) => {
          if (mention && files.open) {
            event.preventDefault();
            files.open(mention.path, mention.line);
            return;
          }
          if (!href || !external) return;
          event.preventDefault();
          void openExternalLink(href);
        }}
      >
        {children}
      </a>
    );
  },
  pre: ({ children }) => {
    const only = Children.toArray(children)[0];
    if (isValidElement(only) && only.type === MarkdownCode) {
      const props = only.props as { className?: string; children?: ReactNode };
      const source = String(props.children ?? "").replace(/\n$/, "");
      if (/(^|\s)language-mermaid(\s|$)/.test(props.className ?? "")) {
        return <MermaidDiagram code={source} />;
      }
      return <CodeBlock text={source}>{props.children}</CodeBlock>;
    }
    return <pre className="font-mono">{children}</pre>;
  },
  code: MarkdownCode,
  details: ({ children }) => <details className="rounded-md border px-3 py-2 [&_summary]:cursor-pointer">{children}</details>,
  summary: ({ children }) => <summary>{children}</summary>,
  table: ({ children }) => (
    <div className="overflow-x-auto">
      <table>{children}</table>
    </div>
  ),
};

/**
 * GitHub bodies use `<details>` for release notes. Those tags are not in the
 * default sanitizer schema. Scripts, styles, and event handlers stay out.
 */
const HTML_SCHEMA = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), "details", "summary"],
  attributes: {
    ...defaultSchema.attributes,
    details: [...(defaultSchema.attributes?.details ?? []), "open"],
    img: [...(defaultSchema.attributes?.img ?? []), "alt", "title"],
  },
};

const HTML_PLUGINS: NonNullable<ComponentProps<typeof ReactMarkdown>["rehypePlugins"]> = [
  rehypeRaw,
  [rehypeSanitize, HTML_SCHEMA],
];

/** GitHub-flavored markdown for messages and docs. */
export function Markdown({
  children,
  known,
  onOpenFile,
  allowHtml = false,
  image,
  className,
}: {
  children: string;
  known?: ReadonlySet<string>;
  onOpenFile?: (path: string, line: number) => void;
  /** Render sanitized HTML. Use this for GitHub and tracker bodies only. */
  allowHtml?: boolean;
  /** Replaces `<img>`, e.g. to load tracker attachments the WebView cannot fetch itself. */
  image?: Components["img"];
  className?: string;
}) {
  const theo = useAppearance((state) => state.theoMod);
  const base: Components = image ? { ...components, img: image } : components;
  const themed: Components = theo
    ? {
        ...base,
        p: ({ children: body }) => <p>{blurNode(body, true)}</p>,
        li: ({ children: body }) => <li>{blurNode(body, true)}</li>,
      }
    : base;
  return (
    <OpenFile.Provider value={{ known: known ?? EMPTY_PATHS, open: onOpenFile }}>
      <div className={cn(PROSE, className)}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={allowHtml ? HTML_PLUGINS : undefined}
          components={themed}
        >
          {children}
        </ReactMarkdown>
      </div>
    </OpenFile.Provider>
  );
}

function CodeBlock({ text, children }: { text: string; children: ReactNode }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="group/code relative">
      <pre className="font-mono">
        <code>{children}</code>
      </pre>
      <button
        type="button"
        className="absolute top-1.5 right-1.5 rounded-sm bg-background/80 px-1.5 py-0.5 text-[11px] text-muted-foreground opacity-0 transition-opacity group-hover/code:opacity-100 hover:text-foreground focus-visible:opacity-100"
        onClick={() => {
          void navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
          });
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
