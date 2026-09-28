export interface MemoryStats {
  globalCount: number;
  projectCount: number;
  embeddingMode: "hybrid" | "fts";
  scopesEnabled: {
    global: boolean;
    project: boolean;
  };
  perProjectDbExists: boolean;
  embeddingUnavailable?: string | null;
}

export type MemoryKind = "fact" | "decision" | "preference" | "gotcha" | "note";

/** One stored memory. `snippet` is only present on search hits and marks matches with `<b>`. */
export interface Memory {
  id: string;
  projectId?: string | null;
  /** `global` or `project:<id>`. */
  scope: string;
  kind: MemoryKind | string;
  content: string;
  createdAt: number;
  updatedAt: number;
  lastAccessed: number;
  createdBy?: string | null;
  supersededBy?: string | null;
  tags: string[];
  snippet?: string | null;
}

export type MemoryRelation = "related" | "supports" | "contradicts" | "supersedes";

export interface MemoryEdge {
  srcId: string;
  dstId: string;
  relation: MemoryRelation | string;
  createdAt: number;
}

export type MemoryProposalStatus = "pending" | "applied" | "approved" | "rejected";

/** A dreaming finding awaiting review. The daemon sends these keys in snake_case. */
export interface MemoryProposal {
  id: number;
  proposal_type: string | null;
  /** Comma-separated memory ids. */
  target_ids: string | null;
  reason: string | null;
  status: MemoryProposalStatus | string;
  created_at: number;
}
