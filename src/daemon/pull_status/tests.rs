use std::collections::{HashMap, VecDeque};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use anyhow::anyhow;
use tokio::sync::broadcast;
use warpforge_protocol as wire;

use super::gh::parse_pull_list;
use super::{Event, Fetcher, PullTarget, PullWatch};

type Scripted = anyhow::Result<Option<wire::TaskPullRequest>>;

fn pull(state: wire::TaskPullState, checks: Option<wire::PullChecks>) -> wire::TaskPullRequest {
    wire::TaskPullRequest {
        number: 7,
        title: "Fix it".into(),
        url: "https://github.com/acme/widgets/pull/7".into(),
        state,
        checks,
        head_oid: None,
    }
}

/// A fetcher that answers from a script and counts its calls.
fn scripted(answers: Vec<Scripted>) -> (Fetcher, Arc<AtomicUsize>) {
    let queue = Arc::new(Mutex::new(VecDeque::from(answers)));
    let calls = Arc::new(AtomicUsize::new(0));
    let counter = Arc::clone(&calls);
    let fetch: Fetcher = Arc::new(move |_target| {
        counter.fetch_add(1, Ordering::SeqCst);
        let next = queue.lock().unwrap().pop_front().unwrap_or(Ok(None));
        Box::pin(async move { next })
    });
    (fetch, calls)
}

fn targets(ids: &[&str]) -> HashMap<String, PullTarget> {
    ids.iter()
        .map(|id| {
            (
                id.to_string(),
                PullTarget {
                    worktree: format!("/wt/{id}"),
                    base_branch: Some("main".into()),
                },
            )
        })
        .collect()
}

async fn next_pull_event(
    rx: &mut broadcast::Receiver<Event>,
) -> (String, Option<wire::TaskPullRequest>) {
    let event = tokio::time::timeout(Duration::from_secs(2), rx.recv())
        .await
        .expect("no event")
        .unwrap();
    match event {
        Event::TaskPullRequest {
            task_id,
            pull_request,
        } => (task_id, pull_request),
        _ => panic!("unexpected event"),
    }
}

async fn settle() {
    for _ in 0..20 {
        tokio::task::yield_now().await;
    }
}

#[tokio::test]
async fn a_change_is_pushed_once_and_a_fresh_entry_is_not_refetched() {
    let open = pull(wire::TaskPullState::Open, Some(wire::PullChecks::Pending));
    let (fetch, calls) = scripted(vec![Ok(Some(open.clone()))]);
    let watch = Arc::new(PullWatch::new(fetch));
    let (events, mut rx) = broadcast::channel(16);

    let cached = watch.refresh(targets(&["t1"]), None, Duration::from_secs(60), &events);
    assert!(cached.is_empty(), "the first answer arrives as an event");
    assert_eq!(
        next_pull_event(&mut rx).await,
        ("t1".into(), Some(open.clone()))
    );

    let cached = watch.refresh(targets(&["t1"]), None, Duration::from_secs(60), &events);
    settle().await;
    assert_eq!(cached.get("t1"), Some(&open));
    assert_eq!(calls.load(Ordering::SeqCst), 1);
    assert!(rx.try_recv().is_err());
}

#[tokio::test]
async fn a_failed_fetch_keeps_the_last_known_state() {
    let merged = pull(wire::TaskPullState::Merged, None);
    let (fetch, calls) = scripted(vec![
        Ok(Some(merged.clone())),
        Err(anyhow!("gh: not logged in")),
    ]);
    let watch = Arc::new(PullWatch::new(fetch));
    let (events, mut rx) = broadcast::channel(16);

    watch.refresh(targets(&["t1"]), None, Duration::ZERO, &events);
    next_pull_event(&mut rx).await;
    watch.refresh(targets(&["t1"]), None, Duration::ZERO, &events);
    settle().await;

    assert_eq!(calls.load(Ordering::SeqCst), 2);
    assert!(rx.try_recv().is_err(), "an error must not clear the badge");
    let cached = watch.refresh(targets(&["t1"]), None, Duration::from_secs(60), &events);
    assert_eq!(cached.get("t1"), Some(&merged));
}

#[tokio::test]
async fn a_task_that_lost_its_worktree_is_cleared_on_clients() {
    let open = pull(wire::TaskPullState::Open, None);
    let (fetch, _) = scripted(vec![Ok(Some(open))]);
    let watch = Arc::new(PullWatch::new(fetch));
    let (events, mut rx) = broadcast::channel(16);

    watch.refresh(targets(&["t1"]), None, Duration::ZERO, &events);
    next_pull_event(&mut rx).await;

    let cached = watch.refresh(targets(&[]), None, Duration::ZERO, &events);
    assert!(cached.is_empty());
    assert_eq!(next_pull_event(&mut rx).await, ("t1".into(), None));
}

#[tokio::test]
async fn a_scoped_refresh_fetches_only_the_named_tasks() {
    let (fetch, calls) = scripted(vec![]);
    let watch = Arc::new(PullWatch::new(fetch));
    let (events, _rx) = broadcast::channel(16);

    let only = ["t2".to_string()];
    watch.refresh(targets(&["t1", "t2"]), Some(&only), Duration::ZERO, &events);
    settle().await;
    assert_eq!(calls.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn forgetting_a_task_clears_its_badge() {
    let open = pull(wire::TaskPullState::Open, None);
    let (fetch, _) = scripted(vec![Ok(Some(open))]);
    let watch = Arc::new(PullWatch::new(fetch));
    let (events, mut rx) = broadcast::channel(16);

    watch.refresh(targets(&["t1"]), None, Duration::ZERO, &events);
    next_pull_event(&mut rx).await;
    watch.forget("t1", &events);
    assert_eq!(next_pull_event(&mut rx).await, ("t1".into(), None));
}

#[test]
fn the_open_pull_request_wins_over_older_closed_ones() {
    let json = br#"[
        {"number": 9, "title": "Old", "url": "u9", "state": "CLOSED", "isDraft": false, "statusCheckRollup": []},
        {"number": 12, "title": "New", "url": "u12", "state": "OPEN", "isDraft": true, "statusCheckRollup": []}
    ]"#;
    let pull = parse_pull_list(json).unwrap().unwrap();
    assert_eq!(pull.number, 12);
    assert_eq!(pull.state, wire::TaskPullState::Draft);
    assert_eq!(pull.checks, None);
}

#[test]
fn no_pull_request_reads_none_and_merged_reads_merged() {
    assert_eq!(parse_pull_list(b"[]").unwrap(), None);
    let json = br#"[{"number": 3, "title": "t", "url": "u", "state": "MERGED", "statusCheckRollup": null}]"#;
    let pull = parse_pull_list(json).unwrap().unwrap();
    assert_eq!(pull.state, wire::TaskPullState::Merged);
}

#[test]
fn checks_roll_up_failure_first_then_pending() {
    let rollup = |checks: &str| {
        let json = format!(
            r#"[{{"number": 1, "title": "t", "url": "u", "state": "OPEN", "statusCheckRollup": {checks}}}]"#
        );
        parse_pull_list(json.as_bytes()).unwrap().unwrap().checks
    };
    let passed = r#"{"__typename": "CheckRun", "status": "COMPLETED", "conclusion": "SUCCESS"}"#;
    let skipped = r#"{"__typename": "CheckRun", "status": "COMPLETED", "conclusion": "SKIPPED"}"#;
    let running = r#"{"__typename": "CheckRun", "status": "IN_PROGRESS", "conclusion": ""}"#;
    let failed = r#"{"__typename": "CheckRun", "status": "COMPLETED", "conclusion": "FAILURE"}"#;
    let status_pending = r#"{"__typename": "StatusContext", "state": "PENDING"}"#;
    let status_error = r#"{"__typename": "StatusContext", "state": "ERROR"}"#;

    assert_eq!(
        rollup(&format!("[{passed},{skipped}]")),
        Some(wire::PullChecks::Passing)
    );
    assert_eq!(
        rollup(&format!("[{passed},{running}]")),
        Some(wire::PullChecks::Pending)
    );
    assert_eq!(
        rollup(&format!("[{running},{failed}]")),
        Some(wire::PullChecks::Failing)
    );
    assert_eq!(
        rollup(&format!("[{status_pending}]")),
        Some(wire::PullChecks::Pending)
    );
    assert_eq!(
        rollup(&format!("[{passed},{status_error}]")),
        Some(wire::PullChecks::Failing)
    );
}
