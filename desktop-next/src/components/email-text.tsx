import type { ReactNode } from "react";
import { useAppearance } from "../lib/appearance";

const EMAIL = /[^\s@·]+@[^\s@·]+\.[^\s@·]+/g;

/** Blur email addresses while TheoMod is on. The address stays selectable. */
export function blurEmails(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(EMAIL)) {
    const index = match.index ?? 0;
    if (index > cursor) parts.push(text.slice(cursor, index));
    parts.push(
      <span key={index} className="email-blur" title={match[0]}>
        {match[0]}
      </span>,
    );
    cursor = index + match[0].length;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}

/** Shows text, blurring any email address while TheoMod is on. */
export function EmailText({ text }: { text: string }) {
  const theo = useAppearance((state) => state.theoMod);
  if (!theo) return text;
  return <>{blurEmails(text)}</>;
}
