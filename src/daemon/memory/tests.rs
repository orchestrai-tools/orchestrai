use std::path::Path;

use super::*;

fn open() -> MemoryStore {
    MemoryStore::open_at(Path::new(":memory:")).unwrap()
}

#[test]
fn roundtrip_store_search_list_update_delete_stats() {
    let store = open();
    let m = store
        .store(
            "the api listens on port 8080",
            None,
            Some("fact"),
            Some(&["infra".to_string()]),
            None,
            None,
        )
        .unwrap();
    assert_eq!(m.scope, "global");
    assert_eq!(m.kind, "fact");
    assert_eq!(m.tags, vec!["infra".to_string()]);

    let hits = store.search("api", None, None, None).unwrap();
    assert_eq!(hits.len(), 1);
    assert_eq!(hits[0].id, m.id);

    let listed = store.list(None, Some("fact"), None, None).unwrap();
    assert_eq!(listed.len(), 1);

    let updated = store.update(&m.id, "the api listens on port 9090").unwrap();
    assert_eq!(updated.content, "the api listens on port 9090");
    assert!(store.search("8080", None, None, None).unwrap().is_empty());
    assert_eq!(store.search("9090", None, None, None).unwrap().len(), 1);

    let stats = store.stats().unwrap();
    assert_eq!(stats.global_count, 1);
    assert_eq!(stats.project_count, 0);
    assert_eq!(stats.embedding_mode, "fts");

    store.delete(&m.id).unwrap();
    assert_eq!(store.stats().unwrap().global_count, 0);
}

#[test]
fn global_only_matrix() {
    let mut store = open();
    store.config.project = false;

    let err = store
        .store("x", None, None, None, Some("proj"), None)
        .unwrap_err();
    assert!(err.message().contains("memory.project"));

    store
        .store("global fact", None, None, None, None, None)
        .unwrap();
    let hits = store.search("fact", Some("all"), None, None).unwrap();
    assert_eq!(hits.len(), 1);
    assert_eq!(hits[0].scope, "global");
}

#[test]
fn project_only_matrix() {
    let mut store = open();
    store.config.global = false;

    assert!(store.store("x", None, None, None, None, None).is_err());

    let m = store
        .store("project fact", None, None, None, Some("proj"), None)
        .unwrap();
    assert_eq!(m.scope, "project:proj");

    let stats = store.stats().unwrap();
    assert_eq!(stats.project_count, 1);
    assert_eq!(stats.global_count, 0);
    assert!(!stats.scopes_enabled.global);
    assert!(stats.scopes_enabled.project);
}

#[test]
fn session_scope_is_rejected() {
    let store = open();
    let err = store
        .store("x", Some("session:abc"), None, None, None, None)
        .unwrap_err();
    assert!(err.message().contains("session"));
}

#[test]
fn search_treats_punctuation_and_operators_literally() {
    let store = open();
    let m = store
        .store(
            "tracked in issue #82 for the memory screen",
            None,
            None,
            None,
            None,
            None,
        )
        .unwrap();

    for query in [
        "#82",
        "#",
        "issue #82",
        "\"quoted",
        "a AND",
        "NOT",
        "NEAR(",
        "c++ *",
    ] {
        store.search(query, None, None, None).unwrap();
    }
    let hits = store.search("issue #82", None, None, None).unwrap();
    assert_eq!(hits.len(), 1);
    assert_eq!(hits[0].id, m.id);
    assert_eq!(
        store.search("issue NOT", None, None, None).unwrap().len(),
        1
    );
}

/// A store plus one project overlay holding a memory, both under `dir`.
fn with_overlay(dir: &Path) -> (MemoryStore, String, String) {
    let mut store = open();
    store.projects_root = Some(dir.to_path_buf());
    let global = store
        .store("global fact", None, None, None, None, None)
        .unwrap()
        .id;
    let path = dir.join("proj1/.orchestrai/memory.db");
    let conn = MemoryStore::open_project_at(&path, false).unwrap();
    let overlay = MemoryStore::store_on_conn(
        &conn,
        &store.embed,
        Some("proj1".into()),
        "project:proj1".into(),
        "overlay fact",
        None,
        None,
        Some("t_7"),
    )
    .unwrap();
    (store, global, overlay.id)
}

#[test]
fn update_delete_and_edges_reach_overlay_memories() {
    let dir = tempfile::tempdir().unwrap();
    let (store, global, overlay) = with_overlay(dir.path());
    assert_eq!(store.list(None, None, None, None).unwrap().len(), 2);

    let updated = store.update(&overlay, "overlay fact, revised").unwrap();
    assert_eq!(updated.content, "overlay fact, revised");
    assert_eq!(updated.created_by.as_deref(), Some("t_7"));
    assert_eq!(store.search("revised", None, None, None).unwrap().len(), 1);

    store.add_edge(&overlay, &global, "supports").unwrap();
    store.add_edge(&global, &overlay, "related").unwrap();
    assert_eq!(store.list_edges(&overlay).unwrap().len(), 2);
    assert_eq!(store.list_edges(&global).unwrap().len(), 2);

    store.delete(&overlay).unwrap();
    assert!(store.list_edges(&global).unwrap().is_empty());
    assert!(store.delete(&overlay).is_err());
    assert_eq!(store.list(None, None, None, None).unwrap().len(), 1);
}

#[test]
fn unknown_ids_still_error() {
    let dir = tempfile::tempdir().unwrap();
    let (store, global, _) = with_overlay(dir.path());
    assert!(store.update("nope", "x").is_err());
    assert!(store.delete("nope").is_err());
    assert!(store.list_edges("nope").is_err());
    assert!(store.add_edge(&global, "nope", "related").is_err());
    assert!(store.add_edge("nope", &global, "related").is_err());
}

#[test]
fn store_persists_the_writing_task() {
    let store = open();
    let m = store
        .store("a fact", None, None, None, None, Some("t_1"))
        .unwrap();
    assert_eq!(m.created_by.as_deref(), Some("t_1"));
    let listed = store.list(None, None, None, None).unwrap();
    assert_eq!(listed[0].created_by.as_deref(), Some("t_1"));
}

fn propose(store: &MemoryStore, kind: &str, ids: &[&str]) -> i64 {
    let conn = store.guard().unwrap();
    conn.execute(
        "INSERT INTO memory_compaction_log (proposal_type,target_ids,reason,status,created_at) VALUES (?1,?2,'r','pending',0)",
        rusqlite::params![kind, ids.join(",")],
    )
    .unwrap();
    conn.last_insert_rowid()
}

#[test]
fn approving_a_duplicate_keeps_the_oldest_and_deletes_the_rest() {
    let store = open();
    let ids: Vec<String> = ["same", "same", "same"]
        .iter()
        .map(|c| store.store(c, None, None, None, None, None).unwrap().id)
        .collect();
    store
        .guard()
        .unwrap()
        .execute(
            "UPDATE memories SET created_at = CASE id WHEN ?1 THEN 5 WHEN ?2 THEN 1 ELSE 9 END",
            rusqlite::params![ids[0], ids[1]],
        )
        .unwrap();
    let refs: Vec<&str> = ids.iter().map(String::as_str).collect();
    let proposal = propose(&store, "duplicate", &refs);

    assert_eq!(
        store.resolve_compaction(proposal, true, true).unwrap(),
        "applied"
    );

    let left = store.list(None, None, None, None).unwrap();
    assert_eq!(left.len(), 1);
    assert_eq!(left[0].id, ids[1]);
    // Applying again is harmless: the keeper is the only target left.
    store.resolve_compaction(proposal, true, true).unwrap();
    assert_eq!(store.list(None, None, None, None).unwrap().len(), 1);
}

#[test]
fn approving_stale_deletes_and_rejecting_changes_nothing() {
    let store = open();
    let a = store.store("old", None, None, None, None, None).unwrap().id;
    let b = store
        .store("older", None, None, None, None, None)
        .unwrap()
        .id;

    let keep = propose(&store, "stale", &[&a]);
    assert_eq!(
        store.resolve_compaction(keep, false, true).unwrap(),
        "rejected"
    );
    assert_eq!(store.list(None, None, None, None).unwrap().len(), 2);

    let drop = propose(&store, "stale", &[&b, "already-gone"]);
    store.resolve_compaction(drop, true, true).unwrap();
    let left = store.list(None, None, None, None).unwrap();
    assert_eq!(left.len(), 1);
    assert_eq!(left[0].id, a);
}

#[test]
fn approving_a_merge_only_records_the_decision() {
    let store = open();
    let a = store.store("one", None, None, None, None, None).unwrap().id;
    let b = store.store("two", None, None, None, None, None).unwrap().id;
    let proposal = propose(&store, "merge", &[&a, &b]);

    assert_eq!(
        store.resolve_compaction(proposal, true, true).unwrap(),
        "applied"
    );
    assert_eq!(store.list(None, None, None, None).unwrap().len(), 2);
}

#[test]
fn approving_without_apply_deletes_nothing_and_can_be_applied_later() {
    let store = open();
    let a = store.store("old", None, None, None, None, None).unwrap().id;
    let b = store.store("old", None, None, None, None, None).unwrap().id;
    let proposal = propose(&store, "duplicate", &[&a, &b]);

    assert_eq!(
        store.resolve_compaction(proposal, true, false).unwrap(),
        "applied"
    );
    assert_eq!(store.list(None, None, None, None).unwrap().len(), 2);
    assert!(store.resolve_compaction(proposal, true, false).is_err());
    assert!(store.resolve_compaction(proposal, false, false).is_err());

    assert_eq!(
        store.resolve_compaction(proposal, true, true).unwrap(),
        "applied"
    );
    assert_eq!(store.list(None, None, None, None).unwrap().len(), 1);
}

#[test]
fn rejecting_never_reopens_an_approved_proposal() {
    let store = open();
    let a = store.store("x", None, None, None, None, None).unwrap().id;
    let proposal = propose(&store, "stale", &[&a]);
    store.resolve_compaction(proposal, true, false).unwrap();
    assert!(store.resolve_compaction(proposal, false, true).is_err());
    assert_eq!(store.list(None, None, None, None).unwrap().len(), 1);
}
