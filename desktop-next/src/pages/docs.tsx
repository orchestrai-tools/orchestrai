import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { ConfirmRequestDialog, type ConfirmRequest } from "../components/common/confirm-dialog";
import { PageBody, PageToolbar } from "../components/common/page-toolbar";
import { useDocsSave } from "../lib/docs-palette";
import { useShell } from "../lib/shell-store";
import { taskForTranscript } from "../lib/transcript-doc";
import { useDaemon } from "../lib/use-daemon";
import { DocNav } from "./docs/doc-nav";
import { DocPage } from "./docs/doc-page";
import { useDocFile, useDocList } from "./docs/use-docs";

/**
 * The docs library: the agents' plans and transcripts beside the wiki, as
 * rendered pages with a real markdown editor one toggle away.
 */
export function Docs() {
  const project = useShell((state) => state.project);
  if (!project) {
    return (
      <PageBody>
        <PageToolbar title="Docs" />
        <p className="text-sm text-muted-foreground">Open a project to read its docs.</p>
      </PageBody>
    );
  }
  return <ProjectDocs key={project} project={project} />;
}

function ProjectDocs({ project }: { project: string }) {
  const openTask = useShell((state) => state.openTask);
  const setFileJump = useShell((state) => state.setFileJump);
  const allTasks = useDaemon().snapshot.tasks;
  const list = useDocList(project);
  const [chosen, setChosen] = useState<string | null>(null);
  const path =
    chosen ??
    list.docs.find((doc) => doc.path === "README.md")?.path ??
    list.docs[0]?.path ??
    "README.md";
  const file = useDocFile(project, path);
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const known = useMemo(() => new Set(list.docs.map((doc) => doc.path)), [list.docs]);
  const tasks = useMemo(
    () => allTasks.filter((task) => task.project === project),
    [allTasks, project],
  );
  const wroteIt = taskForTranscript(path, tasks);
  const open = list.docs.find((doc) => doc.path === path);
  const navigate = (next: string) => {
    if (next === path) return;
    const go = () => {
      setNote("");
      setChosen(next);
    };
    if (!file.dirty) return go();
    setConfirm({
      title: "Discard your edits?",
      description: `${path} has changes that are not saved. Opening ${next} loses them.`,
      confirmLabel: "Discard",
      destructive: true,
      onConfirm: go,
    });
  };

  const { write, draft } = file;
  const reloadList = list.reload;
  const save = useCallback(
    async (target: string) => {
      try {
        await write(target, draft);
        setNote("Saved");
        if (target !== path) setChosen(target);
        void reloadList();
      } catch (err) {
        const reason = err instanceof Error ? err.message : "Could not save";
        setNote(reason);
        toast.error(reason);
      }
    },
    [write, draft, path, reloadList],
  );

  const saveOpen = useCallback(() => void save(path), [save, path]);
  useDocsSave(saveOpen);

  const openLink = (target: string, line: number) => {
    if (target.toLowerCase().endsWith(".md")) navigate(target);
    else setFileJump({ path: target, line });
  };

  return (
    <div className="grid h-full grid-cols-[15rem_1fr]">
      <DocNav
        docs={list.docs}
        loading={list.loading}
        error={list.error}
        selected={path}
        onSelect={navigate}
        onRetry={() => void list.reload()}
      />
      <div className="min-h-0 overflow-y-auto">
        <DocPage
          path={path}
          updated={open?.updated}
          draft={file.draft}
          loading={file.loading}
          error={file.error}
          dirty={file.dirty}
          note={note}
          known={known}
          wroteIt={wroteIt}
          onDraft={(text) => {
            setNote("");
            file.setDraft(text);
          }}
          onSave={(target) => void save(target)}
          onNavigate={navigate}
          onOpenLink={openLink}
          onOpenTask={(id) => openTask(id, project)}
        />
      </div>
      <ConfirmRequestDialog request={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}
