use super::*;
use crate::daemon::Daemon;

/// A successful cancellation response must mean tasks were stopped. Legacy
/// graph cancellation currently lacks that boundary and must refuse honestly.
#[tokio::test]
async fn unsupported_legacy_cancellation_is_an_explicit_rpc_error() {
    let daemon = Daemon::spawn(Vec::new(), None);
    let lifecycle = Arc::new(ServerLifecycle::new(wire::DaemonOwner::External));
    let error = dispatch(
        &daemon,
        wire::Method::OrchestrateCancel {
            graph_id: "g_live".into(),
        },
        &lifecycle,
    )
    .await
    .expect_err("cancellation is not implemented, not a successful no-op");
    assert_eq!(error.code, wire::ErrorCode::InvalidRequest);
    assert!(error.message.contains("no tasks were stopped"));
    daemon.shutdown().await;
}
