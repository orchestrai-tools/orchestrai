use std::path::Path;

use warpforge_protocol::{RunCommand, RunParam, RunParamKind, RunSource};

use super::just::{dump_commands, find, parse_recipes};
use super::{detect, detect_uncached, long_running, make, npm};

const FIXTURES: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/src/daemon/runners/fixtures");

fn by_name<'a>(commands: &'a [RunCommand], name: &str) -> &'a RunCommand {
    commands
        .iter()
        .find(|c| c.name == name)
        .unwrap_or_else(|| panic!("no {name} in {:?}", names(commands)))
}

fn names(commands: &[RunCommand]) -> Vec<&str> {
    commands.iter().map(|c| c.name.as_str()).collect()
}

fn param(name: &str, kind: RunParamKind, default: Option<&str>) -> RunParam {
    RunParam {
        name: name.into(),
        kind,
        default: default.map(str::to_string),
    }
}

#[test]
fn the_dump_gives_exact_recipes_with_everything_just_knows() {
    let raw = std::fs::read_to_string(format!("{FIXTURES}/just-1.58-dump.json")).unwrap();
    let commands = dump_commands(&serde_json::from_str(&raw).unwrap());
    let mut listed = names(&commands);
    listed.sort();
    assert_eq!(
        listed,
        [
            "db::migrate",
            "default",
            "deploy",
            "dev",
            "lint",
            "test",
            "wipe"
        ],
        "private and _ recipes stay hidden; module recipes keep their path"
    );

    let test = by_name(&commands, "test");
    assert_eq!(test.command, "just test");
    assert_eq!(test.description.as_deref(), Some("Run the test suite"));
    assert_eq!(test.group.as_deref(), Some("check"));
    assert_eq!(test.aliases, ["t"]);
    assert_eq!(
        test.params,
        [
            param("filter", RunParamKind::Optional, Some("")),
            param("flags", RunParamKind::Star, None)
        ]
    );
    assert!(test.exact);

    assert_eq!(
        by_name(&commands, "lint").description.as_deref(),
        Some("Lint everything"),
        "a [doc(...)] attribute is the description"
    );
    let wipe = by_name(&commands, "wipe");
    assert_eq!(wipe.confirm.as_deref(), Some("Really wipe the database?"));
    assert_eq!(wipe.params, [param("targets", RunParamKind::Plus, None)]);
    assert_eq!(by_name(&commands, "deploy").confirm.as_deref(), Some(""));

    let dev = by_name(&commands, "dev");
    assert_eq!(dev.params, [param("port", RunParamKind::Required, None)]);
    assert!(dev.long_running);
    assert!(by_name(&commands, "default").is_default);
    assert!(!by_name(&commands, "lint").is_default);

    let migrate = by_name(&commands, "db::migrate");
    assert_eq!(migrate.command, "just db::migrate");
    assert_eq!(migrate.id, "just:db::migrate");
    assert_eq!(
        migrate.group.as_deref(),
        Some("db"),
        "a module is its recipes' group"
    );
    assert_eq!(
        migrate.params,
        [param("env", RunParamKind::Optional, Some("dev"))]
    );
    assert!(
        !migrate.is_default,
        "only the top justfile has the default recipe"
    );
}

#[test]
fn the_text_fallback_reads_what_it_can_from_the_same_justfile() {
    let text = std::fs::read_to_string(format!("{FIXTURES}/justfile")).unwrap();
    let commands = parse_recipes(&text);
    assert_eq!(
        names(&commands),
        ["default", "test", "lint", "dev", "wipe", "deploy"],
        "file order; modules need just itself"
    );
    assert!(commands.iter().all(|c| !c.exact));
    let test = by_name(&commands, "test");
    assert_eq!(test.group.as_deref(), Some("check"));
    assert_eq!(test.aliases, ["t"]);
    assert_eq!(
        test.params,
        [
            param("filter", RunParamKind::Optional, Some("")),
            param("flags", RunParamKind::Star, None)
        ]
    );
    assert_eq!(
        by_name(&commands, "lint").description.as_deref(),
        Some("Lint everything")
    );
    assert_eq!(
        by_name(&commands, "wipe").confirm.as_deref(),
        Some("Really wipe the database?")
    );
    assert_eq!(by_name(&commands, "deploy").confirm.as_deref(), Some(""));
    assert!(by_name(&commands, "default").is_default);
}

/// Daintree's own justfile cases, kept so the port does not regress.
#[test]
fn the_fallback_keeps_daintrees_cases() {
    let basic = parse_recipes("build:\n  echo building\n\ntest:\n  echo testing\n");
    assert_eq!(names(&basic), ["build", "test"]);
    assert_eq!(basic[0].command, "just build");

    let documented = parse_recipes("# Compile the project\nbuild:\n  echo building\n");
    assert_eq!(
        documented[0].description.as_deref(),
        Some("Compile the project")
    );

    let with_param = parse_recipes("build target:\n  echo {{ target }}\n");
    assert_eq!(names(&with_param), ["build"]);
    assert_eq!(
        with_param[0].params,
        [param("target", RunParamKind::Required, None)]
    );

    let through_attribute =
        parse_recipes("# Run all tests\n[group('ci')]\ntest:\n  echo testing\n");
    assert_eq!(
        through_attribute[0].description.as_deref(),
        Some("Run all tests")
    );
    assert_eq!(through_attribute[0].group.as_deref(), Some("ci"));

    let private = parse_recipes("_helper:\n  echo helper\nbuild:\n  echo build\n");
    assert_eq!(names(&private), ["build"]);

    let keywords = parse_recipes(
        "alias b := build\nset shell := ['bash', '-c']\nimport 'other.just'\nmod utils\nexport FOO := 'bar'\nbuild:\n  echo build\n",
    );
    assert_eq!(names(&keywords), ["build"]);
    assert_eq!(keywords[0].aliases, ["b"]);

    let quoted = parse_recipes("greet name=\"big world\":\n  echo {{name}}\n");
    assert_eq!(
        quoted[0].params,
        [param("name", RunParamKind::Optional, Some("big world"))]
    );
}

#[test]
fn makefile_targets_take_double_hash_descriptions() {
    let text = "\
.PHONY: build test
VERSION := 1.0
CC = gcc
## Build everything
build: deps
\tcargo build
test: ## Run the tests
\tcargo test
serve:
\tpython3 -m http.server
_internal:
\techo hidden
%.o: %.c
\t$(CC) -c $<
build:
";
    let targets = make::targets(text);
    assert_eq!(names(&targets), ["build", "test", "serve"]);
    assert_eq!(targets[0].description.as_deref(), Some("Build everything"));
    assert_eq!(targets[1].description.as_deref(), Some("Run the tests"));
    assert_eq!(targets[1].command, "make test");
    assert!(targets[2].long_running);
    assert!(targets.iter().all(|t| t.source == RunSource::Make));
}

#[test]
fn package_scripts_use_the_lockfiles_manager_and_keep_file_order() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(
        dir.path().join("package.json"),
        r#"{"scripts":{"test":"vitest","dev":"vite","postinstall":"x","build":"tsc"}}"#,
    )
    .unwrap();
    assert_eq!(npm::runner(dir.path(), None), "npm run");
    std::fs::write(dir.path().join("pnpm-lock.yaml"), "").unwrap();
    assert_eq!(npm::runner(dir.path(), None), "pnpm run");
    std::fs::write(dir.path().join("bun.lock"), "").unwrap();
    assert_eq!(npm::runner(dir.path(), None), "bun run");
    assert_eq!(npm::runner(dir.path(), Some("yarn@4.1.0")), "yarn");

    let found = detect_uncached(dir.path(), None, "just");
    assert_eq!(names(&found.commands), ["test", "dev", "build"]);
    assert_eq!(found.commands[1].command, "bun run dev");
    assert_eq!(found.commands[1].description.as_deref(), Some("vite"));
    assert!(found.commands[1].long_running);
}

#[test]
fn a_broken_package_json_is_reported_not_dropped() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(dir.path().join("package.json"), "{ nope").unwrap();
    let found = detect_uncached(dir.path(), None, "just");
    assert!(found.commands.is_empty());
    assert_eq!(found.errors.len(), 1);
    assert_eq!(found.errors[0].source, RunSource::Npm);
}

#[test]
fn a_justfile_is_found_upward_but_not_above_the_repository() {
    let root = tempfile::tempdir().unwrap();
    let nested = root.path().join("a/b");
    std::fs::create_dir_all(&nested).unwrap();
    assert_eq!(find(&nested, root.path()), None);
    std::fs::write(root.path().join("Justfile"), "x:\n  echo\n").unwrap();
    assert_eq!(
        find(&nested, root.path()),
        Some(root.path().join("Justfile"))
    );
    assert_eq!(
        find(&nested, &nested),
        None,
        "the search stops at the root it is given"
    );
}

#[test]
fn the_cache_rebuilds_when_a_file_changes() {
    let dir = tempfile::tempdir().unwrap();
    let make = dir.path().join("Makefile");
    std::fs::write(&make, "one:\n\techo\n").unwrap();
    assert_eq!(names(&detect(dir.path(), dir.path()).commands), ["one"]);
    std::thread::sleep(std::time::Duration::from_millis(20));
    std::fs::write(&make, "two:\n\techo\n").unwrap();
    let file = std::fs::File::options().write(true).open(&make).unwrap();
    file.set_modified(std::time::SystemTime::now() + std::time::Duration::from_secs(5))
        .unwrap();
    assert_eq!(names(&detect(dir.path(), dir.path()).commands), ["two"]);
}

#[test]
fn long_running_reads_names_and_bodies() {
    assert!(long_running("dev", ""));
    assert!(long_running("web-dev", ""));
    assert!(long_running("start:api", ""));
    assert!(long_running("run", ""));
    assert!(long_running("db::serve", ""));
    assert!(long_running("site", "bunx vite --port 3000"));
    assert!(!long_running("run-tests", "cargo test"));
    assert!(long_running("up", ""));
    assert!(
        long_running("up", "docker compose up -d"),
        "`up` alone is named for staying up"
    );
    assert!(!long_running("db-up", "docker compose up -d"));
    assert!(!long_running("build", "cargo build"));
}

/// The real binary, when installed, against the fixture justfile.
#[test]
fn live_just_reads_the_fixture_and_a_missing_binary_falls_back() {
    let dir = Path::new(FIXTURES);
    let justfile = dir.join("justfile");
    let missing = detect_uncached(dir, Some(&justfile), "orchestrai-no-such-just");
    assert!(missing
        .commands
        .iter()
        .any(|c| c.name == "test" && !c.exact));
    assert_eq!(
        missing.hints.len(),
        1,
        "the reply says why recipes are approximate"
    );

    let installed = std::process::Command::new("just")
        .arg("--version")
        .output()
        .is_ok_and(|out| out.status.success());
    if !installed {
        eprintln!("just is not installed; skipping the live half");
        return;
    }
    let live = detect_uncached(dir, Some(&justfile), "just");
    assert!(live.errors.is_empty(), "{:?}", live.errors);
    assert!(live.hints.is_empty());
    assert!(live
        .commands
        .iter()
        .any(|c| c.name == "db::migrate" && c.exact));
}

#[test]
fn a_justfile_just_refuses_is_an_error_with_justs_reason() {
    let installed = std::process::Command::new("just")
        .arg("--version")
        .output()
        .is_ok_and(|out| out.status.success());
    if !installed {
        return;
    }
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("justfile");
    std::fs::write(&file, "build:\n  echo {{ nope }}\n").unwrap();
    let found = detect_uncached(dir.path(), Some(&file), "just");
    assert_eq!(found.errors.len(), 1);
    assert!(
        found.errors[0].message.contains("nope"),
        "{}",
        found.errors[0].message
    );
}
