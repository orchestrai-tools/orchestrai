use crate::daemon::actor::project::{
    resolve_terminal_cwd, runtime_checkout_note, runtime_service_line, RuntimeCheckout,
};
use crate::service::ServiceStatus;

#[test]
fn runtime_note_names_the_main_checkout_for_a_worktree_task() {
    let checkout = RuntimeCheckout {
        root: "/repo".into(),
        worktree: "/repo/.worktrees/t_1".into(),
    };
    let note = runtime_checkout_note(Some(&checkout));
    assert!(note.contains("/repo"));
    assert!(note.contains("/repo/.worktrees/t_1"));
    assert!(note.contains("not your worktree"));
    assert!(note.contains("Restarting a service will not pick up your edits"));
}

#[test]
fn runtime_note_keeps_the_plain_wording_for_a_root_task() {
    let note = runtime_checkout_note(None);
    assert!(note.contains("already running for this project"));
    assert!(!note.contains("worktree"));
    assert!(!note.contains("Restarting"));
}

#[test]
fn runtime_service_line_labels_a_starting_service() {
    assert_eq!(
        runtime_service_line("web", &ServiceStatus::Starting, 4001),
        "- web → http://localhost:4001 (starting)"
    );
    assert_eq!(
        runtime_service_line("web", &ServiceStatus::Running, 4001),
        "- web → http://localhost:4001"
    );
}

#[test]
fn terminal_cwd_uses_a_worktree_that_exists_on_disk() {
    let dir = tempfile::tempdir().unwrap();
    let worktree = dir.path().to_str().unwrap();
    assert_eq!(resolve_terminal_cwd("/repo", Some(worktree)), worktree);
}

#[test]
fn terminal_cwd_falls_back_to_the_project_root() {
    assert_eq!(
        resolve_terminal_cwd("/repo", Some("/nope/does-not-exist")),
        "/repo"
    );
    assert_eq!(resolve_terminal_cwd("/repo", None), "/repo");
}
