import { useEffect } from "react";
import { toast } from "sonner";
import { create } from "zustand";
import { useShell } from "./shell-store";
import type { PaletteAction } from "./task-palette";

/** Bumps when the palette asks the channel to load again. */
export const useChannelRefresh = create<{ tick: number; refresh: () => void }>((set) => ({
  tick: 0,
  refresh: () => set((state) => ({ tick: state.tick + 1 })),
}));

let postChannel: ((role: "human" | "agent") => void) | null = null;

/** The open channel registers its post so the palette can run it. */
export function useChannelPost(post: (role: "human" | "agent") => void): void {
  useEffect(() => {
    postChannel = post;
    return () => {
      postChannel = null;
    };
  }, [post]);
}

function send(role: "human" | "agent"): void {
  useShell.getState().setPage("channel");
  const field = document.querySelector('textarea[aria-label="Channel message"]');
  const text = field instanceof HTMLTextAreaElement ? field.value.trim() : "";
  if (!text || !postChannel) {
    toast.error("Write a message first");
    return;
  }
  postChannel(role);
}

/** Refresh the thread, or post the message already typed. */
export function channelPaletteActions(project: string | null): PaletteAction[] {
  if (!project) return [];
  return [
    {
      id: "refresh-channel",
      label: "Refresh channel",
      run: () => {
        useShell.getState().setPage("channel");
        useChannelRefresh.getState().refresh();
      },
    },
    { id: "post-channel", label: "Post to channel", run: () => send("human") },
    { id: "post-channel-agent", label: "Post as agent", run: () => send("agent") },
  ];
}
