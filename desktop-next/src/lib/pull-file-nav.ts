const NAV_KEYS = new Set(["[", "]", "{", "}"]);

/** The file `[` `]` land on, or the next unviewed file for `{` `}`. */
export function nextDiffPath(
  paths: readonly string[],
  active: string,
  key: string,
  viewed: ReadonlySet<string>,
): string | null {
  if (!NAV_KEYS.has(key) || paths.length === 0) return null;
  const unviewedOnly = key === "}" || key === "{";
  const step = key === "]" || key === "}" ? 1 : -1;
  const current = paths.indexOf(active);
  if (unviewedOnly) {
    const candidates =
      current < 0
        ? step === 1
          ? paths
          : [...paths].reverse()
        : step === 1
          ? paths.slice(current + 1)
          : paths.slice(0, current).reverse();
    return candidates.find((path) => !viewed.has(path)) ?? null;
  }
  const index = current < 0 ? (step === 1 ? 0 : paths.length - 1) : current + step;
  return paths[Math.min(paths.length - 1, Math.max(0, index))] ?? null;
}

/** `[` `]` step files, `{` `}` skip viewed ones, and `v` ticks the open file. */
export function diffFileKeyAction(
  event: {
    key: string;
    metaKey: boolean;
    ctrlKey: boolean;
    altKey: boolean;
    preventDefault: () => void;
  },
  state: { paths: readonly string[]; active: string; viewed: ReadonlySet<string>; typing: boolean },
): { select?: string; toggle?: boolean } | null {
  if (state.typing || event.metaKey || event.ctrlKey || event.altKey) return null;
  if (event.key === "v") {
    if (!state.active) return null;
    event.preventDefault();
    return { toggle: true };
  }
  if (!NAV_KEYS.has(event.key)) return null;
  event.preventDefault();
  const select = nextDiffPath(state.paths, state.active, event.key, state.viewed);
  return select ? { select } : {};
}
