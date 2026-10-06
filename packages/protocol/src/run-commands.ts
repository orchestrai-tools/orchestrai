/** Mirrors `crates/warpforge-protocol/src/run_commands.rs`. */

export type RunSource = "npm" | "just" | "make";

/** One required value, one with a default, one or more (`+`), or any number (`*`). */
export type RunParamKind = "required" | "optional" | "plus" | "star";

export interface RunParam {
  name: string;
  kind: RunParamKind;
  default?: string;
}

export interface RunCommand {
  /** Stable within a project: `just:db::migrate`, `npm:dev`, `make:build`. */
  id: string;
  source: RunSource;
  name: string;
  /** The shell line that runs it with no parameters filled in. */
  command: string;
  description?: string;
  group?: string;
  params?: RunParam[];
  /** Set when it must be confirmed first: the justfile's message, or empty. */
  confirm?: string;
  aliases?: string[];
  longRunning: boolean;
  isDefault: boolean;
  /** Read by `just` itself rather than guessed from the file's text. */
  exact: boolean;
}

export interface RunSourceNote {
  source: RunSource;
  message: string;
}

export interface RunCommands {
  commands: RunCommand[];
  errors: RunSourceNote[];
  hints: RunSourceNote[];
}
