use crate::daemon::actor::*;
use crate::orchestration::OrchCommand;
use std::time::Duration;
use tokio::sync::{mpsc, oneshot};

/// An orchestrator awaiting a daemon callback cannot answer List yet. Holding
/// that exact reply must leave the daemon free to process the callback.
#[tokio::test]
async fn listing_an_orchestration_does_not_block_its_daemon_callback() {
    let daemon = Daemon::spawn(Vec::new(), None);
    let (sender, mut orchestrator) = mpsc::channel(1);
    let (tx, rx) = oneshot::channel();
    daemon
        .send(Command::SetOrchestratorSender { sender, reply: tx })
        .await;
    rx.await.unwrap();

    let (tx, mut listing) = oneshot::channel();
    daemon.send(Command::ListOrchestrations { reply: tx }).await;
    let reply = match tokio::time::timeout(Duration::from_secs(2), orchestrator.recv())
        .await
        .unwrap()
        .unwrap()
    {
        OrchCommand::List(reply) => reply,
        other => panic!("unexpected command: {other:?}"),
    };
    assert!(matches!(
        listing.try_recv(),
        Err(oneshot::error::TryRecvError::Empty)
    ));
    // The old handler was waiting inline for `reply` here, so this callback
    // could never finish and every project's later command was wedged too.
    tokio::time::timeout(Duration::from_secs(2), daemon.read_inbox("callback"))
        .await
        .expect("the daemon callback must stay responsive");
    reply.send(Vec::new()).unwrap();
    assert!(listing.await.unwrap().is_empty());
    daemon.shutdown().await;
}
