import { toast } from "sonner";
import { useShell } from "./shell-store";

function openBrowser(): void {
  const shell = useShell.getState();
  shell.setPage("task");
  shell.setTaskTab("browser");
}

function browserButton(label: string): HTMLButtonElement | null {
  const button = [...document.querySelectorAll(".browser button")].find(
    (item) => item.textContent?.trim() === label,
  );
  return button instanceof HTMLButtonElement ? button : null;
}

function clickBrowser(label: string, unavailable: string): void {
  openBrowser();
  if (!document.querySelector(".browser")) {
    toast.error("Open the browser first");
    return;
  }
  const button = browserButton(label);
  if (!button || button.disabled) {
    toast.info(unavailable);
    return;
  }
  button.click();
}

/** Back, forward, reload, stop, pick, and close, matching the browser toolbar. */
export function browserPaletteActions(): { id: string; label: string; run: () => void }[] {
  return [
    {
      id: "browser-back",
      label: "Back",
      run: () => clickBrowser("Back", "Can't go back"),
    },
    {
      id: "browser-forward",
      label: "Forward",
      run: () => clickBrowser("Forward", "Can't go forward"),
    },
    {
      id: "browser-reload",
      label: "Reload",
      run: () => clickBrowser("Reload", "The page is still loading"),
    },
    {
      id: "browser-stop",
      label: "Stop",
      run: () => clickBrowser("Stop", "Nothing is loading"),
    },
    {
      id: "browser-pick",
      label: "Pick element",
      run: () => {
        openBrowser();
        if (!document.querySelector(".browser")) {
          toast.error("Open the browser first");
          return;
        }
        const button = browserButton("Pick element") ?? browserButton("Picking");
        if (!button) {
          toast.error("Open the browser first");
          return;
        }
        button.click();
      },
    },
    {
      id: "browser-close-tab",
      label: "Close browser tab",
      run: () => {
        openBrowser();
        if (!document.querySelector(".browser")) {
          toast.error("Open the browser first");
          return;
        }
        const button = browserButton("Close tab");
        if (!button) {
          toast.info("One tab is open");
          return;
        }
        button.click();
      },
    },
  ];
}
