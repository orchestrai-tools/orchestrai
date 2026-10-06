import type { DetectedLanguageServer } from "@warpforge/protocol";

/** Language servers the demo settings page can install. */
export function demoLanguageServers(installed: ReadonlySet<string>): DetectedLanguageServer[] {
  const ready = installed.has("typescript");
  return [
    {
      id: "typescript",
      language: "TypeScript",
      installed: ready,
      version: ready ? "1.2.0" : null,
      latestVersion: "1.2.0",
      status: ready ? "current" : "missing",
      canManage: true,
      installHint: "npm install -g typescript-language-server",
    },
    {
      id: "python",
      language: "Python",
      installed: true,
      version: installed.has("python") ? "1.1.0" : "1.0.0",
      latestVersion: "1.1.0",
      status: installed.has("python") ? "current" : "behind",
      canManage: true,
      installHint: "",
    },
    {
      id: "rust",
      language: "Rust",
      installed: false,
      status: "missing",
      canManage: false,
      installHint: "rustup component add rust-analyzer",
    },
  ];
}
