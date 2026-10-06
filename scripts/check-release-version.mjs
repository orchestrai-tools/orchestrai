#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const tag = process.argv[2];

if (!tag || !/^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(tag)) {
  console.error("usage: node scripts/check-release-version.mjs vX.Y.Z");
  process.exit(2);
}

const expected = tag.slice(1);

function json(path) {
  return JSON.parse(readFileSync(resolve(root, path), "utf8"));
}

function cargoMetadata(manifestPath) {
  const output = execFileSync(
    "cargo",
    [
      "metadata",
      "--format-version",
      "1",
      "--no-deps",
      "--locked",
      "--manifest-path",
      resolve(root, manifestPath),
    ],
    { encoding: "utf8" },
  );
  return JSON.parse(output);
}

const rootMetadata = cargoMetadata("Cargo.toml");
const desktopMetadata = cargoMetadata("desktop/src-tauri/Cargo.toml");
const rootPackage = json("package.json");
const desktopPackage = json("desktop/package.json");
const tauriConfig = json("desktop/src-tauri/tauri.conf.json");
function cspDirectiveSources(csp, directiveName) {
  if (typeof csp !== "string") return [];
  const directive = csp
    .split(";")
    .map((value) => value.trim().split(/\s+/))
    .find(([name]) => name === directiveName);
  return directive?.slice(1) ?? [];
}

function cargoVersion(metadata, name) {
  const pkg = metadata.packages.find((candidate) => candidate.name === name);
  if (!pkg) throw new Error(`Cargo package not found: ${name}`);
  return pkg.version;
}

// `cargo metadata --no-deps` never resolves the graph, so it cannot notice a
// stale lockfile. Read the entries directly instead: a crate that appears in a
// lockfile with the wrong version fails `cargo check --locked` in CI.
function cargoLockVersions(path) {
  const contents = readFileSync(resolve(root, path), "utf8");
  const entries = new Map();
  for (const [, name, lockedVersion] of contents.matchAll(
    /\[\[package\]\]\nname = "(warpforge(?:-[a-z]+)?)"\nversion = "([^"]*)"/g,
  )) {
    entries.set(`${path} (${name})`, lockedVersion);
  }
  if (entries.size === 0) throw new Error(`no local crate found in ${path}`);
  return entries;
}

const versions = new Map([
  ["package.json (Changesets source of truth)", rootPackage.version],
  ["Cargo.toml (warpforge)", cargoVersion(rootMetadata, "warpforge")],
  [
    "crates/warpforge-protocol/Cargo.toml",
    cargoVersion(rootMetadata, "warpforge-protocol"),
  ],
  [
    "desktop/src-tauri/Cargo.toml",
    cargoVersion(desktopMetadata, "warpforge-desktop"),
  ],
  ["desktop/src-tauri/tauri.conf.json", tauriConfig.version],
  ["desktop/package.json", desktopPackage.version],
  ...cargoLockVersions("Cargo.lock"),
  ...cargoLockVersions("desktop/src-tauri/Cargo.lock"),
]);

let valid = true;
for (const [source, version] of versions) {
  const matches = version === expected;
  console.log(`${matches ? "ok" : "mismatch"}: ${source} = ${String(version)}`);
  valid &&= matches;
}

const releaseConfiguration = [
  ["Tauri bundling is enabled", tauriConfig.bundle?.active === true],
  [
    "updater artifacts are off while OrchestrAI has no signed release feed",
    tauriConfig.bundle?.createUpdaterArtifacts !== true,
  ],
  [
    "the orchestrai daemon is bundled as a sidecar",
    tauriConfig.bundle?.externalBin?.includes("binaries/orchestrai") === true,
  ],
  [
    "no updater feed is configured, so the app never installs stock Warpforge",
    tauriConfig.plugins?.updater == null,
  ],
  [
    "the app identity differs from stock Warpforge",
    tauriConfig.identifier === "tools.orchestrai.desktop" &&
      tauriConfig.productName === "OrchestrAI",
  ],
  [
    "every changeset has been consumed by the version bump",
    readdirSync(resolve(root, ".changeset")).every(
      (entry) => !entry.endsWith(".md") || entry === "README.md",
    ),
  ],
  [
    "the packaged image CSP permits only local assets, Vite data URLs, and attachment blob URLs",
    (() => {
      const sources = cspDirectiveSources(tauriConfig.app?.security?.csp, "img-src");
      const expectedSources = new Set(["'self'", "data:", "blob:"]);
      return (
        sources.length === expectedSources.size &&
        sources.every((source) => expectedSources.has(source))
      );
    })(),
  ],
];

for (const [requirement, matches] of releaseConfiguration) {
  console.log(`${matches ? "ok" : "missing"}: ${requirement}`);
  valid &&= matches;
}

let changelog;
try {
  changelog = readFileSync(resolve(root, "CHANGELOG.md"), "utf8");
} catch {
  console.error("missing: CHANGELOG.md");
  valid = false;
}

const escapedVersion = expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Changesets writes `## X.Y.Z`; releases predating it used `## [X.Y.Z]`.
const changelogMatches = changelog
  ? [
      ...changelog.matchAll(
        new RegExp(`^## \\[?${escapedVersion}\\]?(?:\\s|$)`, "gm"),
      ),
    ]
  : [];

if (changelog && changelogMatches.length !== 1) {
  console.error(
    `${changelogMatches.length === 0 ? "missing" : "duplicate"}: ` +
      `CHANGELOG.md heading \"## ${expected}\"`,
  );
  valid = false;
}

if (!valid) {
  console.error(`release metadata is not ready for ${tag}`);
  process.exit(1);
}

console.log(`release metadata is consistent for ${tag}`);
