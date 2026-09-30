//! The lead agent and model a person picks reach every stage the template
//! does not pin, on every way a Factory task starts, and a model is never
//! sent to an agent that does not list it.

use serde_json::{json, Value};

use super::*;

const LEAD_FIXTURE: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/tests/fixtures/mock-acp-lead.mjs"
);
const LUNA: &str = "opencode-go/gpt-6-luna";
const OPUS: &str = "claude-opus-5";

/// Every stage runs on the lead: nothing is pinned.
const UNPINNED: &str = "name: Lead flow\nreview:\n  reviewers:\n    - {}\n";

struct Lead {
    _repo: Repo,
    daemon: DaemonHandle,
    events: tokio::sync::broadcast::Receiver<Event>,
    log: PathBuf,
}

fn mock_agent(log: &Path, id: &str, models: &[&str]) -> wire::AgentConfig {
    wire::AgentConfig {
        id: id.into(),
        display_name: id.into(),
        acp_command: format!(
            "node {LEAD_FIXTURE} {} {id} {}",
            log.display(),
            models.join(" ")
        ),
        enabled: true,
        models: vec![wire::ConfigOption {
            id: "model".into(),
            name: "Model".into(),
            category: Some("model".into()),
            current_value: models[0].into(),
            options: models
                .iter()
                .map(|m| wire::ConfigChoice {
                    value: (*m).into(),
                    name: (*m).into(),
                })
                .collect(),
        }],
        last_model: None,
    }
}

/// Claude is the first enabled agent; the project's Factory defaults are
/// `defaults` (agent, model).
async fn lead_setup(defaults: (&str, Option<&str>)) -> Lead {
    let repo = factory_repo(UNPINNED).await;
    let log = repo.dir.path().join("spawns.log");
    let daemon = Daemon::spawn(
        repo.projects.clone(),
        Store::open_at(std::path::Path::new(":memory:")).ok(),
    );
    let events = daemon.subscribe();
    fake_opener(&daemon).await;
    daemon
        .send(Command::UpdateAgents {
            agents: vec![
                mock_agent(&log, "claude", &["claude-default", OPUS]),
                mock_agent(&log, "opencode", &["opencode-go/default", LUNA]),
            ],
        })
        .await;
    settings(
        &daemon,
        wire::RunnerSettingsPatch {
            model: Some(defaults.1.unwrap_or_default().into()),
            ..running_with(defaults.0)
        },
    )
    .await;
    Lead {
        _repo: repo,
        daemon,
        events,
        log,
    }
}

/// Every agent session started, and every model it was switched to, all
/// on `agent` with `model` (or its own default when `None`).
fn assert_spawned_on(log: &Path, agent: &str, model: Option<&str>) {
    let lines: Vec<String> = std::fs::read_to_string(log)
        .unwrap_or_default()
        .lines()
        .map(str::to_string)
        .collect();
    let started = lines.iter().filter(|l| l.ends_with(" started")).count();
    assert!(started >= 2, "implement and review both ran: {lines:?}");
    let expected: Vec<String> = std::iter::repeat_n(format!("{agent} started"), started)
        .chain(
            model
                .map(|m| format!("{agent} model {m}"))
                .into_iter()
                .cycle()
                .take(started),
        )
        .collect();
    let mut sorted = lines.clone();
    sorted.sort();
    let mut expected_sorted = expected;
    expected_sorted.sort();
    assert_eq!(sorted, expected_sorted, "{lines:?}");
}

/// Every stage child of `parent` records `agent` and `model`.
async fn assert_stages_on(daemon: &DaemonHandle, parent: &str, agent: &str, model: Option<&str>) {
    let stages: Vec<Task> = daemon
        .tasks()
        .await
        .into_iter()
        .filter(|t| t.parent_task_id.as_deref() == Some(parent))
        .collect();
    assert!(!stages.is_empty());
    for stage in stages {
        assert_eq!(
            (stage.agent.as_str(), stage.model.as_deref()),
            (agent, model),
            "{}",
            stage.title
        );
    }
}

async fn wait_outcome(lead: &mut Lead, task_id: &str, outcome: wire::ItemRunOutcome) {
    wait_run(&mut lead.events, "the run ends", |run| {
        run.task_id.as_deref() == Some(task_id) && run.outcome == outcome
    })
    .await;
}

fn task_create(agent: &str, model: Option<&str>, factory: Value) -> Value {
    json!({
        "project": "demo",
        "prompt": "Make the change",
        "agent": agent,
        "default_model": model,
        "include_runtime_context": false,
        "worktree": true,
        "workflow": "test",
        "factory": factory,
    })
}

/// New Task → Factory with a PR: the queued row already shows the picked
/// lead, and every stage spawns it with its model, although the project's
/// Factory defaults name another agent.
#[tokio::test]
async fn new_task_with_a_pr_runs_every_stage_on_the_picked_lead() {
    let mut lead = lead_setup(("claude", Some(OPUS))).await;
    settings(
        &lead.daemon,
        wire::RunnerSettingsPatch {
            min_free_gb: Some(10_000),
            ..Default::default()
        },
    )
    .await;
    let created = rpc(
        &lead.daemon,
        "task.create",
        task_create(
            "opencode",
            Some(LUNA),
            json!({ "deliver": true, "runLocation": "worktree" }),
        ),
    )
    .await;
    let task_id = created["taskId"].as_str().unwrap().to_string();
    assert_eq!(created["started"], false);
    let queued = find_task(&lead.daemon, &task_id).await.unwrap();
    assert_eq!(
        (queued.agent.as_str(), queued.model.as_deref()),
        ("opencode", Some(LUNA))
    );
    let entry = status(&lead.daemon).await.entries[0].clone();
    assert_eq!(
        (entry.agent.as_deref(), entry.model.as_deref()),
        (Some("opencode"), Some(LUNA))
    );

    settings(
        &lead.daemon,
        wire::RunnerSettingsPatch {
            min_free_gb: Some(0),
            ..Default::default()
        },
    )
    .await;
    wait_outcome(&mut lead, &task_id, wire::ItemRunOutcome::Delivered).await;
    assert_spawned_on(&lead.log, "opencode", Some(LUNA));
    assert_stages_on(&lead.daemon, &task_id, "opencode", Some(LUNA)).await;
    lead.daemon.shutdown().await;
}

/// The reported bug: the person's agent differs from the Factory default,
/// and the default's model must not come along with it.
#[tokio::test]
async fn another_agent_never_takes_the_default_agents_model() {
    let mut lead = lead_setup(("opencode", Some(LUNA))).await;
    let created = rpc(
        &lead.daemon,
        "task.create",
        task_create(
            "claude",
            None,
            json!({ "deliver": true, "runLocation": "worktree" }),
        ),
    )
    .await;
    let task_id = created["taskId"].as_str().unwrap().to_string();
    wait_outcome(&mut lead, &task_id, wire::ItemRunOutcome::Delivered).await;
    assert_spawned_on(&lead.log, "claude", None);
    assert_stages_on(&lead.daemon, &task_id, "claude", None).await;
    lead.daemon.shutdown().await;
}

/// New Task → Factory without a PR starts on the spot, on the picked lead;
/// a model from another agent's list is dropped.
#[tokio::test]
async fn new_task_without_a_pr_runs_on_the_lead_and_drops_a_foreign_model() {
    let mut lead = lead_setup(("claude", None)).await;
    let created = rpc(
        &lead.daemon,
        "task.create",
        task_create("opencode", Some(OPUS), Value::Null),
    )
    .await;
    let task_id = created["taskId"].as_str().unwrap().to_string();
    let parent = wait_for_parent(&mut lead.events, &task_id, "pipeline ends", |t| {
        t.status != TaskStatus::Running
    })
    .await;
    assert_eq!(parent.status, TaskStatus::Waiting);
    assert_eq!(
        (parent.agent.as_str(), parent.model.as_deref()),
        ("opencode", None)
    );
    assert_spawned_on(&lead.log, "opencode", None);
    assert_stages_on(&lead.daemon, &task_id, "opencode", None).await;
    lead.daemon.shutdown().await;
}

/// Start in Factory for backlog items (the batch, the multi-item dialog and
/// an orchestrator's runner_enqueue): the picked lead, or the project's
/// defaults when none is given, and Run again keeps it.
#[tokio::test]
async fn enqueue_and_run_again_keep_the_lead() {
    let mut lead = lead_setup(("opencode", Some(LUNA))).await;
    let item = create_item(&lead.daemon, "picked", "high").await;
    let enqueued = rpc(
        &lead.daemon,
        "runner.enqueue",
        json!({ "project": "demo", "item_ids": [item.id], "deliver": false,
                "agent": "claude", "model": OPUS }),
    )
    .await;
    let first = enqueued["created"][0]["taskId"]
        .as_str()
        .unwrap()
        .to_string();
    wait_outcome(&mut lead, &first, wire::ItemRunOutcome::Completed).await;
    assert_spawned_on(&lead.log, "claude", Some(OPUS));
    assert_stages_on(&lead.daemon, &first, "claude", Some(OPUS)).await;
    wait_status(&lead.daemon, "the entry ends", |s| s.entries.is_empty()).await;

    std::fs::remove_file(&lead.log).unwrap();
    let again = rpc(&lead.daemon, "runner.retry", json!({ "task_id": first })).await;
    let second = again["created"][0]["taskId"].as_str().unwrap().to_string();
    let retried = find_task(&lead.daemon, &second).await.unwrap();
    assert_eq!(
        (retried.agent.as_str(), retried.model.as_deref()),
        ("claude", Some(OPUS))
    );
    wait_outcome(&mut lead, &second, wire::ItemRunOutcome::Completed).await;
    assert_spawned_on(&lead.log, "claude", Some(OPUS));

    std::fs::remove_file(&lead.log).unwrap();
    let other = create_item(&lead.daemon, "defaults", "high").await;
    let enqueued = rpc(
        &lead.daemon,
        "runner.enqueue",
        json!({ "project": "demo", "item_ids": [other.id], "deliver": false }),
    )
    .await;
    let third = enqueued["created"][0]["taskId"]
        .as_str()
        .unwrap()
        .to_string();
    wait_outcome(&mut lead, &third, wire::ItemRunOutcome::Completed).await;
    assert_spawned_on(&lead.log, "opencode", Some(LUNA));
    lead.daemon.shutdown().await;
}
