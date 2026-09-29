use tokio::sync::oneshot;

use warpforge_protocol as wire;

use super::checkout::{GiveBack, ReturnPoint};
use super::deliver::Delivery;

type Reply<T> = oneshot::Sender<Result<T, String>>;

pub enum RunnerCommand {
    Status {
        project: String,
        reply: Reply<wire::RunnerStatus>,
    },
    Enqueue {
        project: String,
        item_ids: Vec<String>,
        workflow: Option<String>,
        agent: Option<String>,
        model: Option<String>,
        origin_task: Option<String>,
        reply: Reply<wire::RunnerStatus>,
    },
    Dequeue {
        project: String,
        item_id: String,
        reply: Reply<wire::RunnerStatus>,
    },
    Reorder {
        project: String,
        item_ids: Vec<String>,
        reply: Reply<wire::RunnerStatus>,
    },
    UpdateSettings {
        project: String,
        patch: wire::RunnerSettingsPatch,
        reply: Reply<wire::RunnerStatus>,
    },
    /// Pause, and stop every pipeline in flight; their items are queued again.
    Stop {
        project: String,
        reply: Reply<wire::RunnerStatus>,
    },
    Runs {
        project: String,
        limit: Option<u32>,
        reply: Reply<Vec<wire::ItemRun>>,
    },
    /// The one-minute automation timer: sweep lost tasks, then dispatch.
    Tick,
    /// Start what a project's gates allow, queued behind the command that freed a slot.
    Dispatch { project: String },
    /// The off-loop wrap-up of a finished pipeline: its cost, and for a
    /// successful one the delivery result.
    Finished {
        item_id: String,
        run_id: String,
        cost_usd: Option<f64>,
        delivery: Option<Delivery>,
    },
    /// The project checkout was inspected before a checkout-mode run.
    CheckoutInspected {
        project: String,
        task_id: String,
        result: Result<ReturnPoint, String>,
    },
    /// The project checkout was switched to the task branch, or refused.
    CheckoutSwitched {
        project: String,
        task_id: String,
        result: Result<String, String>,
    },
    /// Giving the project checkout back after a checkout-mode run.
    CheckoutReturned {
        project: String,
        task_id: String,
        result: GiveBack,
    },
    /// A watched task's pull request merged or closed.
    PullSettled {
        task_id: String,
        pull: wire::TaskPullRequest,
    },
    /// Replace how pull requests are opened, so tests never run `gh`.
    #[cfg(test)]
    SetPrOpener(super::deliver::PrOpener),
}
