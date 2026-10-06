import { Button } from "@warpforge/ui/components/button";
import { Input } from "@warpforge/ui/components/input";
import { Kbd } from "@warpforge/ui/components/kbd";
import { cn } from "@warpforge/ui/lib/utils";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  GlobeIcon,
  MousePointerClickIcon,
  PlusIcon,
  RotateCwIcon,
  WifiOffIcon,
  XIcon,
} from "lucide-react";
import { useRef } from "react";

import { browserTabLabel, canGoBack, canGoForward, isStartUrl } from "../../lib/browser-page";
import { isExternalLink, openExternalLink } from "../../lib/external-link";
import { useDaemon } from "../../lib/use-daemon";
import { useBrowserTabs } from "./use-browser-tabs";

/**
 * The in-app browser for this task. The native webview sits over the page
 * area; pick an element to hand it to the agent as context. ⌘T opens a
 * tab, ⌘L focuses the address.
 */
export function BrowserPane({
  taskId,
  project,
  onPick,
  className,
}: {
  taskId: string;
  project: string;
  onPick: (text: string, label: string) => string | null;
  className?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const address = useRef<HTMLInputElement>(null);
  const browser = useBrowserTabs({ taskId, host, address, onPick });
  const services = useDaemon().snapshot.services.filter(
    (service) =>
      service.project === project &&
      service.allocatedPort > 0 &&
      (service.status === "running" || service.status === "starting"),
  );

  return (
    <div className={cn("flex min-h-0 flex-col gap-2", className)}>
      <div
        className="flex items-center gap-1 overflow-x-auto"
        role="tablist"
        aria-label="Browser tabs"
      >
        {browser.tabs.map((tab) => (
          <span
            key={tab}
            className={cn(
              "group/tab flex h-7 max-w-52 shrink-0 items-center gap-1 rounded-md pr-0.5 pl-2 text-xs",
              tab === browser.active
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/60",
            )}
          >
            <button
              type="button"
              role="tab"
              aria-selected={tab === browser.active}
              onClick={() => browser.setActive(tab)}
              className="flex min-w-0 items-center gap-1.5"
            >
              <GlobeIcon aria-hidden className="size-3 shrink-0" />
              <span className="truncate">
                {browserTabLabel(browser.titles[tab], browser.urls[tab] ?? "")}
              </span>
            </button>
            {browser.tabs.length > 1 && (
              <Button
                variant="ghost"
                size="icon-xs"
                className="size-5 opacity-0 group-hover/tab:opacity-100 focus-visible:opacity-100"
                aria-label="Close tab"
                onClick={() => browser.closeTab(tab)}
              >
                <XIcon />
              </Button>
            )}
          </span>
        ))}
        <Button variant="ghost" size="icon-xs" aria-label="New tab" onClick={browser.openTab}>
          <PlusIcon />
        </Button>
      </div>
      <form
        className="flex items-center gap-1"
        onSubmit={(event) => {
          event.preventDefault();
          if (!isStartUrl(browser.draft)) browser.go(browser.draft.trim());
        }}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Back"
          disabled={!canGoBack(browser.nav)}
          onClick={() => browser.step(-1)}
        >
          <ArrowLeftIcon />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Forward"
          disabled={!canGoForward(browser.nav)}
          onClick={() => browser.step(1)}
        >
          <ArrowRightIcon />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={browser.nav.loading ? "Stop" : "Reload"}
          disabled={!browser.native}
          onClick={browser.reloadOrStop}
        >
          {browser.nav.loading ? <XIcon /> : <RotateCwIcon />}
        </Button>
        <Input
          ref={address}
          aria-label="Address"
          value={browser.draft}
          placeholder="Enter an address"
          onChange={(event) => browser.setDraft(event.target.value)}
          className="h-7 flex-1 font-mono text-xs"
        />
        <Button
          type="button"
          variant={browser.picking ? "secondary" : "outline"}
          size="sm"
          aria-pressed={browser.picking}
          disabled={!browser.native}
          title={browser.native ? undefined : "Element picking requires the desktop app"}
          onClick={browser.togglePick}
        >
          <MousePointerClickIcon />
          {browser.picking ? "Picking…" : "Pick element"}
        </Button>
      </form>
      <div
        ref={host}
        className="relative min-h-64 flex-1 overflow-hidden rounded-md border bg-muted/30"
      >
        {!browser.native && !browser.onStart && (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm">
            <GlobeIcon aria-hidden className="size-5 text-muted-foreground" />
            <p className="font-medium">Open this page in your browser</p>
            <p className="max-w-sm text-muted-foreground">
              Embedded browsing and element picking are available in the desktop app.
            </p>
            {!isExternalLink(browser.url) && <p>Enter a full http:// or https:// address above.</p>}
            <Button
              size="sm"
              variant="outline"
              disabled={!isExternalLink(browser.url)}
              onClick={() => void openExternalLink(browser.url)}
            >
              Open {browser.url}
            </Button>
          </div>
        )}
        {browser.onStart && (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-sm">
            <p>Nothing open in this tab.</p>
            {services.length === 0 ? (
              <p className="text-muted-foreground">
                Type an address above, or start a service to open it here. <Kbd>⌘L</Kbd>
              </p>
            ) : (
              <ul className="flex w-full max-w-sm flex-col gap-1">
                {services.map((service) => {
                  const href = `http://localhost:${service.allocatedPort}`;
                  return (
                    <li key={service.name}>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-between"
                        onClick={() => browser.go(href)}
                      >
                        <span className="truncate">
                          {service.name}
                          {service.status === "starting" ? " · starting" : ""}
                        </span>
                        <span className="font-mono text-muted-foreground">{href}</span>
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
        {browser.stalled && (
          <div
            role="alert"
            className="flex h-full flex-col items-center justify-center gap-2 p-6 text-sm"
          >
            <WifiOffIcon aria-hidden className="size-5 text-muted-foreground" />
            <p className="font-medium">This site can't be reached</p>
            <p className="text-muted-foreground">
              {browser.url} refused to connect or took too long.
            </p>
            <Button size="sm" variant="outline" onClick={browser.retry}>
              Try again
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
