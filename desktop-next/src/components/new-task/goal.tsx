import type { PromptAttachment } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import { Field, FieldLabel } from "@warpforge/ui/components/field";
import { Textarea } from "@warpforge/ui/components/textarea";
import { PaperclipIcon, XIcon } from "lucide-react";
import { useRef, useState } from "react";

import { rankFiles } from "../../lib/file-rank";
import { FILE_REF_MIME, insertFileRef, replaceMention } from "../../lib/mention-path";
import { MentionMenu } from "../../pages/task/composer-parts";
import type { TaskFiles } from "../../pages/task/use-task-files";

/** The initial prompt supports the same project references and uploads as a follow-up. */
export function TaskGoal({
  id,
  prompt,
  onPrompt,
  orchestrator,
  files,
  attachments,
  onAttach,
  onRemove,
  onSubmit,
  disabled = false,
}: {
  disabled?: boolean;
  id: string;
  prompt: string;
  onPrompt: (text: string) => void;
  orchestrator: boolean;
  files: TaskFiles;
  attachments: PromptAttachment[];
  onAttach: (files: File[]) => void;
  onRemove: (index: number) => void;
  onSubmit: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState(0);
  const at = prompt.lastIndexOf("@");
  const mentioning = at >= 0 && !/\s/.test(prompt.slice(at + 1));
  const matches = mentioning ? rankFiles(files.files, prompt.slice(at + 1)).slice(0, 8) : [];
  const pick = (path: string) => onPrompt(replaceMention(prompt, at, prompt.length, path).value);
  return (
    <Field>
      <FieldLabel htmlFor={id}>Goal</FieldLabel>
      <div
        className="relative"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          if (disabled) return;
          const path = event.dataTransfer.getData(FILE_REF_MIME);
          if (path) onPrompt(insertFileRef(prompt, prompt.length, path).value);
          else onAttach([...event.dataTransfer.files]);
        }}
      >
        {mentioning && (
          <MentionMenu
            files={matches}
            active={active}
            loading={files.loading}
            error={files.error}
            onPick={pick}
          />
        )}
        <Textarea
          id={id}
          autoFocus
          disabled={disabled}
          rows={4}
          value={prompt}
          placeholder={
            orchestrator
              ? "What should the orchestrator coordinate?"
              : "What should be true when this is done? @ a file."
          }
          onChange={(event) => {
            setActive(0);
            onPrompt(event.target.value);
          }}
          onPaste={(event) => {
            if (event.clipboardData.files.length) {
              event.preventDefault();
              onAttach([...event.clipboardData.files]);
            }
          }}
          onKeyDown={(event) => {
            const meta = event.metaKey || event.ctrlKey;
            if (meta && event.shiftKey && /^(a|i)$/i.test(event.key)) {
              event.preventDefault();
              input.current?.click();
            } else if (meta && event.key === "Enter") {
              event.preventDefault();
              onSubmit();
            } else if (matches.length && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
              event.preventDefault();
              setActive(
                (index) =>
                  (index + (event.key === "ArrowDown" ? 1 : matches.length - 1)) % matches.length,
              );
            } else if (matches.length && (event.key === "Tab" || event.key === "Enter")) {
              event.preventDefault();
              pick((matches[active] ?? matches[0]).path);
            }
          }}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="xs" onClick={() => input.current?.click()}>
          <PaperclipIcon /> Attach files
        </Button>
        <input
          ref={input}
          type="file"
          multiple
          disabled={disabled}
          className="hidden"
          aria-label="Attach files to goal"
          onChange={(event) => {
            onAttach([...(event.target.files ?? [])]);
            event.target.value = "";
          }}
        />
        {attachments.map((attachment, index) => {
          const name = attachment.type === "file" ? attachment.path : attachment.name;
          return (
            <span
              key={`${name}:${index}`}
              className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs"
            >
              {name}
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                aria-label={`Remove ${name}`}
                onClick={() => onRemove(index)}
              >
                <XIcon />
              </Button>
            </span>
          );
        })}
      </div>
    </Field>
  );
}
