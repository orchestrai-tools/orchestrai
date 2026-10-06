let demoHistory = {
  deleteClosedAfterDays: 90,
  retentionDays: 30,
  settleIgnoredAfterDays: 14,
};

/** Read or write how long the demo keeps task history. */
export function demoHistorySettings(method: string, params: Record<string, unknown>) {
  if (method === "history.getSettings") return { ...demoHistory };
  if (method !== "history.setSettings") return null;
  demoHistory = {
    deleteClosedAfterDays: Number(params.delete_closed_after_days),
    retentionDays: Number(params.retention_days),
    settleIgnoredAfterDays: Number(params.settle_ignored_after_days),
  };
  return { ...demoHistory };
}

/** Demo answer for switching search to text-and-meaning. */
export function demoEmbedding(mode: unknown) {
  const hybrid = String(mode) === "fastembed";
  return {
    embeddingMode: "fts",
    embeddingUnavailable: hybrid ? "ONNX Runtime unavailable" : null,
    globalCount: 0,
    perProjectDbExists: true,
    projectCount: 1,
    scopesEnabled: { global: true, project: true },
  };
}
