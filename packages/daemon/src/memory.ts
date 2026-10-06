import type { Memory, MemoryEdge, MemoryProposal, MemoryStats } from "@warpforge/protocol";
import type { CoreClient } from "./client";
import type { Constructor } from "./types";

export function MemoryMethods<TBase extends Constructor<CoreClient>>(Base: TBase) {
  return class extends Base {
    async memoryStats(): Promise<MemoryStats> {
      return (await this.request("memory.stats", {})) as MemoryStats;
    }

    async setMemoryEmbedding(mode: string): Promise<MemoryStats> {
      return (await this.request("memory.setEmbedding", { mode })) as MemoryStats;
    }

    async memoryDream(dryRun: boolean, projectId?: string | null): Promise<unknown> {
      return this.request("memory.dream", { dry_run: dryRun, project_id: projectId ?? null });
    }

    async listMemories(params: {
      scope?: string;
      kind?: string;
      limit?: number;
      offset?: number;
    }): Promise<Memory[]> {
      return (await this.request("memory.list", params)) as Memory[];
    }

    async searchMemories(params: {
      query: string;
      scope?: string;
      limit?: number;
      mode?: string;
    }): Promise<Memory[]> {
      return (await this.request("memory.search", params)) as Memory[];
    }

    async updateMemory(id: string, content: string): Promise<Memory> {
      return (await this.request("memory.update", { id, content })) as Memory;
    }

    async deleteMemory(id: string): Promise<void> {
      await this.request("memory.delete", { id });
    }

    async memoryEdges(id: string): Promise<MemoryEdge[]> {
      return (await this.request("memory.edges", { id })) as MemoryEdge[];
    }

    async addMemoryEdge(srcId: string, dstId: string, relation: string): Promise<MemoryEdge> {
      return (await this.request("memory.addEdge", {
        src_id: srcId,
        dst_id: dstId,
        relation,
      })) as MemoryEdge;
    }

    async listMemoryProposals(): Promise<MemoryProposal[]> {
      const res = (await this.request("memory.listCompaction", {})) as {
        proposals: MemoryProposal[];
      };
      return res.proposals;
    }

    async resolveMemoryProposal(
      id: number,
      approve: boolean,
      apply = false,
    ): Promise<{ status: string }> {
      return (await this.request("memory.resolveCompaction", { id, approve, apply })) as {
        status: string;
      };
    }
  };
}
