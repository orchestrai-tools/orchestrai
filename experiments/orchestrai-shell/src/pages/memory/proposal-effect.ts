import type { DreamProposal } from "@/data/memory"

/**
 * What approving does, said before the button is pressed. Only duplicate,
 * stale, and delete change memories; the others record the decision.
 * A duplicate keeps its first target, the oldest.
 */
export function proposalEffect(proposal: DreamProposal): { applies: boolean; text: string; deletes: string[] } {
  const count = proposal.targets.length
  switch (proposal.type) {
    case "duplicate":
      return { applies: count > 1, text: `Approving keeps the oldest memory and deletes the other ${count - 1}.`, deletes: proposal.targets.slice(1) }
    case "stale":
    case "delete":
      return { applies: true, text: `Approving deletes ${count} ${count === 1 ? "memory" : "memories"}.`, deletes: proposal.targets }
    default:
      return { applies: false, text: "Approving only records your decision. Open the memories to merge or edit them yourself.", deletes: [] }
  }
}
