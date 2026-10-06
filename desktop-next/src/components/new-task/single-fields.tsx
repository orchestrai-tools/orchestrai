import { Checkbox } from "@warpforge/ui/components/checkbox";
import { Field, FieldLabel } from "@warpforge/ui/components/field";
import { SelectMenu } from "../common/select-menu";

/** The Single mode's own options: an isolated worktree with its base, and an advisor agent. */
export function SingleFields({
  worktree,
  onWorktree,
  base,
  onBase,
  branches,
  advisorOn,
  onAdvisorOn,
  advisor,
  onAdvisor,
  agents,
}: {
  worktree: boolean;
  onWorktree: (on: boolean) => void;
  base: string;
  onBase: (base: string) => void;
  branches: string[];
  advisorOn: boolean;
  onAdvisorOn: (on: boolean) => void;
  advisor: string;
  onAdvisor: (id: string) => void;
  agents: { id: string; displayName: string }[];
}) {
  return (
    <Field>
      <FieldLabel>Run</FieldLabel>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={worktree} onCheckedChange={(on) => onWorktree(on === true)} />
          Isolated worktree
        </label>
        {worktree && (
          <SelectMenu
            label="Worktree base"
            value={base}
            options={[
              { value: "", label: "From the current checkout" },
              { value: "origin", label: "From origin" },
              ...branches.map((branch) => ({ value: branch, label: `From ${branch}` })),
            ]}
            onChange={onBase}
            className="h-7 text-xs"
          />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={advisorOn} onCheckedChange={(on) => onAdvisorOn(on === true)} />
          Advisor
        </label>
        {advisorOn && (
          <SelectMenu
            label="Advisor"
            value={advisor}
            options={[
              { value: "", label: "Choose an agent" },
              ...agents.map((item) => ({ value: item.id, label: item.displayName })),
            ]}
            onChange={onAdvisor}
            className="h-7 text-xs"
          />
        )}
      </div>
    </Field>
  );
}
