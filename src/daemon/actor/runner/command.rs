use tokio::sync::oneshot;

use warpforge_protocol as wire;

use super::checkout::{GiveBack, ReturnPoint};
use super::deliver::Delivery;
use super::tasks::NewFactoryTask;

type Reply<T> = oneshot::Sender<Result<T, String>>;

pub enum RunnerCommand {
    Status {
        project: String,
        reply: Reply<wire::RunnerStatus>,
    },
    /// One Factory task per backlog item, with one shared configuration.
    Enqueue {
        project: String,
        item_ids: Vec<String>,
        config: wire::FactoryConfig,
        origin_task: Option<String>,
        reply: Reply<wire::EnqueueResult>,
    },
    /// A Factory task from the New Task dialog, with its own prompt.
    CreateTask {
        task: Box<NewFactoryTask>,
        reply: Reply<wire::CreatedFactoryTask>,
    },
    /// Cancel a queued task before it starts.
    Dequeue {
        project: String,
        task_id: String,
        reply: Reply<wire::RunnerStatus>,
    },
    Reorder {
        project: String,
        task_ids: Vec<String>,
        reply: Reply<wire::RunnerStatus>,
    },
    /// Start a queued task past the project's limits.
    StartNow {
        project: String,
        task_id: String,
        reply: Reply<wire::RunnerStatus>,
    },
    /// A new Factory task configured like a finished one.
    Retry {
        task_id: String,
        reply: Reply<wire::EnqueueResult>,
    },
    /// Try again to give back a held project checkout.
    RetryCheckout {
        project: String,
        reply: Reply<wire::RunnerStatus>,
    },
    /// The prompt body for a backlog item.
    Brief {
        project: String,
        item_id: String,
        reply: Reply<String>,
    },
    UpdateSettings {
        project: String,
        patch: wire::RunnerSettingsPatch,
        reply: Reply<wire::RunnerStatus>,
    },
    /// Stop every running Factory task and remove the queued ones.
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
        task_id: String,
        run_id: String,
        cost_usd: Option<f64>,
        delivery: Option<Delivery>,
    },
    /// The project checkout was inspected before a checkout-mode run.
    CheckoutInspected {
        project: String,
        task_id: String,
        result: Result<ReturnPoint, wire::RunnerWait>,
    },
    /// The project checkout was switched to the task branch, or refused.
    CheckoutSwitched {
        project: String,
        task_id: String,
        result: Result<String, wire::RunnerWait>,
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
