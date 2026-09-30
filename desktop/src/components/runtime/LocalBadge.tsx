/** Marks a service or port-forward that the personal local config file added or changed. */
export function LocalBadge({ name, fields }: { name: string; fields?: string[] }) {
  const detail = fields && fields.length > 0 ? `: ${fields.join(", ")}` : "";
  const title = `${name} is set by your local config${detail}`;
  return (
    <span
      title={title}
      aria-label={title}
      className="shrink-0 rounded border border-border px-1 py-px text-[10px] leading-none text-muted-foreground"
    >
      local
    </span>
  );
}
