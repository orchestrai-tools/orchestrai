//! Server dispatcher topic: advisor mode (ADR 0022).

use crate::daemon::actor::advisor::{AdvisorAnswer, AdvisorTicket};
use crate::daemon::actor::{Command, DaemonHandle};
use serde_json::json;
use tokio::sync::oneshot;
use warpforge_protocol as wire;

pub(super) async fn advisor_ask(
    handle: &DaemonHandle,
    task_id: String,
    question: String,
    context: Option<String>,
) -> Result<serde_json::Value, wire::RpcError> {
    let (tx, rx) = oneshot::channel();
    handle
        .send(Command::AdvisorAsk {
            task_id,
            question,
            context,
            reply: tx,
        })
        .await;
    Ok(json!(settle(rx).await))
}

pub(super) async fn advisor_wait(
    handle: &DaemonHandle,
    task_id: String,
) -> Result<serde_json::Value, wire::RpcError> {
    let (tx, rx) = oneshot::channel();
    handle
        .send(Command::AdvisorWait { task_id, reply: tx })
        .await;
    Ok(json!(settle(rx).await))
}

/// Wait out the ticket's window. The consultation outlives a window that
/// ends first; `advisor.wait` picks it up again.
async fn settle(rx: oneshot::Receiver<Result<AdvisorTicket, String>>) -> wire::AdvisorReply {
    let ticket = match rx.await {
        Ok(Ok(ticket)) => ticket,
        Ok(Err(reason)) => return wire::AdvisorReply::Refused { reason },
        Err(_) => {
            return wire::AdvisorReply::Failed {
                reason: "the daemon is shutting down".into(),
            }
        }
    };
    match ticket {
        AdvisorTicket::Ready(answer) => reply(answer),
        AdvisorTicket::Waiting { answer, wait } => match tokio::time::timeout(wait, answer).await {
            Ok(Ok(answer)) => reply(answer),
            Ok(Err(_)) => wire::AdvisorReply::Failed {
                reason: "the consultation ended without an answer".into(),
            },
            Err(_) => wire::AdvisorReply::Pending {
                waited_secs: wait.as_secs(),
            },
        },
    }
}

fn reply(answer: AdvisorAnswer) -> wire::AdvisorReply {
    match answer.answer {
        Ok(text) => wire::AdvisorReply::Answered {
            answer: text,
            agent: answer.agent,
            model: answer.model,
        },
        Err(reason) => wire::AdvisorReply::Failed { reason },
    }
}
