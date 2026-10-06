import { useEffect } from "react";
import { pageForGoKey } from "../model/pages";
import {
  attachFile,
  largerText,
  openSettings,
  quitApp,
  resetText,
  searchInFiles,
  smallerText,
  toggleAddProject,
  toggleFocus,
  toggleInspector,
  toggleNewTask,
  toggleSidebar,
  toggleTerminal,
} from "./actions";
import { openNewBranch, openPush, syncBranch } from "./domain-actions";
import { newChat } from "./quick-chat";
import { currentPage, cycleOpenProject, useShell } from "./shell-store";
import { isTypingTarget } from "./editor-nav";
import { escapeClosesDialog } from "./close-on-escape";

export function Shortcuts() {
  const shell = useShell();
  useEffect(() => {
    let pendingG = false;
    let goTimer = 0;
    let lastShift = 0;
    function clearGo() {
      pendingG = false;
      window.clearTimeout(goTimer);
    }
    function onKey(event: KeyboardEvent) {
      const meta = event.metaKey || event.ctrlKey;
      if (meta || event.altKey) clearGo();
      if (event.key === "Shift" && !meta && !event.altKey && !isTypingTarget(event.target)) {
        const now = Date.now();
        if (now - lastShift < 400) {
          useShell.getState().openPalette("files");
          lastShift = 0;
        } else lastShift = now;
        return;
      }
      if (event.key === "p" && meta && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        const current = useShell.getState();
        if (current.palette && current.paletteMode === "files") current.toggle("palette");
        else current.openPalette("files");
        return;
      }
      if ((event.key === "k" || event.key === "K") && meta && event.shiftKey) {
        event.preventDefault();
        openPush();
        return;
      }
      if (event.key === "k" && meta && !event.shiftKey) {
        event.preventDefault();
        const current = useShell.getState();
        if (current.palette && current.paletteMode === "actions") current.toggle("palette");
        else current.openPalette("actions");
        return;
      }
      if (event.key === "n" && meta && event.altKey && !event.shiftKey) {
        event.preventDefault();
        openNewBranch();
        return;
      }
      if (event.key === "t" && meta && !event.shiftKey && !event.altKey) {
        const onBrowser =
          shell.taskTab === "browser" &&
          shell.taskId != null &&
          !shell.home &&
          currentPage(shell) === "task";
        if (onBrowser) return;
        event.preventDefault();
        syncBranch();
        return;
      }
      if (event.key === "q" && meta && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        quitApp();
        return;
      }
      if (
        meta &&
        event.shiftKey &&
        (event.key === "a" || event.key === "A" || event.key === "i" || event.key === "I") &&
        !isTypingTarget(event.target)
      ) {
        event.preventDefault();
        attachFile();
        return;
      }
      if (event.key === "n" && meta && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        toggleNewTask();
        return;
      }
      if ((event.key === "n" || event.key === "N") && meta && event.shiftKey && !event.altKey) {
        event.preventDefault();
        void newChat();
        return;
      }
      if (event.key === "," && meta) {
        event.preventDefault();
        openSettings();
        return;
      }
      if (event.key === "o" && meta && !event.shiftKey) {
        event.preventDefault();
        toggleAddProject();
        return;
      }
      if (event.key === "f" && meta && event.shiftKey) {
        event.preventDefault();
        searchInFiles();
        return;
      }
      if (meta && (event.key === "=" || event.key === "+")) {
        event.preventDefault();
        largerText();
        return;
      }
      if (meta && event.key === "-") {
        event.preventDefault();
        smallerText();
        return;
      }
      if (meta && event.key === "0") {
        event.preventDefault();
        resetText();
        return;
      }
      if (event.ctrlKey && !event.metaKey && event.key === "Tab") {
        event.preventDefault();
        const name = cycleOpenProject(shell, event.shiftKey ? -1 : 1);
        if (name == null) shell.openHome();
        else shell.openProject(name);
        return;
      }
      if (meta && event.shiftKey && (event.key === "[" || event.key === "]")) {
        event.preventDefault();
        const name = cycleOpenProject(shell, event.key === "[" ? -1 : 1);
        if (name == null) shell.openHome();
        else shell.openProject(name);
        return;
      }
      if (event.ctrlKey && !event.metaKey && event.key >= "1" && event.key <= "9") {
        event.preventDefault();
        const index = Number(event.key);
        if (index === 1) shell.openHome();
        else {
          const name = shell.openProjects[index - 2];
          if (name) shell.openProject(name);
        }
        return;
      }
      if (event.key === "\\" && meta && event.shiftKey) {
        event.preventDefault();
        toggleFocus();
        return;
      }
      if (event.key === "\\" && meta) {
        event.preventDefault();
        toggleSidebar();
        return;
      }
      if (event.key === "`" && event.ctrlKey) {
        event.preventDefault();
        toggleTerminal();
        return;
      }
      if (event.key === "i" && meta && event.altKey) {
        event.preventDefault();
        toggleInspector();
        return;
      }
      if (meta && event.key >= "1" && event.key <= "7" && shell.taskId && !shell.home) {
        event.preventDefault();
        const index = Number(event.key);
        if (index === 1) {
          shell.setPage("task");
          shell.setTaskTab("conversation");
        } else if (index === 2) shell.setPage("files");
        else if (index === 3) shell.setPage("changes");
        else if (index === 4) shell.setPage("services");
        else if (index === 5) shell.toggle("terminal");
        else if (index === 6) {
          shell.setPage("task");
          shell.setTaskTab("browser");
        } else if (index === 7) {
          shell.setPage("task");
          shell.setTaskTab("steps");
        }
        return;
      }
      if (event.key === "Escape") {
        // Kit dialogs and menus close themselves on Escape and mark the event handled.
        if (event.defaultPrevented || !escapeClosesDialog(event)) return;
        const dialog =
          shell.palette ||
          shell.newTask ||
          shell.push ||
          shell.newBranch ||
          shell.adding ||
          shell.stopFactory ||
          shell.deleteDone;
        if (shell.palette) shell.toggle("palette");
        if (shell.newTask) shell.toggle("newTask");
        if (shell.adding) shell.toggle("adding");
        if (shell.push) shell.toggle("push");
        if (shell.newBranch) shell.toggle("newBranch");
        if (shell.stopFactory) shell.toggle("stopFactory");
        if (shell.deleteDone) shell.toggle("deleteDone");
        if (!dialog && shell.focus) shell.toggle("focus");
        return;
      }
      if (event.key === "g" && !meta && !event.altKey && !isTypingTarget(event.target)) {
        pendingG = true;
        window.clearTimeout(goTimer);
        goTimer = window.setTimeout(() => {
          pendingG = false;
        }, 1000);
        return;
      }
      if (pendingG && !isTypingTarget(event.target)) {
        clearGo();
        const page = pageForGoKey(event.key);
        if (page) {
          event.preventDefault();
          shell.setPage(page);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shell]);
  return null;
}
