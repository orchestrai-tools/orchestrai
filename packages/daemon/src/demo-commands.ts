import type { RunCommand, RunCommands } from "@warpforge/protocol";

function just(name: string, patch: Partial<RunCommand> = {}): RunCommand {
  return {
    id: `just:${name}`,
    source: "just",
    name,
    command: `just ${name}`,
    longRunning: false,
    isDefault: false,
    exact: true,
    ...patch,
  };
}

/** `shell.commands` in demo mode: a justfile with groups, parameters, a confirm and a module. */
export function demoRunCommands(): RunCommands {
  return {
    commands: [
      just("default", { description: "Show the recipes", isDefault: true }),
      just("test", {
        description: "Run the test suite",
        group: "check",
        aliases: ["t"],
        params: [
          { name: "filter", kind: "optional", default: "" },
          { name: "flags", kind: "star" },
        ],
      }),
      just("lint", { description: "Lint everything", group: "check" }),
      just("dev", {
        description: "Start the dev server",
        group: "run",
        params: [{ name: "port", kind: "required" }],
        longRunning: true,
      }),
      just("wipe", {
        confirm: "Really wipe the database?",
        params: [{ name: "targets", kind: "plus" }],
      }),
      just("db::migrate", {
        description: "Apply migrations",
        group: "db",
        params: [{ name: "env", kind: "optional", default: "dev" }],
      }),
      {
        id: "npm:dev",
        source: "npm",
        name: "dev",
        command: "bun run dev",
        description: "vite",
        longRunning: true,
        isDefault: false,
        exact: true,
      },
      {
        id: "npm:build",
        source: "npm",
        name: "build",
        command: "bun run build",
        description: "tsc && vite build",
        longRunning: false,
        isDefault: false,
        exact: true,
      },
      {
        id: "make:release",
        source: "make",
        name: "release",
        command: "make release",
        description: "Build a release bundle",
        longRunning: false,
        isDefault: false,
        exact: true,
      },
    ],
    errors: [],
    hints: [],
  };
}
