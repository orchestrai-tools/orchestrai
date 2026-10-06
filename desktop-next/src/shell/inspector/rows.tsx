import { openExternalLink } from "../../lib/external-link";
import type { ReactNode } from "react";

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-2 py-(--row-py) text-xs">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate">{children}</dd>
    </div>
  );
}

export function Rows({ children }: { children: ReactNode }) {
  return <dl className="px-4 py-2">{children}</dl>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="p-4 text-xs text-muted-foreground">{children}</p>;
}

export function LinkText({ url, children }: { url: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={() => void openExternalLink(url)}
      className="truncate text-left underline-offset-2 hover:underline"
    >
      {children}
    </button>
  );
}

/** A service port; a running one opens in the browser. */
export function Port({ port, running }: { port: number; running: boolean }) {
  if (port <= 0) return <span className="text-muted-foreground">None</span>;
  if (!running) return <span className="font-mono">{port}</span>;
  return (
    <LinkText url={`http://localhost:${port}`}>
      <span className="font-mono">{port}</span>
    </LinkText>
  );
}
