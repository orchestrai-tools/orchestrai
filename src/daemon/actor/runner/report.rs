//! What a Factory pipeline's own summary says once its delivery reports, in
//! place of the note that it is being delivered.

use super::deliver::Delivery;
use crate::daemon::actor::Daemon;
use crate::daemon::runner::DELIVERING_NOTE;

fn delivery_line(delivery: &Delivery) -> String {
    match delivery {
        Delivery::Opened {
            url,
            number: Some(number),
        } => format!("Draft PR #{number} opened: {url}"),
        Delivery::Opened { url, number: None } => format!("Draft PR opened: {url}"),
        Delivery::NoChanges => "No changes to deliver.".to_string(),
        Delivery::Failed(reason) => format!("Delivery failed: {reason}"),
    }
}

impl Daemon {
    /// Replace the delivering note in `task_id`'s summary with what the
    /// delivery did, and post it to the pipeline's timeline.
    pub(super) fn runner_report_delivery(&mut self, task_id: &str, delivery: &Delivery) {
        let line = delivery_line(delivery);
        let Some(run) = self.workflow_runs.get_mut(task_id) else {
            return;
        };
        if let Some(report) = run.report.as_mut() {
            *report = report.replace(DELIVERING_NOTE, &line);
        }
        let run = run.clone();
        self.workflow_sync(&run);
        self.workflow_timeline(task_id, line);
    }
}
