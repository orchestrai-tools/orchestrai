import { useQuery } from "@tanstack/react-query";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { pickableBranches } from "@/lib/worktreeBase";
import type { GitBranchList, WorktreeBase } from "@/protocol";
import { daemonQuery } from "@/query";

const HEAD = "head";
const ORIGIN = "origin";
const BRANCH = "branch:";

function encode(base: WorktreeBase | null): string {
  if (base?.kind === "origin") return ORIGIN;
  if (base?.kind === "branch") return BRANCH + base.name;
  return HEAD;
}

function decode(value: string): WorktreeBase | null {
  if (value === ORIGIN) return { kind: "origin" };
  if (value.startsWith(BRANCH)) return { kind: "branch", name: value.slice(BRANCH.length) };
  return null;
}

/** Where an automation's run worktrees fork from. Every run starts a fresh
 *  task branch, so only fork bases are offered — never an existing branch. */
export function WorktreeBaseSelect({
  onChange,
  project,
  value,
}: {
  onChange: (next: WorktreeBase | null) => void;
  project: string;
  value: WorktreeBase | null;
}) {
  const branchQuery = useQuery({
    enabled: !!project,
    queryFn: daemonQuery<GitBranchList>("git.branches", { project }),
    queryKey: ["branches", "project", project],
  });
  const current = branchQuery.data?.current ?? null;
  const branches = pickableBranches(branchQuery.data).filter((branch) => branch !== current);
  const chosen = value?.kind === "branch" ? value.name : null;
  if (chosen && !branches.includes(chosen)) branches.unshift(chosen);

  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[11px] font-medium text-muted-foreground">Start each run from</span>
      <Select value={encode(value)} onValueChange={(next) => onChange(decode(next))}>
        <SelectTrigger aria-label="Worktree base" className="h-8 w-64">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={HEAD}>
            {current ? "Current branch (" + current + ")" : "Current branch"}
          </SelectItem>
          <SelectItem value={ORIGIN}>Latest from origin</SelectItem>
          {branches.map((branch) => (
            <SelectItem key={branch} value={BRANCH + branch}>
              {branch}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
