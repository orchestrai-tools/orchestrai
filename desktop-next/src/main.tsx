import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { forgetTask } from "@warpforge/core/sessionStore";
import { daemon, onInvalidate, onNotice, onTaskRemoved } from "@warpforge/daemon";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { toast } from "sonner";

import { App } from "@/App";
import { ErrorBoundary } from "@/components/error-boundary";
import { installBrowserAgent } from "@/lib/browser-agent";
import { clearBrowserSession } from "@/lib/browser-session";
import { bootDemo } from "@/lib/demo";

import "@/index.css";

const queryClient = new QueryClient();

onInvalidate((queryKey) => {
  void queryClient.invalidateQueries({ queryKey: [...queryKey] });
});
onTaskRemoved((taskId) => {
  forgetTask(taskId);
  clearBrowserSession(taskId);
});
onNotice(({ tone, message, duration }) => {
  if (tone === "warning") toast.warning(message, { duration });
  else toast.info(message, { duration });
});

if (new URLSearchParams(location.search).has("demo")) bootDemo();
else {
  const stopBrowserAgent = installBrowserAgent(daemon);
  import.meta.hot?.dispose(stopBrowserAgent);
  void daemon.connect().catch(() => {
    /* The client reconnects on its own. */
  });
}

document.getElementById("boot-splash")?.remove();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
