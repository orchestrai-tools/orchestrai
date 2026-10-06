import { useEffect, useId, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@warpforge/ui/components/dialog";

type MermaidApi = {
  initialize: (config: Record<string, unknown>) => void;
  parse: (code: string) => Promise<unknown>;
  render: (id: string, code: string) => Promise<{ svg: string }>;
};

let mermaidModule: Promise<MermaidApi> | null = null;
let initialisedDark: boolean | null = null;

async function loadMermaid(dark: boolean): Promise<MermaidApi> {
  mermaidModule ??= import("mermaid").then((module) => module.default as unknown as MermaidApi);
  const mermaid = await mermaidModule;
  if (initialisedDark !== dark) {
    mermaid.initialize({
      securityLevel: "strict",
      startOnLoad: false,
      theme: dark ? "dark" : "default",
    });
    initialisedDark = dark;
  }
  return mermaid;
}

/** One ```mermaid fence. A diagram that fails to parse shows its source. */
export function MermaidDiagram({ code }: { code: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [enlarged, setEnlarged] = useState(false);
  const domId = `mermaid-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`;

  useEffect(() => {
    let cancelled = false;
    setFailed(null);
    const dark = document.documentElement.classList.contains("dark");
    void (async () => {
      try {
        const mermaid = await loadMermaid(dark);
        await mermaid.parse(code);
        const rendered = await mermaid.render(domId, code);
        if (!cancelled) setSvg(rendered.svg);
      } catch (error) {
        if (!cancelled) {
          setSvg(null);
          setFailed(error instanceof Error ? error.message : String(error));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, domId]);

  if (failed !== null) {
    return (
      <div data-mermaid="failed" className="not-prose my-3 flex flex-col gap-1.5">
        <p className="text-xs text-muted-foreground">Diagram could not be rendered. Showing its source.</p>
        <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs">
          <code>{code}</code>
        </pre>
      </div>
    );
  }

  return (
    <div data-mermaid="ok" hidden={!svg} className="not-prose my-3">
      {svg && (
        <button
          type="button"
          title="Enlarge diagram"
          className="block w-full cursor-zoom-in overflow-x-auto rounded-md border bg-background p-3 [&_svg]:mx-auto [&_svg]:max-w-full"
          onClick={() => setEnlarged(true)}
        >
          <span dangerouslySetInnerHTML={{ __html: svg }} />
        </button>
      )}
      <Dialog open={enlarged && Boolean(svg)} onOpenChange={setEnlarged}>
        <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-[90vw]">
          <DialogTitle className="sr-only">Diagram</DialogTitle>
          <div className="[&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full" dangerouslySetInnerHTML={{ __html: svg ?? "" }} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
