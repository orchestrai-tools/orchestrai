import { daemon } from "@warpforge/daemon";
import type { MemoryStats } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "../../components/common/confirm-dialog";
import { SelectMenu } from "../../components/common/select-menu";
import { startDream } from "../../lib/dream";
import { useShell } from "../../lib/shell-store";
import { useDaemon } from "../../lib/use-daemon";
import { Choice, ErrorLine, Group, ROW_SELECT, Row, SectionHeader } from "./primitives";

type Search = "none" | "fastembed";

const SEARCH = [
  { value: "none", label: "Keywords" },
  { value: "fastembed", label: "Hybrid" },
] as const;

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** Memory search mode, what is stored where, and a manual dream sweep. */
export function MemorySection() {
  const current = useShell((state) => state.project);
  const projects = useDaemon().snapshot.projects;
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [mode, setMode] = useState<Search>("none");
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [dreamProject, setDreamProject] = useState("");
  const dreamTarget = dreamProject || current;

  useEffect(() => {
    void daemon
      .memoryStats()
      .then((next) => {
        setStats(next);
        setMode(next.embeddingMode === "hybrid" ? "fastembed" : "none");
        setError(null);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Could not load memory search"),
      );
  }, [reload]);

  async function apply(next: Search) {
    try {
      const result = await daemon.setMemoryEmbedding(next);
      const applied = result.embeddingMode === "hybrid" ? "fastembed" : "none";
      setStats(result);
      setMode(applied);
      if (next === "fastembed" && applied !== "fastembed") {
        toast.warning("Still on keyword search", {
          description: result.embeddingUnavailable
            ? `${result.embeddingUnavailable}. On macOS, brew install onnxruntime, then pick Hybrid again.`
            : "The model downloads on the next search. Offline, search stays on keywords.",
        });
        return;
      }
      toast.success("Memory search saved");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not change memory search");
    }
  }

  const unavailable = stats?.embeddingUnavailable ?? null;

  return (
    <>
      <SectionHeader
        title="Memory"
        scope="Durable facts agents store and search, shared across agents. Every project."
      />

      <Group
        title="Search"
        note="Project memory is written only after a task's pull request merges, and the next task gets a short ranked slice of it."
      >
        {error && <ErrorLine message={error} onRetry={() => setReload((count) => count + 1)} />}
        <Row
          title={mode === "fastembed" ? "Keywords and meaning" : "Keywords"}
          description={
            mode === "fastembed"
              ? "Hybrid search. Falls back to keywords when offline."
              : "Full-text search. Hybrid adds meaning with a local model of about 80 MB."
          }
          control={
            <Choice
              label="Memory search"
              value={mode}
              onChange={(next) => {
                if (next === "fastembed") return setConfirming(true);
                setMode(next);
                void apply(next);
              }}
              options={SEARCH}
            />
          }
        />
        {unavailable && (
          <p className="py-2 text-xs text-amber-700 dark:text-amber-400">
            Last attempt at hybrid search failed: {unavailable}. On macOS, brew install onnxruntime,
            then pick Hybrid again.
          </p>
        )}
        {stats && (
          <>
            <Row
              title="Global memory"
              description={`${plural(stats.globalCount, "fact")} any project's agents may read and add to.`}
              control={
                <span className="text-xs text-muted-foreground">
                  {stats.scopesEnabled.global ? "on" : "off"}
                </span>
              }
            />
            <Row
              title="Project memory"
              description={`${plural(stats.projectCount, "fact")} across projects, kept apart. ${
                stats.perProjectDbExists
                  ? "This project has its own store."
                  : "Only the global store exists so far."
              }`}
              control={
                <span className="text-xs text-muted-foreground">
                  {stats.scopesEnabled.project ? "on" : "off"}
                </span>
              }
            />
          </>
        )}
      </Group>

      <Group
        title="Dreaming"
        note="Findings become pending proposals on the Memory page. Nothing is applied without you."
      >
        <Row
          title="Dream now"
          description="Sweeps memory for duplicates, contradictions, and stale facts. A dry run reports what it would propose and writes nothing."
          control={
            <>
              <SelectMenu
                label="Memory to sweep"
                value={dreamProject}
                onChange={setDreamProject}
                options={[
                  { value: "", label: current ? `This project (${current})` : "Global" },
                  ...projects.map((project) => ({ value: project.name, label: project.name })),
                ]}
                className={ROW_SELECT}
              />
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => startDream(dreamTarget, true)}
              >
                Dry run
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => startDream(dreamTarget, false)}
              >
                Dream
              </Button>
            </>
          }
        />
      </Group>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Turn on hybrid search?"
        description="The first search downloads a model of about 80 MB and needs ONNX Runtime. On macOS that is brew install onnxruntime. If it cannot load, search stays on keywords."
        confirmLabel="Turn on"
        tone="default"
        onConfirm={() => void apply("fastembed")}
      />
    </>
  );
}
