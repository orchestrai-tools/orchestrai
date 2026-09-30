//! The Factory end to end: real pipelines on mock agents, real git against a
//! local bare origin, and a fake pull request opener (never `gh`).

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use warpforge_protocol as wire;

use super::*;
use crate::daemon::actor::runner::RunnerCommand;
use crate::daemon::diff::testsupport::git;

mod checkout;
mod delivery;
mod dispatch;
mod location;
mod recovery;
mod retry;

const FACTORY_FIXTURE: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/tests/fixtures/mock-acp-factory.mjs"
);

/// An agent whose every turn writes a file into its checkout.
fn writing_agent() -> String {
    format!("node {FACTORY_FIXTURE}")
}

struct Repo {
    dir: tempfile::TempDir,
    projects: Vec<ProjectEntry>,
    work: PathBuf,
    origin: PathBuf,
}

/// A project cloned from a local bare origin whose default branch is `main`,
/// with `workflow` as `.warpforge/workflows/test.yaml`.
async fn factory_repo(workflow: &str) -> Repo {
    let dir = tempfile::tempdir().unwrap();
    let origin = dir.path().join("origin.git");
    let seed = dir.path().join("seed");
    let work = dir.path().join("work");
    git(
        dir.path(),
        &[
            "init",
            "-q",
            "--bare",
            "-b",
            "main",
            origin.to_str().unwrap(),
        ],
    )
    .await;
    crate::daemon::diff::testsupport::init_repo(&seed).await;
    git(&seed, &["checkout", "-q", "-b", "main"]).await;
    std::fs::write(seed.join("README.md"), "seed\n").unwrap();
    git(&seed, &["add", "."]).await;
    git(&seed, &["commit", "-q", "-m", "seed"]).await;
    git(&seed, &["push", "-q", origin.to_str().unwrap(), "main"]).await;
    git(
        dir.path(),
        &[
            "clone",
            "-q",
            origin.to_str().unwrap(),
            work.to_str().unwrap(),
        ],
    )
    .await;
    git(&work, &["config", "user.email", "t@t"]).await;
    git(&work, &["config", "user.name", "t"]).await;
    let workflows = work.join(".warpforge/workflows");
    std::fs::create_dir_all(&workflows).unwrap();
    std::fs::write(workflows.join("test.yaml"), workflow).unwrap();
    let projects = vec![ProjectEntry {
        name: "demo".into(),
        path: work.to_string_lossy().into_owned(),
        added_at: "0".into(),
        port_range: None,
        port_range_override: None,
    }];
    Repo {
        dir,
        projects,
        work,
        origin,
    }
}

async fn ask<T>(
    daemon: &DaemonHandle,
    build: impl FnOnce(tokio::sync::oneshot::Sender<Result<T, String>>) -> RunnerCommand,
) -> Result<T, String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    daemon.send(Command::Runner(build(tx))).await;
    rx.await.unwrap()
}

async fn settings(daemon: &DaemonHandle, patch: wire::RunnerSettingsPatch) -> wire::RunnerStatus {
    ask(daemon, |reply| RunnerCommand::UpdateSettings {
        project: "demo".into(),
        patch,
        reply,
    })
    .await
    .expect("settings accepted")
}

async fn status(daemon: &DaemonHandle) -> wire::RunnerStatus {
    ask(daemon, |reply| RunnerCommand::Status {
        project: "demo".into(),
        reply,
    })
    .await
    .unwrap()
}

async fn enqueue(daemon: &DaemonHandle, items: &[&wire::BacklogItem]) -> wire::EnqueueResult {
    enqueue_with(daemon, items, wire::FactoryConfig::default()).await
}

async fn enqueue_at(
    daemon: &DaemonHandle,
    items: &[&wire::BacklogItem],
    run_location: wire::EntryRunLocation,
) -> wire::EnqueueResult {
    let config = wire::FactoryConfig {
        run_location,
        ..wire::FactoryConfig::default()
    };
    enqueue_with(daemon, items, config).await
}

async fn enqueue_with(
    daemon: &DaemonHandle,
    items: &[&wire::BacklogItem],
    config: wire::FactoryConfig,
) -> wire::EnqueueResult {
    ask(daemon, |reply| RunnerCommand::Enqueue {
        project: "demo".into(),
        item_ids: items.iter().map(|i| i.id.clone()).collect(),
        config,
        origin_task: None,
        reply,
    })
    .await
    .expect("accepted")
}

async fn create_item(daemon: &DaemonHandle, title: &str, priority: &str) -> wire::BacklogItem {
    let (tx, rx) = tokio::sync::oneshot::channel();
    daemon
        .send(Command::BacklogCreate {
            item: crate::daemon::backlog::NewItem {
                project: "demo".into(),
                title: title.into(),
                body: format!("Do {title}."),
                status: String::new(),
                priority: priority.into(),
                source: String::new(),
                assignee: None,
            },
            reply: tx,
        })
        .await;
    rx.await.unwrap().expect("item created")
}

async fn item_status(daemon: &DaemonHandle, id: &str) -> String {
    let (tx, rx) = tokio::sync::oneshot::channel();
    daemon
        .send(Command::BacklogList {
            project: "demo".into(),
            query: crate::daemon::backlog::Query {
                page_size: 100,
                sort_by: "number".into(),
                ..Default::default()
            },
            reply: tx,
        })
        .await;
    let page = rx.await.unwrap().unwrap();
    page.items
        .into_iter()
        .find(|item| item.id == id)
        .map(|item| item.status)
        .unwrap_or_default()
}

/// Settings every test starts from: the test workflow, no disk floor.
fn running_with(agent: &str) -> wire::RunnerSettingsPatch {
    wire::RunnerSettingsPatch {
        workflow: Some("test".into()),
        agent: Some(agent.into()),
        min_free_gb: Some(0),
        ..Default::default()
    }
}

async fn wait_run(
    events: &mut tokio::sync::broadcast::Receiver<Event>,
    what: &str,
    pred: impl Fn(&wire::ItemRun) -> bool,
) -> wire::ItemRun {
    timeout(Duration::from_secs(30), async {
        loop {
            if let Ok(Event::RunnerRunUpdated(run)) = events.recv().await {
                if pred(&run) {
                    break *run;
                }
            }
        }
    })
    .await
    .unwrap_or_else(|_| panic!("timed out waiting for: {what}"))
}

async fn wait_status(
    daemon: &DaemonHandle,
    what: &str,
    pred: impl Fn(&wire::RunnerStatus) -> bool,
) -> wire::RunnerStatus {
    timeout(Duration::from_secs(30), async {
        loop {
            let current = status(daemon).await;
            if pred(&current) {
                break current;
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
    })
    .await
    .unwrap_or_else(|_| panic!("timed out waiting for: {what}"))
}

/// Every pull request the fake opener was asked for: `(title, body, base)`.
type Opened = Arc<Mutex<Vec<(String, String, Option<String>)>>>;

async fn fake_opener(daemon: &DaemonHandle) -> Opened {
    let opened: Opened = Arc::default();
    let log = opened.clone();
    let opener: crate::daemon::actor::runner::PrOpener =
        Arc::new(move |_repo, title, body, base| {
            let mut log = log.lock().unwrap();
            log.push((title, body, base));
            let url = format!("https://github.com/o/r/pull/{}", 6 + log.len());
            Box::pin(async move { Ok(url) })
        });
    daemon
        .send(Command::Runner(RunnerCommand::SetPrOpener(opener)))
        .await;
    opened
}

fn entry<'a>(
    status: &'a wire::RunnerStatus,
    item: &wire::BacklogItem,
) -> Option<&'a wire::RunnerEntry> {
    status
        .entries
        .iter()
        .find(|e| e.item_id.as_deref() == Some(item.id.as_str()))
}

async fn find_task(daemon: &DaemonHandle, id: &str) -> Option<Task> {
    daemon.tasks().await.into_iter().find(|t| t.id == id)
}

fn origin_branches(origin: &Path) -> String {
    let out = std::process::Command::new("git")
        .arg("--git-dir")
        .arg(origin)
        .args(["branch", "--list", "warpforge/task/*"])
        .output()
        .unwrap();
    String::from_utf8_lossy(&out.stdout).into_owned()
}
