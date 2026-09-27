use crate::daemon::actor::lifecycle::*;

#[test]
fn record_inserts_request() {
    let mut pending = PendingPermissions::default();
    pending.record("task1", "req1");
    assert!(pending.has_pending("task1"));
}

#[test]
fn duplicate_record_is_noop() {
    let mut pending = PendingPermissions::default();
    pending.record("task1", "req1");
    pending.record("task1", "req1");
    assert_eq!(pending.by_task.get("task1").unwrap().len(), 1);
}

#[test]
fn resolve_removes_exact_request_among_multiple() {
    let mut pending = PendingPermissions::default();
    pending.record("task1", "req1");
    pending.record("task1", "req2");
    pending.record("task1", "req3");
    pending.resolve("task1", "req2", "allow").unwrap();
    assert!(pending.has_pending("task1"));
    assert_eq!(pending.by_task.get("task1").unwrap().len(), 2);
    assert!(pending.by_task.get("task1").unwrap().contains("req1"));
    assert!(!pending.by_task.get("task1").unwrap().contains("req2"));
    assert!(pending.by_task.get("task1").unwrap().contains("req3"));
}

#[test]
fn resolve_unknown_request_is_refused() {
    let mut pending = PendingPermissions::default();
    pending.record("task1", "req1");
    assert!(pending.resolve("task1", "unknown", "allow").is_err());
    assert!(pending.has_pending("task1"));
    assert_eq!(pending.by_task.get("task1").unwrap().len(), 1);
}

#[test]
fn resolve_unknown_task_is_refused() {
    let mut pending = PendingPermissions::default();
    pending.record("task1", "req1");
    assert!(pending.resolve("unknown_task", "req1", "allow").is_err());
    assert!(pending.has_pending("task1"));
}

#[test]
fn resolve_last_request_cleans_up_empty_key() {
    let mut pending = PendingPermissions::default();
    pending.record("task1", "req1");
    pending.resolve("task1", "req1", "allow").unwrap();
    assert!(!pending.has_pending("task1"));
    assert!(!pending.by_task.contains_key("task1"));
}

/// First-writer-wins: the second answer is refused and told what won.
#[test]
fn second_answer_is_refused_with_the_winning_outcome() {
    let mut pending = PendingPermissions::default();
    pending.record("task1", "req1");
    pending.resolve("task1", "req1", "deny").unwrap();

    let error = pending.resolve("task1", "req1", "allow").unwrap_err();
    assert_eq!(
        error,
        PermissionAnswerError::AlreadyResolved {
            outcome: Some("deny".to_string())
        }
    );
    assert!(!pending.has_pending("task1"));
}

#[test]
fn cleanup_task_removes_all_requests() {
    let mut pending = PendingPermissions::default();
    pending.record("task1", "req1");
    pending.record("task1", "req2");
    pending.record("task2", "req3");
    pending.cleanup_task("task1");
    assert!(!pending.has_pending("task1"));
    assert!(pending.has_pending("task2"));
    // The winning outcome is forgotten with the task, so a very late answer
    // cannot report a winner it no longer knows.
    assert_eq!(
        pending.resolve("task1", "req1", "allow").unwrap_err(),
        PermissionAnswerError::AlreadyResolved { outcome: None }
    );
}

#[test]
fn has_pending_false_for_unknown_task() {
    let pending = PendingPermissions::default();
    assert!(!pending.has_pending("unknown"));
}
