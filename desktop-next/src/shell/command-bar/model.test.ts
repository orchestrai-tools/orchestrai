import type { RunCommand } from "@warpforge/protocol";
import { describe, expect, it } from "vitest";
import {
  barGroups,
  commandLine,
  missingValue,
  runPlace,
  searchText,
  shellQuote,
  splitValues,
} from "./model";

function recipe(patch: Partial<RunCommand>): RunCommand {
  return {
    id: `just:${patch.name ?? "x"}`,
    source: "just",
    name: "x",
    command: `just ${patch.name ?? "x"}`,
    longRunning: false,
    isDefault: false,
    exact: true,
    ...patch,
  };
}

describe("barGroups", () => {
  it("orders saved, just by group, scripts, make, then history without repeats", () => {
    const groups = barGroups(
      ["just test"],
      {
        commands: [
          recipe({ name: "lint", group: "check" }),
          recipe({ name: "test", group: "check" }),
          recipe({ name: "default", isDefault: true }),
          recipe({ name: "fmt" }),
          { ...recipe({ name: "dev" }), id: "npm:dev", source: "npm", command: "bun run dev" },
          { ...recipe({ name: "build" }), id: "make:build", source: "make", command: "make build" },
        ],
        errors: [],
        hints: [],
      },
      ["ls", "just test", "make build"],
    );
    expect(groups.map((g) => g.heading)).toEqual([
      "Saved",
      "Just",
      "Just · check",
      "Package scripts",
      "Make",
      "History",
    ]);
    expect(groups[1].items.map((i) => i.command?.name)).toEqual(["default", "fmt"]);
    expect(groups[0].items[0].command?.name).toBe("test");
    expect(groups.at(-1)?.items.map((i) => i.line)).toEqual(["ls"]);
  });

  it("finds a recipe by its alias and description", () => {
    const item = { key: "k", line: "just test", command: recipe({ name: "test", aliases: ["t"], description: "Run the suite" }) };
    expect(searchText(item)).toContain("t");
    expect(searchText(item)).toContain("Run the suite");
  });
});

describe("commandLine", () => {
  const test = recipe({
    name: "test",
    params: [
      { name: "filter", kind: "optional", default: "" },
      { name: "flags", kind: "star" },
    ],
  });

  it("leaves trailing empty optionals to just's defaults", () => {
    expect(commandLine(test, {})).toBe("just test");
    expect(commandLine(test, { filter: "api" })).toBe("just test api");
  });

  it("fills an earlier default when a later value is given, and quotes values", () => {
    expect(commandLine(test, { flags: "--nocapture 'a b'" })).toBe("just test '' --nocapture 'a b'");
    expect(commandLine(recipe({ name: "say", params: [{ name: "text", kind: "required" }] }), { text: "it's here" })).toBe(
      "just say 'it'\\''s here'",
    );
  });

  it("passes --yes to just for a recipe the dialog already confirmed", () => {
    expect(commandLine(recipe({ name: "clean", confirm: "Delete?" }), {})).toBe("just --yes clean");
    expect(commandLine(recipe({ name: "wipe", confirm: "", params: [{ name: "t", kind: "plus" }] }), { t: "a" })).toBe(
      "just --yes wipe a",
    );
  });

  it("splits variadic values like a shell", () => {
    expect(splitValues(`a "b c" d`)).toEqual(["a", "b c", "d"]);
    expect(splitValues("")).toEqual([]);
  });
});

describe("missingValue", () => {
  it("requires required and plus parameters", () => {
    expect(missingValue([{ name: "port", kind: "required" }], {})).toMatch(/port/);
    expect(missingValue([{ name: "targets", kind: "plus" }], { targets: " " })).toMatch(/targets/);
    expect(missingValue([{ name: "port", kind: "required" }], { port: "3000" })).toBeNull();
  });

  it("will not skip an empty optional with no literal default", () => {
    expect(
      missingValue(
        [
          { name: "env", kind: "optional" },
          { name: "region", kind: "required" },
        ],
        { region: "us" },
      ),
    ).toMatch(/env/);
  });
});

describe("runPlace", () => {
  it("opens long-running commands in a terminal and lets Shift flip it", () => {
    expect(runPlace(recipe({ longRunning: true }), false)).toBe("terminal");
    expect(runPlace(recipe({ longRunning: true }), true)).toBe("here");
    expect(runPlace(recipe({}), false)).toBe("here");
    expect(runPlace(undefined, true)).toBe("terminal");
  });

  it("quotes only what needs it", () => {
    expect(shellQuote("api")).toBe("api");
    expect(shellQuote("")).toBe("''");
    expect(shellQuote("a b")).toBe("'a b'");
  });
});
