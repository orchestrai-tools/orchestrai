//! Live `service.log` events carry the seq the line got in the retained ring,
//! so a client can key lines and spot gaps against `service.logs`.

use super::service_deps::{project, start_all, stop_all, wait_for_log, PROJECT};
use crate::daemon::actor::{Daemon, Event};
use crate::service::tests::bounded;

#[tokio::test]
async fn live_log_lines_carry_their_ring_seq() {
    bounded(async {
        let (_dir, entry) =
            project("name: x\nservices:\n  web:\n    command: echo one; echo two; sleep 30\n");
        let handle = Daemon::spawn(vec![entry], None);
        let mut events = handle.subscribe();
        start_all(&handle).await;
        wait_for_log(&handle, "web", "two").await;

        let mut seen = Vec::new();
        while let Ok(event) = events.try_recv() {
            if let Event::ServiceLog {
                project, seq, line, ..
            } = event
            {
                assert_eq!(project, PROJECT);
                seen.push((seq, line));
            }
        }
        let one = seen
            .iter()
            .find(|(_, line)| line == "one")
            .expect("one was broadcast");
        let two = seen
            .iter()
            .find(|(_, line)| line == "two")
            .expect("two was broadcast");
        assert!(one.0 < two.0, "{seen:?}");
        let mut seqs: Vec<u64> = seen.iter().map(|(seq, _)| *seq).collect();
        seqs.dedup();
        assert_eq!(
            seqs.len(),
            seen.len(),
            "every live line has its own seq: {seen:?}"
        );

        stop_all(&handle).await;
        handle.shutdown().await;
    })
    .await;
}

#[tokio::test]
async fn refused_start_broadcasts_its_diagnostic_without_a_reload() {
    bounded(async {
        let (_dir, entry) = project(
            "name: x\nservices:\n  web:\n    command: sleep 30\n    healthcheck:\n      url: http://127.0.0.1:${missing.port}/\n",
        );
        let handle = Daemon::spawn(vec![entry], None);
        let mut events = handle.subscribe();
        start_all(&handle).await;
        let logs = wait_for_log(&handle, "web", "missing.port").await;
        let diagnostic = logs.iter().find(|line| line.contains("missing.port")).unwrap();
        let mut found = false;
        while let Ok(event) = events.try_recv() {
            if let Event::ServiceLog { line, seq, .. } = event {
                if &line == diagnostic {
                    assert_eq!(seq, 0);
                    found = true;
                }
            }
        }
        assert!(found, "startup diagnostic must reach subscribed clients");
        stop_all(&handle).await;
    }).await;
}
