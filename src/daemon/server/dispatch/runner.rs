//! Server dispatcher topic: the Factory (`runner.*`, ADR 0023).

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
            run_location,
            deliver,
            origin_task,
        } => {
            let config = wire::FactoryConfig {
                workflow,
                agent,
                model,
                run_location,
                deliver: deliver.unwrap_or(true),
            };
            ask(handle, |reply| RunnerCommand::Enqueue {
                project,
                item_ids,
                config,
                origin_task,
                reply,
            })
            .await
        }
        wire::Method::RunnerDequeue { project, task_id } => {
            ask(handle, |reply| RunnerCommand::Dequeue {
                project,
                task_id,
                reply,
            })
            .await
        }
        wire::Method::RunnerReorder { project, task_ids } => {
            ask(handle, |reply| RunnerCommand::Reorder {
                project,
                task_ids,
                reply,
            })
            .await
        }
        wire::Method::RunnerStartNow { project, task_id } => {
            ask(handle, |reply| RunnerCommand::StartNow {
                project,
                task_id,
                reply,
            })
            .await
        }
        wire::Method::RunnerRetry { task_id } => {
            ask(handle, |reply| RunnerCommand::Retry { task_id, reply }).await
        }
        wire::Method::RunnerRetryCheckout { project } => {
            ask(handle, |reply| RunnerCommand::RetryCheckout {
                project,
                reply,
            })
            .await
        }
        wire::Method::RunnerBrief { project, item_id } => {
            let prompt = ask(handle, |reply| RunnerCommand::Brief {
                project,
                item_id,
                reply,
            })
            .await?;
            Ok(json!({ "prompt": prompt }))
        }
        wire::Method::RunnerUpdateSettings { project, patch } => {
            ask(handle, |reply| RunnerCommand::UpdateSettings {
                project,
                patch,
                reply,
            })
            .await
        }
        wire::Method::RunnerStop { project } => {
            ask(handle, |reply| RunnerCommand::Stop { project, reply }).await
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
            message: "not a Factory method".into(),
        }),
    }
}

/// `task.create` in Factory mode: the Factory creates the task queued and
/// starts it when the project's limits allow.
/// @param handle the daemon
/// @param task what to create
/// @returns `{ taskId, started }`
pub(super) async fn create_factory_task(
    handle: &DaemonHandle,
    task: crate::daemon::actor::runner::NewFactoryTask,
) -> Result<serde_json::Value, wire::RpcError> {
    let created = ask(handle, |reply| RunnerCommand::CreateTask {
        task: Box::new(task),
        reply,
    })
    .await?;
    Ok(json!({ "taskId": created["taskId"], "started": created["started"] }))
}
