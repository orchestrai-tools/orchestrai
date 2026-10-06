export const DOC_FOLDERS = ["Plans", "Transcripts", "Decisions", "Wiki"] as const;

export type DocFolder = (typeof DOC_FOLDERS)[number];

/** Where a project file sits in the docs library. */
export function docFolder(path: string): DocFolder {
  const parts = path.toLowerCase().split("/");
  if (parts.includes("transcripts")) return "Transcripts";
  if (parts.includes("plans")) return "Plans";
  if (parts.includes("adr") || parts.some((part) => part.includes("decision"))) return "Decisions";
  return "Wiki";
}

export function docsMatching<T extends { path: string; title: string; snippet?: string }>(
  docs: T[],
  query: string,
): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return docs;
  return docs.filter(
    (doc) =>
      doc.title.toLowerCase().includes(needle) ||
      doc.path.toLowerCase().includes(needle) ||
      (doc.snippet ?? "").toLowerCase().includes(needle),
  );
}
