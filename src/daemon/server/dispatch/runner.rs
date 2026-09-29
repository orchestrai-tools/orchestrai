//! Server dispatcher topic: the backlog runner (`runner.*`, ADR 0023).

use serde_json::json;
use tokio::sync::oneshot;
use warpforge_protocol as wire;

use crate::daemon::actor::runner::RunnerCommand;
use crate::daemon::actor::{Command, DaemonHandle};

type Reply<T> = oneshot::Sender<Result<T, String>>;

async fn ask<T: serde::Serialize>(
    handle: &DaemonHandle,
    build: impl FnOnce(Reply<T>) -> RunnerCommand,
) -> Result<serde_json::Value, wire::RpcError> {
    let (tx, rx) = oneshot::channel();
    handle.send(Command::Runner(build(tx))).await;
    rx.await
        .unwrap_or_else(|_| Err("daemon dropped the reply".into()))
        .map(|value| json!(value))
        .map_err(|message| wire::RpcError {
            code: wire::ErrorCode::InvalidRequest,
            message,
        })
}

pub(super) async fn runner(
    handle: &DaemonHandle,
    method: wire::Method,
) -> Result<serde_json::Value, wire::RpcError> {
    match method {
        wire::Method::RunnerStatus { project } => {
            ask(handle, |reply| RunnerCommand::Status { project, reply }).await
        }
        wire::Method::RunnerEnqueue {
            project,
            item_ids,
            workflow,
            agent,
            model,
            origin_task,
        } => {
            ask(handle, |reply| RunnerCommand::Enqueue {
                project,
                item_ids,
                workflow,
                agent,
                model,
                origin_task,
                reply,
            })
            .await
        }
        wire::Method::RunnerDequeue { project, item_id } => {
            ask(handle, |reply| RunnerCommand::Dequeue {
                project,
                item_id,
                reply,
            })
            .await
        }
        wire::Method::RunnerReorder { project, item_ids } => {
            ask(handle, |reply| RunnerCommand::Reorder {
                project,
                item_ids,
                reply,
            })
            .await
        }
        wire::Method::RunnerUpdateSettings { project, patch } => {
            ask(handle, |reply| RunnerCommand::UpdateSettings {
                project,
                patch,
                reply,
            })
            .await
        }
        wire::Method::RunnerRuns { project, limit } => {
            let runs = ask(handle, |reply| RunnerCommand::Runs {
                project,
                limit,
                reply,
            })
            .await?;
            Ok(json!({ "runs": runs }))
        }
        _ => Err(wire::RpcError {
            code: wire::ErrorCode::InvalidRequest,
            message: "not a runner method".into(),
        }),
    }
}
